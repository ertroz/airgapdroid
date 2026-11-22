import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import { config } from '../config.js';
import type { RuntimeMode } from '../types.js';
import { runCmd, sleep } from '../utils/shell.js';
import { mitmWebProxyService } from './mitmWebProxyService.js';
import { screenStreamService, supportsMediaCodecH264 } from './screenStreamService.js';
import {
  detectContainerRuntime,
  getKiriEnv,
  resolveContainerRuntime,
  runSystemCheck,
} from './systemService.js';

export const WS_SCRCPY_IMAGE = 'emptysuns/scrcpy-web:v0.1';
const WS_SCRCPY_CONTAINER = 'qa-studio-ws-scrcpy';
const MITMWEB_CONTAINER = 'qa-studio-mitmweb';

export function buildWsScrcpyStreamUrl(udid?: string): string {
  const baseUrl = `http://localhost:${config.wsScrcpyPort}`;
  if (!udid) return baseUrl;

  const wsUrl = new URL(`ws://localhost:${config.wsScrcpyPort}/`);
  wsUrl.searchParams.set('action', 'proxy-adb');
  wsUrl.searchParams.set('remote', 'tcp:8886');
  wsUrl.searchParams.set('udid', udid);

  const hashParams = new URLSearchParams({
    action: 'stream',
    udid,
    player: 'mse',
    ws: wsUrl.toString(),
    fitToScreen: 'true',
  });

  return `${baseUrl}/#!${hashParams.toString()}`;
}

export interface PullProgressEvent {
  stage: 'checking' | 'starting-runtime' | 'pulling' | 'ready' | 'error';
  image: string;
  percent: number;
  message: string;
  done: boolean;
  error?: string;
}

async function pollRuntimeReady(
  binary: string,
  env: NodeJS.ProcessEnv,
  maxWaitMs = 45_000
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const info = await runCmd(binary, ['info', '--format', '{{.ServerVersion}}'], {
      timeoutMs: 4000,
      env,
    });
    if (info.ok) return true;
    await sleep(1500);
  }
  return false;
}

async function isHttpReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function pollHttpReady(url: string, maxWaitMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isHttpReachable(url)) return true;
    await sleep(400);
  }
  return false;
}

async function pollMitmUpstreamReady(maxWaitMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await mitmWebProxyService.isUpstreamReachable()) return true;
    await sleep(300);
  }
  return false;
}

/**
 * Zero-Terminal Multi-Runtime Auto-Start:
 * 1. Checks Kiri first (if installed)
 * 2. macOS: OrbStack -> Colima -> Docker Desktop
 * 3. Windows: Docker Desktop / WSL2 Docker
 * 4. Linux: systemd docker service
 */
