import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from '../config.js';
import { getAdbBinary } from '../utils/adb.js';
import { runCmd, sleep } from '../utils/shell.js';

const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

function resolveScreenAgentJar(): string {
  const execDir = path.dirname(process.execPath);
  const candidates = [
    process.env.QA_STUDIO_SCREEN_AGENT_JAR?.trim(),
    path.join(execDir, 'assets', 'qa-screen-agent.jar'),
    path.resolve(execDir, '..', 'Resources', 'assets', 'qa-screen-agent.jar'),
    path.resolve(currentDir, '../../assets/qa-screen-agent.jar'),
    path.resolve(process.cwd(), 'packages/orchestrator/assets/qa-screen-agent.jar'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(currentDir, '../../assets/qa-screen-agent.jar');
}

const SCREEN_AGENT_JAR = resolveScreenAgentJar();
const REMOTE_JAR_PATH = '/data/local/tmp/qa-screen-agent.jar';
const REMOTE_PID_PATH = '/data/local/tmp/qa-screen-agent.pid';
const REMOTE_LOG_PATH = '/data/local/tmp/qa-screen-agent.log';
const REMOTE_AGENT_PORT = 8889;

interface ActiveDeviceStream {
  serial: string;
  width: number;
  height: number;
  localPort: number;
  socket: net.Socket | null;
  clients: Set<WebSocket>;
  lastSentFrame: WeakMap<WebSocket, Buffer>;
  flushTimer: ReturnType<typeof setTimeout> | null;
  latestFrame: Buffer | null;
  stopped: boolean;
  reconnecting: boolean;
}

async function allocateFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not allocate TCP port')));
      }
    });
  });
}

async function detectDeviceResolution(serial: string): Promise<{ width: number; height: number }> {
  const adb = getAdbBinary();
  const res = await runCmd(adb, ['-s', serial, 'shell', 'wm', 'size'], { timeoutMs: 5000 });
  const text = `${res.stdout}\n${res.stderr}`;
  const overrideMatch = text.match(/Override size:\s*(\d+)x(\d+)/i);
  const physMatch = text.match(/Physical size:\s*(\d+)x(\d+)/i);
  const m = overrideMatch || physMatch;
  if (m) {
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (width >= 200 && height >= 200) return { width, height };
  }
  return { width: 1080, height: 1920 };
}

export async function supportsMediaCodecH264(serial: string): Promise<boolean> {
  const adb = getAdbBinary();
  // On Redroid, Codec2 H.264 encoder requires /dev/dma_heap/system or /dev/ion.
  // Without those kernel nodes, C2SoftAvcEnc fails with fetch linear block err=14 (C2_CORRUPTED).
  const devCheck = await runCmd(
    adb,
    [
      '-s',
      serial,
      'shell',
      'if [ -c /dev/dma_heap/system ] || [ -c /dev/ion ]; then echo HAS_DMA; else dumpsys media.player 2>/dev/null | grep -E -q "Encoder \\"(OMX\\.|c2\\.).*(avc|h264)" && getprop ro.hardware | grep -vq redroid && echo HAS_HW_OR_EMU; fi',
    ],
    { timeoutMs: 6000 }
  );
  return devCheck.stdout.includes('HAS_DMA') || devCheck.stdout.includes('HAS_HW_OR_EMU');
}

