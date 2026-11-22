import { config } from '../config.js';
import type {
  ActiveSession,
  AndroidVersion,
  RuntimeMode,
  SessionAutomationStep,
} from '../types.js';
import { runCmd, sleep } from '../utils/shell.js';
import { isAndroidVersionAllowed } from './licenseService.js';
import { logcatService } from './logcatService.js';
import { screenStreamService } from './screenStreamService.js';
import {
  buildWsScrcpyStreamUrl,
  startMitmproxyService,
  startWsScrcpyService,
} from './provisionerService.js';
import {
  detectHostProxyIp,
  findAndroidCaCertificate,
  getKiriEnv,
  listAdbDevices,
  resolveContainerRuntime,
} from './systemService.js';

const SUPPORTED_VERSIONS: AndroidVersion[] = ['11', '12', '13', '14'];
const REDROID_ADB_SERIAL = '127.0.0.1:5555';

export function resolveRedroidImage(androidVersion: AndroidVersion): string {
  // Apple Silicon lacks 32-bit ARM (aarch32) execution; use 64-bit-only Redroid images where available
  const use64Only =
    process.platform === 'darwin' && process.arch === 'arm64' && androidVersion !== '11';
  return use64Only
    ? `redroid/redroid:${androidVersion}.0.0_64only-latest`
    : `redroid/redroid:${androidVersion}.0.0-latest`;
}

let currentSession: ActiveSession = createIdleSession();

function createIdleSession(): ActiveSession {
  return {
    active: false,
    mode: null,
    deviceSerial: null,
    proxyPort: config.mitmProxyPort,
    metroPort: config.metroPort,
    wsScrcpyUrl: `http://localhost:${config.wsScrcpyPort}`,
    mitmWebUrl: `http://localhost:${config.mitmWebPort}`,
    metroReversed: false,
    proxyConfigured: false,
    sslCertInjected: false,
    automations: [],
  };
}

export function getActiveSession(): ActiveSession {
  return { ...currentSession, automations: [...currentSession.automations] };
}

async function cleanupRedroidContainers(runtimeBin?: string): Promise<number> {
  const bin = runtimeBin || (await resolveContainerRuntime()).binary;
  const env = getKiriEnv();
  const existing = await runCmd(
    bin,
    ['ps', '-a', '--filter', 'name=^/qa-android-', '--format', '{{.ID}}'],
    { timeoutMs: 10_000, env }
  );

  if (!existing.ok || !existing.stdout) return 0;

  const ids = existing.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) return 0;

  await runCmd(bin, ['rm', '-f', ...ids], { timeoutMs: 25_000, env });
  return ids.length;
}

async function waitForAdbDeviceReady(serial: string, maxWaitMs = 45_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await runCmd('adb', ['connect', serial], { timeoutMs: 5000 });
    const stateRes = await runCmd('adb', ['-s', serial, 'get-state'], { timeoutMs: 5000 });
    if (stateRes.ok && stateRes.stdout.includes('device')) {
      const bootRes = await runCmd('adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], {
        timeoutMs: 5000,
      });
      if (bootRes.ok && bootRes.stdout.trim() === '1') {
        return true;
      }
    }
    await sleep(1500);
  }
  return false;
}