export async function startContainerRuntime(): Promise<{
  ok: boolean;
  provider: 'kiri' | 'orbstack' | 'colima' | 'docker-desktop' | 'docker-linux' | 'none';
  message: string;
  report: Awaited<ReturnType<typeof runSystemCheck>>;
}> {
  const current = await detectContainerRuntime();
  if (current.engine !== 'none') {
    return {
      ok: true,
      provider: current.engine === 'kiri' ? 'kiri' : 'docker-desktop',
      message: `${current.engine === 'kiri' ? 'Kiri' : 'Docker'} runtime is already active.`,
      report: await runSystemCheck(),
    };
  }

  const kiriEnv = getKiriEnv();
  if (current.kiriInstalled) {
    await runCmd(current.binary, ['start'], { timeoutMs: 15_000, env: kiriEnv });
    if (await pollRuntimeReady(current.binary, kiriEnv, 25_000)) {
      return {
        ok: true,
        provider: 'kiri',
        message: 'Kiri container runtime started automatically.',
        report: await runSystemCheck(),
      };
    }
  }

  if (process.platform === 'darwin') {
    // 1. OrbStack
    if (fs.existsSync('/Applications/OrbStack.app')) {
      await runCmd('open', ['-a', 'OrbStack'], { timeoutMs: 8000 });
      if (await pollRuntimeReady('docker', process.env, 35_000)) {
        return {
          ok: true,
          provider: 'orbstack',
          message: 'OrbStack started and Docker socket is ready.',
          report: await runSystemCheck(),
        };
      }
    }

    // 2. Colima
    const colimaBin = await runCmd('which', ['colima'], { timeoutMs: 3000 });
    if (colimaBin.ok || fs.existsSync('/opt/homebrew/bin/colima')) {
      const bin = colimaBin.ok ? 'colima' : '/opt/homebrew/bin/colima';
      await runCmd(bin, ['start'], { timeoutMs: 60_000 });
      if (await pollRuntimeReady('docker', process.env, 35_000)) {
        return {
          ok: true,
          provider: 'colima',
          message: 'Colima VM started and Docker socket is ready.',
          report: await runSystemCheck(),
        };
      }
    }

    // 3. Docker Desktop
    if (fs.existsSync('/Applications/Docker.app')) {
      await runCmd('open', ['-a', 'Docker'], { timeoutMs: 8000 });
      if (await pollRuntimeReady('docker', process.env, 45_000)) {
        return {
          ok: true,
          provider: 'docker-desktop',
          message: 'Docker Desktop started and socket is ready.',
          report: await runSystemCheck(),
        };
      }
    }
  } else if (process.platform === 'win32') {
    const dockerDesktopPaths = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker\\Docker\\Docker Desktop.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Docker\\Docker Desktop.exe'),
    ];
    for (const exe of dockerDesktopPaths) {
      if (fs.existsSync(exe)) {
        spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
        if (await pollRuntimeReady('docker', process.env, 45_000)) {
          return {
            ok: true,
            provider: 'docker-desktop',
            message: 'Docker Desktop started and socket is ready.',
            report: await runSystemCheck(),
          };
        }
      }
    }
    // Fallback: wake WSL2 dockerd if installed inside default distro
    await runCmd('wsl', ['-e', 'sh', '-c', 'sudo service docker start || true'], {
      timeoutMs: 15_000,
    });
    if (await pollRuntimeReady('docker', process.env, 20_000)) {
      return {
        ok: true,
        provider: 'docker-desktop',
        message: 'WSL2 Docker engine started.',
        report: await runSystemCheck(),
      };
    }
  } else if (process.platform === 'linux') {
    await runCmd('systemctl', ['start', 'docker'], { timeoutMs: 10_000 });
    await runCmd('sudo', ['-n', 'systemctl', 'start', 'docker'], { timeoutMs: 10_000 });
    if (await pollRuntimeReady('docker', process.env, 15_000)) {
      return {
        ok: true,
        provider: 'docker-linux',
        message: 'Docker systemd service started.',
        report: await runSystemCheck(),
      };
    }
  }

  return {
    ok: false,
    provider: 'none',
    message:
      'No container runtime (Kiri, OrbStack, Colima, or Docker) is available. You can continue immediately in Direct ADB Mode.',
    report: await runSystemCheck(),
  };
}

function sendSse(res: Response, payload: PullProgressEvent): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Streams visual Docker/Kiri image pull progress over Server-Sent Events (SSE)
 */
