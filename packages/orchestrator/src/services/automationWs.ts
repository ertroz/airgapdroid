import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';

class AutomationWebSocketHub {
  private wss: WebSocketServer | null = null;

  attach(_server?: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws) => {
      ws.send(
        JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this.wss) return;
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss?.emit('connection', ws, request);
    });
  }

  broadcast(payload: Record<string, unknown>): void {
    if (!this.wss) return;
    const msg = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
    });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  emitLog(line: string, level: 'info' | 'pass' | 'fail' | 'warn' = 'info'): void {
    this.broadcast({ type: 'console', line, level });
  }
}

export const automationWs = new AutomationWebSocketHub();