async function injectAndroidSystemCaCert(
  serial: string
): Promise<{ injected: boolean; status: SessionAutomationStep['status']; detail: string }> {
  const cert = findAndroidCaCertificate();
  if (!cert) {
    return {
      injected: false,
      status: 'skipped',
      detail: 'No Android system CA certificate (<hash>.0) found in ~/.qa-studio/certs/.',
    };
  }

  // Attempt adb root (succeeds on Redroid & userdebug emulators; gracefully fails on stock retail phones)
  const rootRes = await runCmd('adb', ['-s', serial, 'root'], { timeoutMs: 8000 });
  await sleep(800);
  const idRes = await runCmd('adb', ['-s', serial, 'shell', 'id'], { timeoutMs: 5000 });
  const hasRoot =
    idRes.ok && (idRes.stdout.includes('uid=0(root)') || rootRes.stdout.includes('already running as root'));

  if (!hasRoot) {
    return {
      injected: false,
      status: 'skipped',
      detail:
        'Device is not rooted (standard for physical retail phones). Install mitmproxy CA manually via http://mitm.it if needed.',
    };
  }

  // Remount /system read-write (works on Redroid & classic system partitions)
  await runCmd('adb', ['-s', serial, 'remount'], { timeoutMs: 8000 });
  await runCmd('adb', ['-s', serial, 'shell', 'mount -o rw,remount /system || mount -o rw,remount /'], {
    timeoutMs: 6000,
  });

  const remotePath = `/system/etc/security/cacerts/${cert.fileName}`;
  const pushRes = await runCmd('adb', ['-s', serial, 'push', cert.fullPath, remotePath], {
    timeoutMs: 10_000,
  });

  if (pushRes.ok) {
    await runCmd('adb', ['-s', serial, 'shell', 'chmod', '644', remotePath], { timeoutMs: 5000 });
    await runCmd('adb', ['-s', serial, 'shell', 'chown', 'root:root', remotePath], {
      timeoutMs: 5000,
    });
    return {
      injected: true,
      status: 'ok',
      detail: `Injected ${cert.fileName} into /system/etc/security/cacerts/ (chmod 644).`,
    };
  }

  // Fallback for read-only /system (e.g., Android 14 APEX / overlayfs): mount tmpfs over cacerts preserving existing CAs
  const fallbackScript = [
    'mkdir -p /data/local/tmp/qa-cacerts',
    'cp /system/etc/security/cacerts/* /data/local/tmp/qa-cacerts/ 2>/dev/null || true',
  ].join(' && ');

  await runCmd('adb', ['-s', serial, 'shell', fallbackScript], { timeoutMs: 8000 });
  const pushTmp = await runCmd(
    'adb',
    ['-s', serial, 'push', cert.fullPath, `/data/local/tmp/qa-cacerts/${cert.fileName}`],
    { timeoutMs: 10_000 }
  );

  if (pushTmp.ok) {
    const bindCmd = [
      `chmod 644 /data/local/tmp/qa-cacerts/${cert.fileName}`,
      'mount -t tmpfs tmpfs /system/etc/security/cacerts',
      'cp /data/local/tmp/qa-cacerts/* /system/etc/security/cacerts/',
      'chmod 644 /system/etc/security/cacerts/*',
    ].join(' && ');
    const bindRes = await runCmd('adb', ['-s', serial, 'shell', bindCmd], { timeoutMs: 10_000 });
    if (bindRes.ok) {
      return {
        injected: true,
        status: 'ok',
        detail: `Injected ${cert.fileName} via tmpfs overlay onto /system/etc/security/cacerts/ (chmod 644).`,
      };
    }
  }

  return {
    injected: false,
    status: 'warning',
    detail: `Could not write CA certificate to /system/etc/security/cacerts/: ${pushRes.stderr || 'read-only filesystem'}.`,
  };
}