export function renderScreenViewerHtml(defaultSerial?: string): string {
  const safeDefaultSerial = (defaultSerial || '').replace(/[<>"'&]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <title>Android Live Screen — AirgapDroid</title>
  <style>
    * { box-sizing: border-box; user-select: none; -webkit-user-select: none; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #050507;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #050507;
    }
    canvas {
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      cursor: pointer;
      touch-action: none;
    }
    .overlay-status {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: rgba(5, 5, 7, 0.85);
      font-size: 12px;
      color: #a1a1aa;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    .overlay-status.hidden { opacity: 0; }
    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid rgba(255,255,255,0.12);
      border-top-color: #34d399;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hud {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px;
      border-radius: 999px;
      background: rgba(12, 12, 16, 0.86);
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(8px);
      opacity: 0.72;
      transition: opacity 0.15s ease;
      z-index: 20;
    }
    .stage:hover .hud, .hud:hover { opacity: 1; }
    .hud-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #f59e0b;
      margin: 0 3px;
    }
    .hud-dot.live { background: #34d399; }
    .hud button {
      appearance: none;
      border: none;
      background: transparent;
      color: #d4d4d8;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      font-size: 11px;
    }
    .hud button:hover {
      background: rgba(255,255,255,0.14);
      color: #fff;
    }
  </style>
</head>
<body tabindex="0">
  <div class="stage" id="stage">
    <canvas id="screen" width="540" height="960"></canvas>
    <div class="overlay-status" id="statusOverlay">
      <div class="spinner"></div>
      <div id="statusText">Connecting to Android screen stream...</div>
    </div>
    <div class="hud" title="Android Quick Controls">
      <span class="hud-dot" id="liveDot"></span>
      <button type="button" data-key="4" title="Back (Esc)">◀</button>
      <button type="button" data-key="3" title="Home">●</button>
      <button type="button" data-key="187" title="Recents">■</button>
      <button type="button" data-key="26" title="Power">⏻</button>
      <button type="button" id="reconnectBtn" title="Reconnect">↻</button>
    </div>
  </div>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var serial = params.get('serial') || '${safeDefaultSerial}';
      var canvas = document.getElementById('screen');
      var ctx = canvas.getContext('2d');
      var overlay = document.getElementById('statusOverlay');
      var statusText = document.getElementById('statusText');
      var liveDot = document.getElementById('liveDot');
      var devW = 1080, devH = 1920;
      var ws = null;
      var reconnectTimer = null;
      var pointerDown = false;
      var decoding = false;
      var pendingBlob = null;

      function getContentRect() {
        var rect = canvas.getBoundingClientRect();
        var cw = rect.width, ch = rect.height;
        var aspect = devW / devH;
        var rw = cw, rh = ch, rx = rect.left, ry = rect.top;
        if (cw / ch > aspect) {
          rw = ch * aspect;
          rx = rect.left + (cw - rw) / 2;
        } else {
          rh = cw / aspect;
          ry = rect.top + (ch - rh) / 2;
        }
        return { left: rx, top: ry, width: rw, height: rh };
      }

      function mapPoint(e) {
        var r = getContentRect();
        var nx = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
        var ny = Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height)));
        return { x: Math.round(nx * devW), y: Math.round(ny * devH) };
      }

      function sendJson(obj) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(obj));
        }
      }

      function finishDecode() {
        decoding = false;
        if (pendingBlob) {
          var next = pendingBlob;
          pendingBlob = null;
          drawBlob(next);
        }
      }

      function drawBlob(blob) {
        if (decoding) {
          pendingBlob = blob;
          return;
        }
        decoding = true;
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(blob).then(function (bmp) {
            if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
              canvas.width = bmp.width;
              canvas.height = bmp.height;
            }
            ctx.drawImage(bmp, 0, 0);
            bmp.close();
            overlay.classList.add('hidden');
            liveDot.classList.add('live');
            finishDecode();
          }).catch(function () {
            finishDecode();
          });
        } else {
          var url = URL.createObjectURL(blob);
          var img = new Image();
          img.onload = function () {
            if (canvas.width !== img.width || canvas.height !== img.height) {
              canvas.width = img.width;
              canvas.height = img.height;
            }
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            overlay.classList.add('hidden');
            liveDot.classList.add('live');
            finishDecode();
          };
          img.onerror = function () {
            URL.revokeObjectURL(url);
            finishDecode();
          };
          img.src = url;
        }
      }

      function connect() {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (ws) { try { ws.close(); } catch (e) {} }
        var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        var q = serial ? ('?serial=' + encodeURIComponent(serial)) : '';
        ws = new WebSocket(proto + '//' + window.location.host + '/ws/screen' + q);
        ws.binaryType = 'blob';
        statusText.textContent = 'Connecting to Android screen stream...';
        liveDot.classList.remove('live');

        ws.onmessage = function (ev) {
          if (typeof ev.data === 'string') {
            try {
              var msg = JSON.parse(ev.data);
              if (msg.type === 'meta') {
                if (msg.width) devW = msg.width;
                if (msg.height) devH = msg.height;
              } else if (msg.type === 'error') {
                overlay.classList.remove('hidden');
                statusText.textContent = msg.message || 'Screen stream error';
              }
            } catch (e) {}
            return;
          }
          drawBlob(ev.data);
        };

        ws.onclose = function () {
          liveDot.classList.remove('live');
          overlay.classList.remove('hidden');
          statusText.textContent = 'Reconnecting stream...';
          reconnectTimer = setTimeout(connect, 1500);
        };
      }

      canvas.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        document.body.focus();
        canvas.setPointerCapture(e.pointerId);
        pointerDown = true;
        var p = mapPoint(e);
        sendJson({ type: 'touch', action: 0, x: p.x, y: p.y });
      });

      canvas.addEventListener('pointermove', function (e) {
        if (!pointerDown) return;
        var p = mapPoint(e);
        sendJson({ type: 'touch', action: 2, x: p.x, y: p.y });
      });

      function endTouch(e) {
        if (!pointerDown) return;
        pointerDown = false;
        var p = mapPoint(e);
        sendJson({ type: 'touch', action: 1, x: p.x, y: p.y });
      }
      canvas.addEventListener('pointerup', endTouch);
      canvas.addEventListener('pointercancel', endTouch);

      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        var p = mapPoint(e);
        var vScroll = e.deltaY > 0 ? -1.5 : 1.5;
        var hScroll = Math.abs(e.deltaX) > 2 ? (e.deltaX > 0 ? 1.5 : -1.5) : 0;
        sendJson({ type: 'scroll', x: p.x, y: p.y, hScroll: hScroll, vScroll: vScroll });
      }, { passive: false });

      window.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var keyMap = {
          Backspace: 67,
          Enter: 66,
          Escape: 4,
          Tab: 61,
          ArrowUp: 19,
          ArrowDown: 20,
          ArrowLeft: 21,
          ArrowRight: 22,
          Delete: 112,
        };
        if (keyMap[e.key] !== undefined) {
          e.preventDefault();
          sendJson({ type: 'key', code: keyMap[e.key] });
        } else if (e.key.length === 1) {
          e.preventDefault();
          sendJson({ type: 'text', text: e.key });
        }
      });

      document.querySelectorAll('.hud button[data-key]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          sendJson({ type: 'key', code: Number(btn.getAttribute('data-key')) });
        });
      });

      document.getElementById('reconnectBtn').addEventListener('click', function (e) {
        e.stopPropagation();
        connect();
      });

      connect();
    })();
  </script>
