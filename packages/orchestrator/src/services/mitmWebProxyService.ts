import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';
import { config } from '../config.js';

const MITM_BRIDGE_SCRIPT = `(function () {
  var pendingFilter = null;
  var applyTimer = null;

  function applyFilter(val, tries) {
    if (applyTimer) {
      clearTimeout(applyTimer);
      applyTimer = null;
    }
    var input = document.querySelector('.filter-input input[placeholder="Search"], input[placeholder="Search"]');
    if (!input) {
      if (tries > 0) {
        applyTimer = setTimeout(function () { applyFilter(val, tries - 1); }, 150);
      }
      return;
    }
    var desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) {
      desc.set.call(input, val);
    } else {
      input.value = val;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.type !== 'qa-studio:set-mitm-filter') return;
    pendingFilter = typeof ev.data.filter === 'string' ? ev.data.filter : '';
    applyFilter(pendingFilter, 30);
  });

  function notifyReady() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'qa-studio:mitm-ready' }, '*');
      }
    } catch (e) {}
    if (pendingFilter !== null) {
      applyFilter(pendingFilter, 30);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyReady);
  } else {
    notifyReady();
  }
})();
`;

function renderWaitingPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Network Inspector (mitmweb) — QA Studio</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #0d0d10;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      max-width: 380px;
      padding: 24px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #141419;
      text-align: center;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    }
    .spinner {
      width: 22px;
      height: 22px;
      margin: 0 auto 14px;
      border: 2px solid rgba(255, 255, 255, 0.12);
      border-top-color: #34d399;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 600;
      color: #f4f4f5;
    }
    p {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: #a1a1aa;
    }
    code {
      color: #34d399;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Network Inspector Standby</h1>
    <p>
      Start a QA Session or click <strong>Start mitmweb</strong> above to capture live Android HTTP/HTTPS traffic on proxy port <code>:${config.mitmProxyPort}</code>.
    </p>
  </div>
  <script>
    (function poll() {
      fetch('/__qa_mitm_status', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.upstreamReady) {
            window.location.reload();
            return;
          }
          setTimeout(poll, 1500);
        })
        .catch(function () {
          setTimeout(poll, 2000);
        });
    })();
  </script>
</body>
</html>`;
}

function buildUpstreamHeaders(
  incoming: IncomingHttpHeaders,
  isUpgrade = false,
  stripEncodingAndCache = false
): http.OutgoingHttpHeaders {
  const upstreamHost = `127.0.0.1:${config.mitmWebUpstreamPort}`;
  const headers: http.OutgoingHttpHeaders = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (!isUpgrade && (lower === 'connection' || lower === 'keep-alive' || lower === 'transfer-encoding')) {
      continue;
    }
    if (
      stripEncodingAndCache &&
      (lower === 'accept-encoding' || lower === 'if-none-match' || lower === 'if-modified-since')
    ) {
      continue;
    }
    headers[lower] = value;
  }

  headers.host = upstreamHost;
  headers.origin = `http://${upstreamHost}`;
  headers['sec-fetch-site'] = 'same-origin';
  headers.authorization = `Bearer ${config.mitmWebPassword}`;
  if (typeof headers.referer === 'string') {
    headers.referer = headers.referer.replace(/https?:\/\/[^/]+/, `http://${upstreamHost}`);
  }

  return headers;
}

function rewriteResponseHeaders(
  upstreamHeaders: IncomingHttpHeaders,
  bodyModified = false
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === 'x-frame-options' || lower === 'transfer-encoding' || lower === 'connection') {
      continue;
    }
    if (bodyModified && (lower === 'content-length' || lower === 'etag' || lower === 'content-encoding')) {
      continue;
    }
    if (lower === 'content-security-policy' && typeof value === 'string') {
      out[key] = value.replace(/frame-ancestors[^;]*(;|$)/gi, '').trim();
      continue;
    }
    if (lower === 'set-cookie') {
      const cookies = Array.isArray(value) ? value : [value];
      out[key] = cookies.map((c) => c.replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax'));
      continue;
    }
    out[key] = value;
  }
  return out;
}

class MitmWebProxyService {
  private server: HttpServer | null = null;
  private startingPromise: Promise<boolean> | null = null;

  isProxyActive(): boolean {
    return Boolean(this.server && this.server.listening);
  }