export async function startSession(params: {
  mode: RuntimeMode;
  androidVersion?: AndroidVersion;
  deviceSerial?: string;
  proxyHost?: string;
}): Promise<ActiveSession> {
  const { mode } = params;
  const automations: SessionAutomationStep[] = [];

  if (mode !== 'docker' && mode !== 'direct-adb') {
    throw new Error('Invalid mode. Expected "docker" or "direct-adb".');
  }

  // Stop any previously active session cleanly first
  if (currentSession.active) {
    await stopSession();
  }

  let serial = '';
  let containerName: string | undefined;
  let androidVersion: AndroidVersion | undefined;
  let activeEngine: ActiveSession['containerEngine'];

  if (mode === 'docker') {
    androidVersion = params.androidVersion ?? '14';
    if (!SUPPORTED_VERSIONS.includes(androidVersion)) {
      throw new Error(`Unsupported Android version "${androidVersion}". Choose 11, 12, 13, or 14.`);
    }

    if (!isAndroidVersionAllowed(androidVersion)) {
      const err = new Error(
        `Android ${androidVersion} requires a Pro License. Free Tier includes Android 14.`
      ) as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }

    const runtime = await resolveContainerRuntime();
    if (runtime.engine === 'none') {
      throw new Error(
        'No container runtime (Kiri or Docker) is running. Open System Check Wizard to install or start Kiri.'
      );
    }
    activeEngine = runtime.engine;

    const removedCount = await cleanupRedroidContainers(runtime.binary);
    if (removedCount > 0) {
      automations.push({
        step: 'Cleanup old containers',
        status: 'ok',
        detail: `Stopped and removed ${removedCount} existing qa-android-* container(s) via ${runtime.engine}.`,
      });
    }

    containerName = `qa-android-${androidVersion}`;
    const image = resolveRedroidImage(androidVersion);

    const containerRun = await runCmd(
      runtime.binary,
      [
        'run',
        '-d',
        '--name',
        containerName,
        '--privileged',
        '-p',
        '5555:5555',
        image,
        'androidboot.redroid_gpu_mode=guest',
        'androidboot.redroid_width=1080',
        'androidboot.redroid_height=1920',
        'androidboot.redroid_dpi=420',
      ],
      { timeoutMs: 120_000, env: getKiriEnv() }
    );

    if (!containerRun.ok) {
      throw new Error(
        `Failed to start Redroid container via ${runtime.engine} (${image}): ${containerRun.stderr || containerRun.stdout}`
      );
    }

    automations.push({
      step: `Redroid container (${runtime.engine})`,
      status: 'ok',
      detail: `Started ${containerName} via ${runtime.binary} (${image}, 1080x1920 @ 420 DPI, guest GPU).`,
    });

    serial = REDROID_ADB_SERIAL;
    const booted = await waitForAdbDeviceReady(serial, 45_000);
    if (!booted) {
      // Try one more adb connect so user can still observe boot progress via ws-scrcpy
      await runCmd('adb', ['connect', serial], { timeoutMs: 5000 });
      automations.push({
        step: 'ADB Connect',
        status: 'warning',
        detail: `Connected to ${serial}, Android is still finishing first boot.`,
      });
    } else {
      automations.push({
        step: 'ADB Connect',
        status: 'ok',
        detail: `Connected to ${serial} and confirmed sys.boot_completed=1.`,
      });
    }
  } else {
    const requestedSerial = params.deviceSerial?.trim();
    const devices = await listAdbDevices();
    const readyDevices = devices.filter((d) => d.state === 'device');

    if (requestedSerial) {
      const matched = readyDevices.find((d) => d.serial === requestedSerial);
      if (!matched) {
        throw new Error(
          `ADB device "${requestedSerial}" is not connected or not authorized. Check USB debugging and refresh devices.`
        );
      }
      serial = matched.serial;
    } else if (readyDevices.length > 0) {
      serial = readyDevices[0].serial;
    } else {
      throw new Error(
        'No authorized ADB devices found. Connect a physical device (USB/Wi-Fi) or start a local emulator first.'
      );
    }

    automations.push({
      step: 'Direct ADB Target',
      status: 'ok',
      detail: `Attached to connected device ${serial}.`,
    });
  }

  // Automation 1: Auto ADB Reverse for React Native Metro Bundler (8081)
  const reverseRes = await runCmd(
    'adb',
    ['-s', serial, 'reverse', `tcp:${config.metroPort}`, `tcp:${config.metroPort}`],
    { timeoutMs: 8000 }
  );
  const metroReversed = reverseRes.ok;
  automations.push({
    step: 'Metro Bundler Reverse (8081)',
    status: metroReversed ? 'ok' : 'warning',
    detail: metroReversed
      ? `Executed adb -s ${serial} reverse tcp:8081 tcp:8081 for React Native Fast Refresh.`
      : `Could not set ADB reverse 8081: ${reverseRes.stderr}`,
  });

  // Automation 2: Inject Global HTTP Proxy pointing to mitmproxy (:8080)
  const proxyHost = params.proxyHost?.trim() || detectHostProxyIp(mode, activeEngine ?? 'kiri');
  const proxyTarget = `${proxyHost}:${config.mitmProxyPort}`;
  const proxyRes = await runCmd(
    'adb',
    ['-s', serial, 'shell', 'settings', 'put', 'global', 'http_proxy', proxyTarget],
    { timeoutMs: 8000 }
  );
  const proxyConfigured = proxyRes.ok;
  automations.push({
    step: 'Global HTTP Proxy (8080)',
    status: proxyConfigured ? 'ok' : 'warning',
    detail: proxyConfigured
      ? `Configured global http_proxy to ${proxyTarget} (inspect in mitmweb on :${config.mitmWebPort}).`
      : `Could not configure global http_proxy: ${proxyRes.stderr}`,
  });

  // Automation 3: Auto SSL CA Cert Injection for rooted devices (e.g., Redroid)
  const certResult = await injectAndroidSystemCaCert(serial);
  automations.push({
    step: 'HTTPS CA Certificate Injection',
    status: certResult.status,
    detail: certResult.detail,
  });

  // Automation 4: Ensure ws-scrcpy (:8000) and mitmweb (:8082) sidecar services are running
  const [scrcpyResult, mitmResult] = await Promise.all([
    startWsScrcpyService({ mode, containerName, serial }),
    startMitmproxyService(),
  ]);
  automations.push({
    step: `Screen Stream (ws-scrcpy :${config.wsScrcpyPort})`,
    status: scrcpyResult.ok ? 'ok' : 'warning',
    detail: scrcpyResult.message,
  });
  automations.push({
    step: `Network Inspector (mitmweb :${config.mitmWebPort})`,
    status: mitmResult.ok ? 'ok' : 'warning',
    detail: mitmResult.message,
  });

  // Start Live Error Logcat WebSocket streamer
  logcatService.start(serial);

  currentSession = {
    active: true,
    mode,
    containerEngine: activeEngine,
    androidVersion,
    containerName,
    deviceSerial: serial,
    proxyHost,
    proxyPort: config.mitmProxyPort,
    metroPort: config.metroPort,
    wsScrcpyUrl: scrcpyResult.streamUrl || buildWsScrcpyStreamUrl(scrcpyResult.adbTarget),
    mitmWebUrl: `http://localhost:${config.mitmWebPort}`,
    metroReversed,
    proxyConfigured,
    sslCertInjected: certResult.injected,
    startedAt: new Date().toISOString(),
    automations,
  };

  return getActiveSession();
}