</body>
</html>`;
}

class ScreenStreamService {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly streams = new Map<string, ActiveDeviceStream>();
  private primarySerial: string | null = null;
  private mirrorServer: HttpServer | null = null;
  private mirrorWss: WebSocketServer | null = null;

  constructor() {
    this.wss.on('connection', (ws, req) => this.handleWsConnection(ws, req));
  }

  attach(server: HttpServer): void {
    // Upgrade routing handled by index.ts calling handleUpgrade
    void server;
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  getViewerUrl(serial: string): string {
    if (this.mirrorServer && this.mirrorServer.listening) {
      return `http://localhost:${config.wsScrcpyPort}/?serial=${encodeURIComponent(serial)}`;
    }
    return `http://localhost:${config.port}/api/screen/viewer?serial=${encodeURIComponent(serial)}`;
  }

  async startMirrorOnWsScrcpyPort(serial: string): Promise<boolean> {
    this.primarySerial = serial;
    if (this.mirrorServer?.listening) return true;

    for (let attempt = 0; attempt < 6; attempt++) {
      const bound = await new Promise<'ok' | 'retry' | 'fail'>((resolve) => {
        const mirrorWss = new WebSocketServer({ noServer: true });
        mirrorWss.on('connection', (ws, req) => this.handleWsConnection(ws, req));

        const srv = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
          const parsed = new URL(req.url || '/', `http://localhost:${config.wsScrcpyPort}`);
          if (parsed.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, mode: 'screen-agent', serial: this.primarySerial }));
            return;
          }
          const targetSerial = parsed.searchParams.get('serial') || this.primarySerial || '';
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(renderScreenViewerHtml(targetSerial));
        });

        srv.on('upgrade', (request, socket, head) => {
          const pathname = new URL(request.url || '/', `http://localhost:${config.wsScrcpyPort}`).pathname;
          if (pathname === '/ws/screen') {
            mirrorWss.handleUpgrade(request, socket, head, (ws) => {
              mirrorWss.emit('connection', ws, request);
            });
          } else {
            socket.destroy();
          }
        });

        srv.once('error', (err: NodeJS.ErrnoException) => {
          try {
            mirrorWss.close();
          } catch {
            // ignore
          }
          resolve(err.code === 'EADDRINUSE' ? 'retry' : 'fail');
        });

        srv.listen(config.wsScrcpyPort, '0.0.0.0', () => {
          this.mirrorServer = srv;
          this.mirrorWss = mirrorWss;
          resolve('ok');
        });
      });

      if (bound === 'ok') return true;
      if (bound === 'fail') return false;
      await sleep(250);
    }
    return false;
  }

  async stopMirrorOnWsScrcpyPort(): Promise<void> {
    if (this.mirrorWss) {
      for (const c of this.mirrorWss.clients) {
        c.close();
      }
      this.mirrorWss.close();
      this.mirrorWss = null;
    }
    if (this.mirrorServer) {
      await new Promise<void>((resolve) => {
        this.mirrorServer?.close(() => resolve());
      });
      this.mirrorServer = null;
    }
  }

  async start(serial: string): Promise<{ ok: boolean; viewerUrl: string; message: string }> {
    this.primarySerial = serial;
    const existing = this.streams.get(serial);
    if (existing && !existing.stopped && existing.socket && !existing.socket.destroyed) {
      const mirrorOk = await this.startMirrorOnWsScrcpyPort(serial);
      return {
        ok: true,
        viewerUrl: this.getViewerUrl(serial),
        message: mirrorOk
          ? `Live screen agent active on :${config.wsScrcpyPort} and :${config.port} for ${serial}.`
          : `Live screen agent active on :${config.port} for ${serial}.`,
      };
    }

    if (!fs.existsSync(SCREEN_AGENT_JAR)) {
      return {
        ok: false,
        viewerUrl: `http://localhost:${config.port}/api/screen/viewer?serial=${encodeURIComponent(serial)}`,
        message: `Missing screen agent asset at ${SCREEN_AGENT_JAR}.`,
      };
    }

    await this.stop(serial);

    const adb = getAdbBinary();
    const { width, height } = await detectDeviceResolution(serial);

    const pushRes = await runCmd(adb, ['-s', serial, 'push', SCREEN_AGENT_JAR, REMOTE_JAR_PATH], {
      timeoutMs: 10_000,
    });
    if (!pushRes.ok) {
      return {
        ok: false,
        viewerUrl: `http://localhost:${config.port}/api/screen/viewer?serial=${encodeURIComponent(serial)}`,
        message: `Failed to push qa-screen-agent.jar to ${serial}: ${pushRes.stderr || pushRes.stdout}`,
      };
    }

    // Kill any prior ScreenAgent cleanly via pidfile (never pkill -f with matching command args)
    await runCmd(
      adb,
      [
        '-s',
        serial,
        'shell',
        `if [ -f ${REMOTE_PID_PATH} ]; then kill $(cat ${REMOTE_PID_PATH}) 2>/dev/null || true; rm -f ${REMOTE_PID_PATH}; fi; rm -f ${REMOTE_LOG_PATH}`,
      ],
      { timeoutMs: 5000 }
    );

    const launchRes = await runCmd(
      adb,
      [
        '-s',
        serial,
        'shell',
        `nohup app_process -Djava.class.path=${REMOTE_JAR_PATH} / ScreenAgent ${REMOTE_AGENT_PORT} ${width} ${height} > ${REMOTE_LOG_PATH} 2>&1 </dev/null &`,
      ],
      { timeoutMs: 8000 }
    );
    if (!launchRes.ok) {
      return {
        ok: false,
        viewerUrl: `http://localhost:${config.port}/api/screen/viewer?serial=${encodeURIComponent(serial)}`,
        message: `Failed to launch ScreenAgent on ${serial}: ${launchRes.stderr || launchRes.stdout}`,
      };
    }

    let ready = false;
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const logRes = await runCmd(adb, ['-s', serial, 'shell', 'cat', REMOTE_LOG_PATH], { timeoutMs: 3000 });
      if (logRes.stdout.includes('QA_SCREEN_AGENT_READY')) {
        ready = true;
        break;
      }
      await sleep(200);
    }

    if (!ready) {
      const logRes = await runCmd(adb, ['-s', serial, 'shell', 'cat', REMOTE_LOG_PATH], { timeoutMs: 3000 });
      return {
        ok: false,
        viewerUrl: `http://localhost:${config.port}/api/screen/viewer?serial=${encodeURIComponent(serial)}`,
        message: `ScreenAgent did not become ready on ${serial}: ${logRes.stdout || logRes.stderr || 'timeout'}`,
      };
    }

    const localPort = await allocateFreePort();
    const fwdRes = await runCmd(
      adb,
      ['-s', serial, 'forward', `tcp:${localPort}`, `tcp:${REMOTE_AGENT_PORT}`],
      { timeoutMs: 5000 }
    );
    if (!fwdRes.ok) {
      return {
        ok: false,
        viewerUrl: `http://localhost:${config.port}/api/screen/viewer?serial=${encodeURIComponent(serial)}`,
        message: `adb forward failed for ScreenAgent on ${serial}: ${fwdRes.stderr || fwdRes.stdout}`,
      };
    }

    const stream: ActiveDeviceStream = {
      serial,
      width,
      height,
      localPort,
      socket: null,
      clients: new Set<WebSocket>(),
      lastSentFrame: new WeakMap<WebSocket, Buffer>(),
      flushTimer: null,
      latestFrame: null,
      stopped: false,
      reconnecting: false,
    };
    this.streams.set(serial, stream);
    this.connectAgentTcp(stream);

    const mirrorOk = await this.startMirrorOnWsScrcpyPort(serial);
    return {
      ok: true,
      viewerUrl: this.getViewerUrl(serial),
      message: mirrorOk
        ? `Started native ScreenAgent (${width}x${height}) streaming on :${config.wsScrcpyPort} and :${config.port}/api/screen/viewer.`
        : `Started native ScreenAgent (${width}x${height}) streaming on :${config.port}/api/screen/viewer.`,
    };
  }

  async stop(serial?: string): Promise<void> {
    const targets = serial ? [serial] : Array.from(this.streams.keys());
    const adb = getAdbBinary();

    for (const key of targets) {
      const stream = this.streams.get(key);
      if (stream) {
        stream.stopped = true;
        if (stream.flushTimer) {
          clearTimeout(stream.flushTimer);
          stream.flushTimer = null;
        }
        stream.socket?.destroy();
        for (const ws of stream.clients) {
          ws.close();
        }
        stream.clients.clear();
        this.streams.delete(key);
        await runCmd(adb, ['-s', key, 'forward', '--remove', `tcp:${stream.localPort}`], {
          timeoutMs: 3000,
        });
      }
      await runCmd(
        adb,
        [
          '-s',
          key,
          'shell',
          `if [ -f ${REMOTE_PID_PATH} ]; then kill $(cat ${REMOTE_PID_PATH}) 2>/dev/null || true; rm -f ${REMOTE_PID_PATH}; fi`,
        ],
        { timeoutMs: 4000 }
      );
    }

    if (!serial || this.streams.size === 0) {
      this.primarySerial = null;
      await this.stopMirrorOnWsScrcpyPort();
    }
  }

  private broadcastLatestFrame(stream: ActiveDeviceStream): void {
    const frame = stream.latestFrame;
    if (!frame || stream.stopped) return;
    let needsRetry = false;
    for (const ws of stream.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (stream.lastSentFrame.get(ws) === frame) continue;
      if (ws.bufferedAmount < 512 * 1024) {
        stream.lastSentFrame.set(ws, frame);
        ws.send(frame, { binary: true });
      } else {
        needsRetry = true;
      }
    }
    if (needsRetry && !stream.flushTimer && !stream.stopped) {
      stream.flushTimer = setTimeout(() => {
        stream.flushTimer = null;
        this.broadcastLatestFrame(stream);
      }, 100);
    }
  }

  private connectAgentTcp(stream: ActiveDeviceStream): void {
    if (stream.stopped) return;

    const sock = net.connect(stream.localPort, '127.0.0.1');
    sock.setNoDelay(true);
    stream.socket = sock;

    let rxBuf = Buffer.alloc(0);

    sock.on('data', (chunk: Buffer) => {
      rxBuf = Buffer.concat([rxBuf, chunk]);
      while (rxBuf.length >= 4) {
        const frameLen = rxBuf.readUInt32BE(0);
        if (frameLen <= 0 || frameLen > 16 * 1024 * 1024) {
          rxBuf = Buffer.alloc(0);
          break;
        }
        if (rxBuf.length < 4 + frameLen) break;
        const frame = rxBuf.subarray(4, 4 + frameLen);
        rxBuf = rxBuf.subarray(4 + frameLen);
        const copy = Buffer.from(frame);
        stream.latestFrame = copy;
        this.broadcastLatestFrame(stream);
      }
    });

    const scheduleReconnect = () => {
      if (stream.stopped || stream.reconnecting) return;
      stream.reconnecting = true;
      setTimeout(() => {
        stream.reconnecting = false;
        if (!stream.stopped) {
          this.connectAgentTcp(stream);
        }
      }, 1000);
    };

    sock.on('error', scheduleReconnect);
    sock.on('close', scheduleReconnect);
  }

  private handleWsConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url || '/', 'http://localhost');
    const requestedSerial = url.searchParams.get('serial') || this.primarySerial || '';
    const stream =
      (requestedSerial ? this.streams.get(requestedSerial) : undefined) ||
      this.streams.values().next().value;

    if (!stream || stream.stopped) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'No active Android screen stream. Start a QA session first.',
        })
      );
      ws.close();
      return;
    }

    stream.clients.add(ws);
    ws.send(JSON.stringify({ type: 'meta', width: stream.width, height: stream.height, serial: stream.serial }));
    if (stream.latestFrame) {
      stream.lastSentFrame.set(ws, stream.latestFrame);
      ws.send(stream.latestFrame, { binary: true });
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          action?: number;
          x?: number;
          y?: number;
          code?: number;
          text?: string;
          hScroll?: number;
          vScroll?: number;
        };
        const sock = stream.socket;
        if (!sock || sock.destroyed) return;

        if (msg.type === 'touch' && typeof msg.action === 'number' && typeof msg.x === 'number' && typeof msg.y === 'number') {
          sock.write(`TOUCH ${Math.round(msg.action)} ${Math.round(msg.x)} ${Math.round(msg.y)}\n`);
        } else if (msg.type === 'key' && typeof msg.code === 'number') {
          sock.write(`KEY ${Math.round(msg.code)}\n`);
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.length > 0) {
          const b64 = Buffer.from(msg.text, 'utf8').toString('base64');
          sock.write(`TEXT ${b64}\n`);
        } else if (
          msg.type === 'scroll' &&
          typeof msg.x === 'number' &&
          typeof msg.y === 'number'
        ) {
          sock.write(
            `SCROLL ${Math.round(msg.x)} ${Math.round(msg.y)} ${Number(msg.hScroll || 0)} ${Number(msg.vScroll || 0)}\n`
          );
        }
      } catch {
        // ignore malformed input control JSON
      }
    });

    ws.on('close', () => {
      stream.clients.delete(ws);
    });
  }
}

export const screenStreamService = new ScreenStreamService();