  async isUpstreamReachable(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${config.mitmWebUpstreamPort}/flows.json`, {
        headers: {
          Authorization: `Bearer ${config.mitmWebPassword}`,
        },
        signal: AbortSignal.timeout(1500),
      });
      return res.status >= 200 && res.status < 400;
    } catch {
      return false;
    }
  }

  async ensureStarted(): Promise<boolean> {
    if (this.server?.listening) return true;
    if (this.startingPromise) return this.startingPromise;

    this.startingPromise = new Promise<boolean>((resolve) => {
      const srv = http.createServer((req, res) => {
        void this.handleHttp(req, res);
      });

      srv.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });

      srv.once('error', () => {
        this.startingPromise = null;
        resolve(false);
      });

      srv.listen(config.mitmWebPort, '0.0.0.0', () => {
        this.server = srv;
        this.startingPromise = null;
        resolve(true);
      });
    });

    return this.startingPromise;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
    });
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reqUrl = req.url || '/';
    const parsed = new URL(reqUrl, `http://localhost:${config.mitmWebPort}`);

    if (parsed.pathname === '/__qa_mitm_status') {
      const upstreamReady = await this.isUpstreamReachable();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ ok: true, proxy: true, upstreamReady }));
      return;
    }

    if (parsed.pathname === '/__qa_mitm_bridge.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(MITM_BRIDGE_SCRIPT);
      return;
    }

    const isRootHtml = (req.method || 'GET').toUpperCase() === 'GET' && parsed.pathname === '/';

    const upstreamReq = http.request(
      {
        hostname: '127.0.0.1',
        port: config.mitmWebUpstreamPort,
        path: reqUrl,
        method: req.method || 'GET',
        headers: buildUpstreamHeaders(req.headers, false, isRootHtml),
        timeout: 15_000,
      },
      (upstreamRes) => {
        const contentType = String(upstreamRes.headers['content-type'] || '');
        if (isRootHtml && (upstreamRes.statusCode || 200) === 200 && contentType.includes('text/html')) {
          const chunks: Buffer[] = [];
          upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on('end', () => {
            const rawHtml = Buffer.concat(chunks).toString('utf8');
            const bridgeTag = '<script src="/__qa_mitm_bridge.js"></script>';
            const injectedHtml = rawHtml.includes('</body>')
              ? rawHtml.replace('</body>', `${bridgeTag}\n</body>`)
              : `${rawHtml}\n${bridgeTag}`;
            const bodyBuf = Buffer.from(injectedHtml, 'utf8');
            const headers = rewriteResponseHeaders(upstreamRes.headers, true);
            headers['content-length'] = String(bodyBuf.length);
            headers['cache-control'] = 'no-store';
            res.writeHead(200, headers);
            res.end(bodyBuf);
          });
          return;
        }

        const headers = rewriteResponseHeaders(upstreamRes.headers, false);
        res.writeHead(upstreamRes.statusCode || 200, headers);
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on('error', () => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const acceptsHtml = (req.headers.accept || '').includes('text/html') || parsed.pathname === '/';
      if (acceptsHtml) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(renderWaitingPageHtml());
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mitmweb upstream is not running' }));
      }
    });

    req.pipe(upstreamReq);
  }

  private handleUpgrade(req: IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    const reqUrl = req.url || '/';
    const upstreamReq = http.request({
      hostname: '127.0.0.1',
      port: config.mitmWebUpstreamPort,
      path: reqUrl,
      method: req.method || 'GET',
      headers: buildUpstreamHeaders(req.headers, true),
    });

    upstreamReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      let rawResponse = `HTTP/1.1 ${proxyRes.statusCode || 101} ${proxyRes.statusMessage || 'Switching Protocols'}\r\n`;
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        const name = proxyRes.rawHeaders[i];
        const value = proxyRes.rawHeaders[i + 1];
        if (name && value !== undefined) {
          if (name.toLowerCase() === 'set-cookie') {
            rawResponse += `${name}: ${value.replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax')}\r\n`;
          } else {
            rawResponse += `${name}: ${value}\r\n`;
          }
        }
      }
      rawResponse += '\r\n';
      clientSocket.write(rawResponse);
      if (proxyHead.length > 0) {
        clientSocket.write(proxyHead);
      }

      proxySocket.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => proxySocket.destroy());
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
    });

    upstreamReq.on('response', (proxyRes) => {
      proxyRes.resume();
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      clientSocket.destroy();
    });

    upstreamReq.on('error', () => {
      clientSocket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      clientSocket.destroy();
    });

    if (head.length > 0) {
      upstreamReq.write(head);
    }
    upstreamReq.end();
  }
}

export const mitmWebProxyService = new MitmWebProxyService();
