import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config, ensureStudioDirectories } from './config.js';
import { createApiRouter } from './routes/index.js';
import { automationWs } from './services/automationWs.js';
import { logcatService } from './services/logcatService.js';
import { mitmWebProxyService } from './services/mitmWebProxyService.js';
import { screenStreamService } from './services/screenStreamService.js';
import { cleanupStudioOnShutdown } from './services/sessionService.js';
import { autoStartKiriIfInstalled } from './services/systemService.js';

ensureStudioDirectories();

const app = express();

app.use(
  cors({
    origin: [
      config.webUiUrl,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'tauri://localhost',
      'http://tauri.localhost',
      'https://tauri.localhost',
    ],
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', createApiRouter());

// Centralized error handler
app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  res.status(statusCode).json({
    error: err.message || 'Internal orchestrator error',
  });
});

const server = http.createServer(app);
logcatService.attach(server);
automationWs.attach(server);
screenStreamService.attach(server);

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (pathname === '/ws/logcat') {
    logcatService.handleUpgrade(request, socket, head);
  } else if (pathname === '/ws/automation') {
    automationWs.handleUpgrade(request, socket, head);
  } else if (pathname === '/ws/screen') {
    screenStreamService.handleUpgrade(request, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(config.port, () => {
  void mitmWebProxyService.ensureStarted();
  void autoStartKiriIfInstalled();
  console.log('');
  console.log('==============================================================');
  console.log(` AirgapDroid — Orchestrator listening on :${config.port}`);
  console.log(`   REST API   : http://localhost:${config.port}/api`);
  console.log(`   WS Logcat  : ws://localhost:${config.port}/ws/logcat`);
  console.log(`   WS Screen  : ws://localhost:${config.port}/ws/screen`);
  console.log(`   Screen UI  : http://localhost:${config.wsScrcpyPort}`);
  console.log(`   mitmweb    : http://localhost:${config.mitmWebPort} (proxy :${config.mitmProxyPort})`);
  console.log('==============================================================');
  console.log('');
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Stopping active QA session & reclaiming container RAM...`);
  try {
    await cleanupStudioOnShutdown();
    await mitmWebProxyService.stop();
  } catch {
    // ignore shutdown cleanup errors
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