export async function streamImagePullProgress(image: string, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const runtime = await resolveContainerRuntime();
  if (runtime.engine === 'none') {
    sendSse(res, {
      stage: 'starting-runtime',
      image,
      percent: 5,
      message: 'Starting container engine...',
      done: false,
    });
    const started = await startContainerRuntime();
    if (!started.ok) {
      sendSse(res, {
        stage: 'error',
        image,
        percent: 0,
        message: started.message,
        done: true,
        error: started.message,
      });
      res.end();
      return;
    }
  }

  const activeRuntime = await resolveContainerRuntime();
  const env = activeRuntime.engine === 'kiri' ? getKiriEnv() : process.env;

  sendSse(res, {
    stage: 'checking',
    image,
    percent: 10,
    message: `Checking local cache for ${image}...`,
    done: false,
  });

  const inspect = await runCmd(activeRuntime.binary, ['image', 'inspect', image], {
    timeoutMs: 8000,
    env,
  });

  if (inspect.ok) {
    sendSse(res, {
      stage: 'ready',
      image,
      percent: 100,
      message: `${image} is already cached locally.`,
      done: true,
    });
    res.end();
    return;
  }

  sendSse(res, {
    stage: 'pulling',
    image,
    percent: 15,
    message: `Downloading ${image}...`,
    done: false,
  });

  await new Promise<void>((resolve) => {
    const child = spawn(activeRuntime.binary, ['pull', image], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let currentPercent = 18;
    const layerWeights = new Map<string, number>();

    const handleChunk = (chunk: Buffer) => {
      const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
      for (const raw of lines) {
        const line = raw.trim();
        // Parse standard Docker/Kiri layer progress: "<layerId>: Downloading [===> ] 12.3MB/45.6MB"
        const ratioMatch = line.match(/^([a-f0-9]+):\s+(Downloading|Extracting)\s+.*?(\d+(?:\.\d+)?)([kKmMgG]?B)\s*\/\s*(\d+(?:\.\d+)?)([kKmMgG]?B)/);
        if (ratioMatch) {
          const id = ratioMatch[1];
          const phase = ratioMatch[2];
          const doneVal = parseFloat(ratioMatch[3]);
          const totalVal = Math.max(0.1, parseFloat(ratioMatch[5]));
          const ratio = Math.min(1, doneVal / totalVal);
          layerWeights.set(id, phase === 'Downloading' ? ratio * 0.7 : 0.7 + ratio * 0.3);

          const avg =
            Array.from(layerWeights.values()).reduce((a, b) => a + b, 0) /
            Math.max(1, layerWeights.size);
          currentPercent = Math.max(currentPercent, Math.min(96, Math.round(18 + avg * 78)));
        } else if (line.includes('Pull complete')) {
          currentPercent = Math.min(97, currentPercent + 4);
        }

        sendSse(res, {
          stage: 'pulling',
          image,
          percent: currentPercent,
          message: line.slice(0, 120),
          done: false,
        });
      }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);
    child.on('close', (code) => {
      if (code === 0) {
        sendSse(res, {
          stage: 'ready',
          image,
          percent: 100,
          message: `Downloaded ${image} successfully.`,
          done: true,
        });
      } else {
        sendSse(res, {
          stage: 'error',
          image,
          percent: currentPercent,
          message: `Failed to pull ${image} (exit code ${code ?? 1}).`,
          done: true,
          error: `Pull failed with exit code ${code ?? 1}`,
        });
      }
      resolve();
    });
    child.on('error', (err) => {
      sendSse(res, {
        stage: 'error',
        image,
        percent: 0,
        message: err.message,
        done: true,
        error: err.message,
      });
      resolve();
    });
  });

  res.end();
}

async function resolveContainerIp(
  binary: string,
  containerName: string,
  env: NodeJS.ProcessEnv
): Promise<string | null> {
  const res = await runCmd(
    binary,
    ['inspect', '-f', '{{.NetworkSettings.IPAddress}}', containerName],
    { timeoutMs: 5000, env }
  );
  if (!res.ok) return null;
  const ip = res.stdout.trim();
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ? ip : null;
}

export async function getWsScrcpyStatus(): Promise<{
  running: boolean;
  url: string;
  mode: 'container' | 'local-binary' | 'offline';
}> {
  const url = `http://localhost:${config.wsScrcpyPort}`;
  if (await isHttpReachable(url)) {
    return { running: true, url, mode: 'container' };
  }
  return { running: false, url, mode: 'offline' };
}

export async function startWsScrcpyService(options?: {
  mode?: RuntimeMode;
  containerName?: string;
  serial?: string;
}): Promise<{
  ok: boolean;
  mode: 'container' | 'local-binary' | 'unavailable';
  adbTarget?: string;
  streamUrl: string;
  message: string;
}> {
  const url = `http://localhost:${config.wsScrcpyPort}`;
  const runtime = await resolveContainerRuntime();

  if (options?.serial) {
    const isDirectAdbMode = options.mode === 'direct-adb';
    const isTcpSerial = options.serial.includes(':');
    const h264Supported =
      isDirectAdbMode && !isTcpSerial ? true : await supportsMediaCodecH264(options.serial);

    // Prefer host-side ScreenAgent when:
    // 1. Direct ADB mode (USB or Wi-Fi) — host adb already holds the device connection & RSA trust,
    //    whereas a Kiri/Docker Linux VM container has no USB passthrough on macOS/Windows.
    // 2. Device/kernel lacks working MediaCodec H.264 encoder (e.g. Redroid 14 on Kiri).
    if (isDirectAdbMode || !isTcpSerial || !h264Supported) {
      if (runtime.engine !== 'none') {
        const env = runtime.engine === 'kiri' ? getKiriEnv() : process.env;
        await runCmd(runtime.binary, ['rm', '-f', WS_SCRCPY_CONTAINER], { timeoutMs: 8000, env });
      }
      const streamRes = await screenStreamService.start(options.serial);
      if (streamRes.ok || !isTcpSerial || !h264Supported) {
        return {
          ok: streamRes.ok,
          mode: streamRes.ok ? 'local-binary' : 'unavailable',
          adbTarget: options.serial,
          streamUrl: streamRes.viewerUrl,
          message: streamRes.message,
        };
      }
    }
  }

  await screenStreamService.stopMirrorOnWsScrcpyPort();

  let adbTarget = '';
  let isUsbDirectAdb = false;
  if (options?.mode === 'docker') {
    let targetHost = 'host.docker.internal';
    if (runtime.engine !== 'none' && options.containerName) {
      const env = runtime.engine === 'kiri' ? getKiriEnv() : process.env;
      const ip = await resolveContainerIp(runtime.binary, options.containerName, env);
      if (ip) {
        targetHost = ip;
      }
    }
    adbTarget = `${targetHost}:5555`;
  } else if (options?.serial) {
    if (options.serial.startsWith('127.0.0.1:') || options.serial.startsWith('localhost:')) {
      const port = options.serial.split(':')[1] || '5555';
      adbTarget = `host.docker.internal:${port}`;
    } else if (options.serial.includes(':')) {
      adbTarget = options.serial;
    } else {
      isUsbDirectAdb = true;
    }
  } else {
    adbTarget = 'host.docker.internal:5555';
  }

  const streamUrl = buildWsScrcpyStreamUrl(adbTarget || undefined);

  if (runtime.engine !== 'none') {
    const env = runtime.engine === 'kiri' ? getKiriEnv() : process.env;
    const alreadyUp = await isHttpReachable(url);

    if (alreadyUp) {
      const imgInspect = await runCmd(
        runtime.binary,
        ['inspect', '-f', '{{.Config.Image}}', WS_SCRCPY_CONTAINER],
        { timeoutMs: 4000, env }
      );
      if (imgInspect.ok && imgInspect.stdout.trim() === WS_SCRCPY_IMAGE) {
        if (adbTarget) {
          await runCmd(
            runtime.binary,
            [
              'exec',
              WS_SCRCPY_CONTAINER,
              'sh',
              '-c',
              `adb start-server >/dev/null 2>&1 || true; adb disconnect >/dev/null 2>&1 || true; adb connect ${adbTarget} >/dev/null 2>&1 || true`,
            ],
            { timeoutMs: 8000, env }
          );
        }
        return {
          ok: true,
          mode: 'container',
          adbTarget: adbTarget || undefined,
          streamUrl,
          message: adbTarget
            ? `ws-scrcpy is running on :${config.wsScrcpyPort} and connected to ${adbTarget}.`
            : isUsbDirectAdb
              ? `ws-scrcpy is running on :${config.wsScrcpyPort}. Note: USB device ${options?.serial} requires Wi-Fi ADB (adb tcpip 5555) to stream inside Kiri/Docker.`
              : `ws-scrcpy is already running on :${config.wsScrcpyPort}.`,
        };
      }
      if (!imgInspect.ok) {
        // Something else (e.g. Tauri sidecar or host ws-scrcpy) is already serving :8000
        return {
          ok: true,
          mode: 'local-binary',
          adbTarget: adbTarget || undefined,
          streamUrl: buildWsScrcpyStreamUrl(options?.serial),
          message: `ws-scrcpy is already running on :${config.wsScrcpyPort}.`,
        };
      }
    }

    await runCmd(runtime.binary, ['rm', '-f', WS_SCRCPY_CONTAINER], { timeoutMs: 8000, env });

    const startCommand = adbTarget
      ? `adb start-server && (adb connect ${adbTarget} || true); cd dist && exec node ./index.js`
      : 'adb start-server; cd dist && exec node ./index.js';

    const run = await runCmd(
      runtime.binary,
      [
        'run',
        '-d',
        '--name',
        WS_SCRCPY_CONTAINER,
        '-p',
        `${config.wsScrcpyPort}:8000`,
        '--add-host',
        'host.docker.internal:host-gateway',
        WS_SCRCPY_IMAGE,
        'sh',
        '-c',
        startCommand,
      ],
      { timeoutMs: 90_000, env }
    );

    if (run.ok) {
      const ready = await pollHttpReady(url, 12_000);
      if (ready) {
        return {
          ok: true,
          mode: 'container',
          adbTarget: adbTarget || undefined,
          streamUrl,
          message: adbTarget
            ? `Started ws-scrcpy on :${config.wsScrcpyPort} connected to ${adbTarget}.`
            : isUsbDirectAdb
              ? `Started ws-scrcpy on :${config.wsScrcpyPort}. For USB device ${options?.serial} inside container mode, enable Wi-Fi ADB (adb tcpip 5555).`
              : `Started ws-scrcpy on :${config.wsScrcpyPort}.`,
        };
      }
    }
  }

  if (await isHttpReachable(url)) {
    return {
      ok: true,
      mode: 'local-binary',
      adbTarget: adbTarget || undefined,
      streamUrl: buildWsScrcpyStreamUrl(options?.serial),
      message: `ws-scrcpy is running on :${config.wsScrcpyPort}.`,
    };
  }

  if (options?.serial) {
    const streamRes = await screenStreamService.start(options.serial);
    if (streamRes.ok) {
      return {
        ok: true,
        mode: 'local-binary',
        adbTarget: options.serial,
        streamUrl: streamRes.viewerUrl,
        message: streamRes.message,
      };
    }
  }

  return {
    ok: false,
    mode: 'unavailable',
    streamUrl: url,
    message:
      'Container runtime (Kiri/Docker) is not running and no local ws-scrcpy server was detected on port 8000.',
  };
}

export async function getMitmproxyStatus(): Promise<{
  running: boolean;
  url: string;
  mode: 'container' | 'local-binary' | 'offline';
}> {
  const url = `http://localhost:${config.mitmWebPort}`;
  if (await mitmWebProxyService.isUpstreamReachable()) {
    await mitmWebProxyService.ensureStarted();
    return { running: true, url, mode: 'container' };
  }
  if (!mitmWebProxyService.isProxyActive() && (await isHttpReachable(url))) {
    return { running: true, url, mode: 'container' };
  }
  return { running: false, url, mode: 'offline' };
}

export async function startMitmproxyService(): Promise<{
  ok: boolean;
  mode: 'container' | 'local-binary' | 'unavailable';
  message: string;
}> {
  if (await mitmWebProxyService.isUpstreamReachable()) {
    await mitmWebProxyService.ensureStarted();
    return { ok: true, mode: 'container', message: `mitmweb is already running on :${config.mitmWebPort}.` };
  }

  const runtime = await resolveContainerRuntime();
  if (runtime.engine !== 'none') {
    const env = runtime.engine === 'kiri' ? getKiriEnv() : process.env;
    fs.mkdirSync(config.paths.mitmRepoDir, { recursive: true });
    await runCmd(runtime.binary, ['rm', '-f', MITMWEB_CONTAINER], { timeoutMs: 8000, env });
    const proxyOk = await mitmWebProxyService.ensureStarted();
    const run = await runCmd(
      runtime.binary,
      [
        'run',
        '-d',
        '--name',
        MITMWEB_CONTAINER,
        '-p',
        `${config.mitmProxyPort}:8080`,
        '-p',
        `${config.mitmWebUpstreamPort}:8082`,
        '-v',
        `${config.paths.mitmRepoDir}:/home/mitmproxy/.mitmproxy`,
        'mitmproxy/mitmproxy:latest',
        'mitmweb',
        '--web-host',
        '0.0.0.0',
        '--web-port',
        '8082',
        '--listen-host',
        '0.0.0.0',
        '--listen-port',
        '8080',
        '--no-web-open-browser',
        '--set',
        `web_password=${config.mitmWebPassword}`,
      ],
      { timeoutMs: 60_000, env }
    );
    if (run.ok) {
      const ready = await pollMitmUpstreamReady(12_000);
      await mitmWebProxyService.ensureStarted();
      if (ready && proxyOk) {
        return {
          ok: true,
          mode: 'container',
          message: `Started mitmweb on :${config.mitmWebPort} (proxy :${config.mitmProxyPort}).`,
        };
      }
      return {
        ok: ready,
        mode: 'container',
        message: ready
          ? `Started mitmweb upstream on :${config.mitmWebUpstreamPort} (proxy port :${config.mitmWebPort} busy).`
          : `mitmweb container started, waiting for Web UI on :${config.mitmWebPort}.`,
      };
    }
  }

  // Fallback: check local mitmweb binary on host (for Direct ADB users without Docker)
  const localMitm = await runCmd('which', ['mitmweb'], { timeoutMs: 3000 });
  if (localMitm.ok) {
    await mitmWebProxyService.ensureStarted();
    spawn(
      'mitmweb',
      [
        '--web-host',
        '127.0.0.1',
        '--web-port',
        String(config.mitmWebUpstreamPort),
        '--listen-port',
        String(config.mitmProxyPort),
        '--no-web-open-browser',
        '--set',
        `web_password=${config.mitmWebPassword}`,
      ],
      { detached: true, stdio: 'ignore' }
    ).unref();
    await pollMitmUpstreamReady(8000);
    return {
      ok: true,
      mode: 'local-binary',
      message: `Started local mitmweb binary on :${config.mitmWebPort}.`,
    };
  }

  return {
    ok: false,
    mode: 'unavailable',
    message:
      'No container runtime or local mitmweb binary found. Install mitmproxy (`brew install mitmproxy`) or start Docker/Kiri.',
  };
}
