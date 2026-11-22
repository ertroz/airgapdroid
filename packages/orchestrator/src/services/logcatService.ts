import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { LogcatEntry } from '../types.js';
import { getAdbBinary } from '../utils/adb.js';

const MAX_BUFFER_SIZE = 300;
const THREADTIME_REGEX =
  /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s*(.*)$/;
const BRIEF_REGEX = /^([VDIWEF])\/([^(]+)\(\s*(\d+)\):\s*(.*)$/;

class LogcatStreamer {
  private wss: WebSocketServer | null = null;
  private adbProcess: ChildProcess | null = null;
  private activeSerial: string | null = null;
  private buffer: LogcatEntry[] = [];
  private partialLine = '';

  attach(_server?: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws) => {
      // Send status & buffered history to newly connected client
      ws.send(
        JSON.stringify({
          type: 'status',
          connected: Boolean(this.adbProcess),
          serial: this.activeSerial,
        })
      );

      if (this.buffer.length > 0) {
        ws.send(JSON.stringify({ type: 'history', entries: this.buffer }));
      }

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string };
          if (msg.type === 'clear') {
            this.buffer = [];
            this.broadcast({ type: 'cleared' });
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch {
          // Ignore malformed client messages
        }
      });
    });
  }

  handleUpgrade(
    request: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer
  ): void {
    if (!this.wss) return;
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss?.emit('connection', ws, request);
    });
  }

  start(serial: string): void {
    this.stop();
    this.activeSerial = serial;
    this.partialLine = '';

    this.emitSystem(`Attaching live error logcat stream (adb -s ${serial} logcat *:E)...`);

    try {
      const child = spawn(getAdbBinary(), ['-s', serial, 'logcat', '-v', 'threadtime', '*:E'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.adbProcess = child;
      this.broadcast({ type: 'status', connected: true, serial });

      child.stdout.on('data', (chunk: Buffer) => {
        this.handleChunk(chunk.toString('utf8'));
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim();
        if (text) {
          this.emitSystem(`adb stderr: ${text}`);
        }
      });

      child.on('error', (err) => {
        this.emitSystem(`Failed to spawn adb logcat: ${err.message}`);
        this.adbProcess = null;
        this.broadcast({ type: 'status', connected: false, serial: this.activeSerial });
      });

      child.on('close', (code) => {
        if (this.adbProcess === child) {
          this.adbProcess = null;
          this.emitSystem(`Logcat stream stopped (exit code ${code ?? 'signal'}).`);
          this.broadcast({ type: 'status', connected: false, serial: this.activeSerial });
        }
      });
    } catch (err) {
      this.emitSystem(
        `Unable to start logcat stream: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  stop(): void {
    if (this.adbProcess) {
      const proc = this.adbProcess;
      this.adbProcess = null;
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    this.activeSerial = null;
    this.broadcast({ type: 'status', connected: false, serial: null });
  }

  clearBuffer(): void {
    this.buffer = [];
    this.broadcast({ type: 'cleared' });
  }

  getRecentErrors(limit = 50): string[] {
    return this.buffer
      .filter((entry) => entry.level === 'E' || entry.level === 'F')
      .slice(-limit)
      .map((entry) => entry.raw);
  }

  emitSystem(message: string): void {
    const entry: LogcatEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString().slice(11, 23),
      level: 'SYS',
      tag: 'QA-Studio',
      message,
      raw: `[QA-Studio] ${message}`,
    };
    this.pushAndBroadcast(entry);
  }

  private handleChunk(data: string): void {
    const combined = this.partialLine + data;
    const lines = combined.split(/\r?\n/);
    this.partialLine = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line || line.startsWith('--------- beginning of')) continue;
      const entry = this.parseLine(line);
      this.pushAndBroadcast(entry);
    }
  }

  private parseLine(raw: string): LogcatEntry {
    const threadMatch = raw.match(THREADTIME_REGEX);
    if (threadMatch) {
      return {
        id: crypto.randomUUID(),
        timestamp: threadMatch[1],
        pid: threadMatch[2],
        tid: threadMatch[3],
        level: threadMatch[4] as LogcatEntry['level'],
        tag: threadMatch[5].trim(),
        message: threadMatch[6],
        raw,
      };
    }

    const briefMatch = raw.match(BRIEF_REGEX);
    if (briefMatch) {
      return {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString().slice(11, 23),
        level: briefMatch[1] as LogcatEntry['level'],
        tag: briefMatch[2].trim(),
        pid: briefMatch[3],
        message: briefMatch[4],
        raw,
      };
    }

    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString().slice(11, 23),
      level: 'E',
      tag: 'AndroidRuntime',
      message: raw,
      raw,
    };
  }

  private pushAndBroadcast(entry: LogcatEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER_SIZE);
    }
    this.broadcast({ type: 'log', entry });
  }

  private broadcast(payload: Record<string, unknown>): void {
    if (!this.wss) return;
    const serialized = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }
}

export const logcatService = new LogcatStreamer();