export async function stopSession(): Promise<{
  stopped: boolean;
  steps: SessionAutomationStep[];
  session: ActiveSession;
}> {
  const steps: SessionAutomationStep[] = [];
  const serial = currentSession.deviceSerial;
  const mode = currentSession.mode;

  // Stop live logcat & screen stream first
  logcatService.stop();
  await screenStreamService.stop(serial || undefined);

  if (serial) {
    // Reset global HTTP proxy to :0 so device internet works normally again
    const resetProxy = await runCmd(
      'adb',
      ['-s', serial, 'shell', 'settings', 'put', 'global', 'http_proxy', ':0'],
      { timeoutMs: 6000 }
    );
    await runCmd('adb', ['-s', serial, 'shell', 'settings', 'delete', 'global', 'http_proxy'], {
      timeoutMs: 6000,
    });
    steps.push({
      step: 'Reset HTTP Proxy',
      status: resetProxy.ok ? 'ok' : 'warning',
      detail: resetProxy.ok
        ? `Reset global http_proxy to :0 on ${serial}.`
        : `Proxy reset skipped or device already offline (${resetProxy.stderr}).`,
    });

    // Remove reverse port mapping
    await runCmd(
      'adb',
      ['-s', serial, 'reverse', '--remove', `tcp:${config.metroPort}`],
      { timeoutMs: 5000 }
    );

    if (mode === 'docker' || serial.includes(':')) {
      await runCmd('adb', ['disconnect', serial], { timeoutMs: 5000 });
      steps.push({
        step: 'ADB Disconnect',
        status: 'ok',
        detail: `Disconnected ADB target ${serial}.`,
      });
    }
  }

  // Always clean up any running qa-android-* containers when stopping a Docker session
  if (mode === 'docker' || currentSession.containerName) {
    const removed = await cleanupRedroidContainers();
    steps.push({
      step: 'Stop Redroid Container',
      status: 'ok',
      detail:
        removed > 0
          ? `Stopped and removed ${removed} Redroid container(s). Host RAM reclaimed.`
          : 'No active Redroid containers remaining.',
    });
  }

  currentSession = createIdleSession();

  return {
    stopped: true,
    steps,
    session: getActiveSession(),
  };
}

/**
 * Maximum RAM reclamation on app exit:
 * 1. Stops any active QA session (Redroid container + proxy reset).
 * 2. Stops QA Studio's own compose services (qa-studio-ws-scrcpy & qa-studio-mitmweb).
 * 3. If Kiri is active, AUTO_STOP_KIRI_ON_EXIT is enabled, and zero other user containers
 *    are running, cleanly stops the Kiri engine so host RAM drops to ~0 MB.
 */
export async function cleanupStudioOnShutdown(): Promise<void> {
  await stopSession();

  const runtime = await resolveContainerRuntime();
  if (runtime.engine === 'none') return;

  const env = getKiriEnv();

  // Stop QA Studio's own infrastructure containers so Kiri VM can sleep or stop cleanly
  await runCmd(runtime.binary, ['stop', 'qa-studio-ws-scrcpy', 'qa-studio-mitmweb'], {
    timeoutMs: 12_000,
    env,
  });

  if (runtime.engine === 'kiri' && config.autoStopKiriOnExit) {
    const remaining = await runCmd(runtime.binary, ['ps', '-q'], {
      timeoutMs: 5000,
      env,
    });
    const hasOtherRunningContainers = Boolean(remaining.ok && remaining.stdout.trim().length > 0);
    if (!hasOtherRunningContainers) {
      await runCmd(runtime.binary, ['stop'], { timeoutMs: 10_000, env });
    }
  }
}
