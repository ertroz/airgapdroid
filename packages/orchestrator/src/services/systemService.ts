import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { config } from '../config.js';
import type {
  AdbDeviceInfo,
  ContainerEngine,
  ContainerRuntimeStatus,
  KernelModulesStatus,
  RuntimeMode,
  SystemCheckReport,
} from '../types.js';
import { runCmd, sleep } from '../utils/shell.js';

function detectWsl(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const procVersion = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return procVersion.includes('microsoft') || procVersion.includes('wsl');
  } catch {
    return false;
  }
}

export function findAndroidCaCertificate(): { fullPath: string; fileName: string } | null {
  const searchDirs = [
    config.paths.certsHomeDir,
    config.paths.certsRepoDir,
    config.paths.mitmRepoDir,
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      const match = files.find((f) => /^[0-9a-fA-F]{8}\.0$/.test(f));
      if (match) {
        return { fullPath: path.join(dir, match), fileName: match };
      }
    } catch {
      // Ignore unreadable directory
    }
  }
  return null;
}

interface RuntimeStateCache {
  engine: ContainerEngine;
  kiriVersion?: string;
  binderVerified: boolean;
  kernelPath?: string;
  verifiedAt: string;
}

function readRuntimeState(): RuntimeStateCache | null {
  try {
    if (!fs.existsSync(config.paths.runtimeStateFile)) return null;
    return JSON.parse(fs.readFileSync(config.paths.runtimeStateFile, 'utf8')) as RuntimeStateCache;
  } catch {
    return null;
  }
}

function writeRuntimeState(state: RuntimeStateCache): void {
  try {
    fs.mkdirSync(config.paths.qaStudioHome, { recursive: true });
    fs.writeFileSync(config.paths.runtimeStateFile, JSON.stringify(state, null, 2), {
      mode: 0o600,
    });
  } catch {
    // non-fatal cache write error
  }
}

function clearRuntimeState(): void {
  try {
    if (fs.existsSync(config.paths.runtimeStateFile)) {
      fs.unlinkSync(config.paths.runtimeStateFile);
    }
  } catch {
    // ignore cache clear error
  }
}

function getLatestMacosBinderKernelUrl(): string {
  for (const envPath of [
    path.join(config.paths.qaStudioHome, '.env'),
    path.join(config.repoRoot, '.env'),
  ]) {
    try {
      if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        const val = parsed.MACOS_BINDER_KERNEL_URL?.trim();
        if (val) return val;
      }
    } catch {
      // Fallback to next candidate
    }
  }
  return config.macosBinderKernelUrl;
}

function resolveKiriBinaryPath(): string {
  const configured = config.kiriBinary;
  if (configured.includes('/')) return configured;

  const candidates = [
    '/Applications/Kiri.app/Contents/MacOS/kiri',
    path.join(os.homedir(), 'Applications/Kiri.app/Contents/MacOS/kiri'),
    path.join(os.homedir(), '.kiri/bin/kiri'),
    '/opt/homebrew/bin/kiri',
    '/usr/local/bin/kiri',
  ];

  // Prefer PATH if available, otherwise check known macOS/Linux bundle locations
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const full = path.join(dir, configured);
    if (fs.existsSync(full)) return full;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return configured;
}

export function getKiriEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const extraDirs = [
    '/Applications/Kiri.app/Contents/MacOS',
    '/Applications/Kiri.app/Contents/Resources/bin',
    path.join(os.homedir(), 'Applications/Kiri.app/Contents/MacOS'),
    path.join(os.homedir(), 'Applications/Kiri.app/Contents/Resources/bin'),
    path.join(os.homedir(), '.kiri/bin'),
  ].filter((d) => fs.existsSync(d));

  if (extraDirs.length > 0) {
    env.PATH = `${extraDirs.join(path.delimiter)}${path.delimiter}${env.PATH || ''}`;
  }

  if (process.platform === 'darwin') {
    const guestDir = config.paths.kiriGuestDir;
    const kernelName = process.arch === 'arm64' ? 'Image' : 'bzImage';
    if (fs.existsSync(path.join(guestDir, kernelName))) {
      env.KIRI_GUEST_DIR = guestDir;
    }
  }
  return env;
}

async function restartMacosKiriDaemon(guestDir?: string): Promise<boolean> {
  const kiriBin = resolveKiriBinaryPath();
  const kiriEnv = getKiriEnv();
  if (guestDir) {
    kiriEnv.KIRI_GUEST_DIR = guestDir;
    await runCmd('launchctl', ['setenv', 'KIRI_GUEST_DIR', guestDir], { timeoutMs: 5000 });

    const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/dev.kiri.daemon.plist');
    if (fs.existsSync(plistPath)) {
      await runCmd(
        '/usr/libexec/PlistBuddy',
        ['-c', 'Add :EnvironmentVariables dict', plistPath],
        { timeoutMs: 4000 }
      );
      const setRes = await runCmd(
        '/usr/libexec/PlistBuddy',
        ['-c', `Set :EnvironmentVariables:KIRI_GUEST_DIR ${guestDir}`, plistPath],
        { timeoutMs: 4000 }
      );
      if (!setRes.ok) {
        await runCmd(
          '/usr/libexec/PlistBuddy',
          ['-c', `Add :EnvironmentVariables:KIRI_GUEST_DIR string ${guestDir}`, plistPath],
          { timeoutMs: 4000 }
        );
      }
    }
  }

  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  let restarted = false;

  if (uid !== undefined) {
    const kickRes = await runCmd(
      'launchctl',
      ['kickstart', '-k', `gui/${uid}/dev.kiri.daemon`],
      { timeoutMs: 10_000 }
    );
    restarted = kickRes.ok;

    if (!restarted) {
      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/dev.kiri.daemon.plist');
      if (fs.existsSync(plistPath)) {
        const bootRes = await runCmd(
          'launchctl',
          ['bootstrap', `gui/${uid}`, plistPath],
          { timeoutMs: 10_000 }
        );
        restarted = bootRes.ok;
      }
    }
  }

  if (!restarted) {
    try {
      const child = spawn(kiriBin, ['daemon'], {
        detached: true,
        stdio: 'ignore',
        env: kiriEnv,
      });
      child.unref();
    } catch {
      if (fs.existsSync('/Applications/Kiri.app')) {
        await runCmd('open', ['-a', 'Kiri'], { timeoutMs: 8000, env: kiriEnv });
      }
    }
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const infoRes = await runCmd(kiriBin, ['info', '--format', '{{.ServerVersion}}'], {
      timeoutMs: 3000,
      env: kiriEnv,
    });
    if (infoRes.ok) return true;
    await sleep(500);
  }
  return false;
}

export async function detectContainerRuntime(): Promise<ContainerRuntimeStatus> {
  const kiriBin = resolveKiriBinaryPath();
  const forkRepo = config.kiriForkRepo;
  const forkReleasesUrl = `https://github.com/${forkRepo}/releases/latest`;
  const kiriEnv = getKiriEnv();

  const [kiriVer, kiriInfo, dockerVer, dockerInfo] = await Promise.all([
    runCmd(kiriBin, ['--version'], { timeoutMs: 4000, env: kiriEnv }),
    runCmd(kiriBin, ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 6000, env: kiriEnv }),
    runCmd('docker', ['--version'], { timeoutMs: 4000 }),
    runCmd('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 6000 }),
  ]);

  const kiriInstalled = kiriVer.ok || kiriInfo.ok;
  const kiriRunning = kiriInfo.ok;
  const dockerInstalled = dockerVer.ok || dockerInfo.ok;
  const dockerRunning = dockerInfo.ok;

  let engine: ContainerEngine = 'none';
  let binary = kiriBin;

  if (config.containerRuntime === 'kiri') {
    if (kiriRunning) {
      engine = 'kiri';
      binary = kiriBin;
    }
  } else if (config.containerRuntime === 'docker') {
    if (dockerRunning) {
      engine = 'docker';
      binary = 'docker';
    }
  } else {
    // Kiri-first auto detection, fallback to Docker
    if (kiriRunning) {
      engine = 'kiri';
      binary = kiriBin;
    } else if (dockerRunning) {
      engine = 'docker';
      binary = 'docker';
    }
  }

  const needsConfig = kiriInstalled && !kiriRunning;

  return {
    engine,
    binary,
    preferredRuntime: config.containerRuntime,
    kiriInstalled,
    kiriRunning,
    kiriVersion: kiriVer.ok
      ? kiriVer.stdout.split(/\r?\n/)[0]
      : kiriInfo.ok
        ? kiriInfo.stdout.split(/\r?\n/)[0]
        : undefined,
    dockerInstalled,
    dockerRunning,
    dockerVersion: dockerInfo.ok ? dockerInfo.stdout.split(/\r?\n/)[0] : undefined,
    needsConfig,
    forkRepo,
    forkReleasesUrl,
    installCommand: 'npm run runtime:install',
    configCommand: `${kiriBin} start`,
  };
}

export async function resolveContainerRuntime(): Promise<{
  engine: ContainerEngine;
  binary: string;
}> {
  const status = await detectContainerRuntime();
  return { engine: status.engine, binary: status.binary };
}

export async function configureKiriRuntime(): Promise<{
  ok: boolean;
  message: string;
  report: SystemCheckReport;
}> {
  const kiriBin = resolveKiriBinaryPath();
  const kiriEnv = getKiriEnv();
  const checkBin = await runCmd(kiriBin, ['--version'], { timeoutMs: 4000, env: kiriEnv });

  if (!checkBin.ok) {
    const report = await runSystemCheck();
    return {
      ok: false,
      message: `'${kiriBin}' is not installed on PATH. Run 'npm run runtime:install' or download from ${report.containerRuntime.forkReleasesUrl}.`,
      report,
    };
  }

  // Wake/start Kiri engine and point docker CLI context if docker CLI is present
  if (process.platform === 'darwin') {
    const preCheck = await runCmd(kiriBin, ['info', '--format', '{{.ServerVersion}}'], {
      timeoutMs: 4000,
      env: kiriEnv,
    });
    if (!preCheck.ok) {
      await restartMacosKiriDaemon(kiriEnv.KIRI_GUEST_DIR);
    }
  } else {
    await runCmd(kiriBin, ['start'], { timeoutMs: 15_000, env: kiriEnv });
  }
  const infoRes = await runCmd(kiriBin, ['info', '--format', '{{.ServerVersion}}'], {
    timeoutMs: 10_000,
    env: kiriEnv,
  });

  await runCmd('docker', ['context', 'use', 'kiri'], { timeoutMs: 5000 });

  const report = await runSystemCheck();
  if (infoRes.ok || report.containerRuntime.kiriRunning) {
    return {
      ok: true,
      message: 'Kiri engine is configured and running.',
      report,
    };
  }

  return {
    ok: false,
    message:
      infoRes.stderr ||
      `Could not start '${kiriBin}'. Open the Kiri desktop app once to complete initial setup.`,
    report,
  };
}

function upsertWslConfigKernel(wslConfigPath: string, kernelWinPath: string): void {
  const escapedKernel = kernelWinPath.replace(/\\/g, '\\\\');
  const kernelLine = `kernel=${escapedKernel}`;

  if (!fs.existsSync(wslConfigPath)) {
    fs.writeFileSync(wslConfigPath, `[wsl2]\n${kernelLine}\n`, 'utf8');
    return;
  }

  const lines = fs.readFileSync(wslConfigPath, 'utf8').split(/\r?\n/);
  let inWsl2 = false;
  let wsl2Found = false;
  let kernelUpdated = false;
  const output: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[.+\]$/.test(trimmed)) {
      if (inWsl2 && !kernelUpdated) {
        output.push(kernelLine);
        kernelUpdated = true;
      }
      inWsl2 = trimmed.toLowerCase() === '[wsl2]';
      if (inWsl2) wsl2Found = true;
      output.push(line);
      continue;
    }

    if (inWsl2 && /^kernel\s*=/i.test(trimmed)) {
      output.push(kernelLine);
      kernelUpdated = true;
      continue;
    }

    output.push(line);
  }

  if (!wsl2Found) {
    output.push('', '[wsl2]', kernelLine);
  } else if (inWsl2 && !kernelUpdated) {
    output.push(kernelLine);
  }

  fs.writeFileSync(wslConfigPath, `${output.join('\n').trimEnd()}\n`, 'utf8');
}

export async function configureBinderSupport(): Promise<{
  ok: boolean;
  message: string;
  report: SystemCheckReport;
}> {
  if (process.platform === 'linux') {
    // Attempt non-interactive modprobe first (works when running with CAP_SYS_MODULE or passwordless sudo)
    const direct = await runCmd(
      'modprobe',
      ['binder_linux', 'devices=binder,hwbinder,vndbinder'],
      { timeoutMs: 8000 }
    );
    if (!direct.ok) {
      await runCmd(
        'sudo',
        ['-n', 'modprobe', 'binder_linux', 'devices=binder,hwbinder,vndbinder'],
        { timeoutMs: 8000 }
      );
    }

    const report = await runSystemCheck();
    if (report.kernelModulesReady.ready) {
      return {
        ok: true,
        message: 'Linux binder_linux module loaded successfully. Redroid is ready on Kiri.',
        report,
      };
    }

    return {
      ok: false,
      message:
        'Root privileges are required to load binder_linux. Copy and run the sudo modprobe command in your terminal.',
      report,
    };
  }

  if (process.platform === 'win32') {
    const kernelDir = path.join(config.paths.qaStudioHome, 'wsl-kernel');
    const kernelPath = path.join(kernelDir, 'bzImage');
    fs.mkdirSync(kernelDir, { recursive: true });

    if (!fs.existsSync(kernelPath)) {
      if (!config.wslBinderKernelUrl) {
        const report = await runSystemCheck();
        return {
          ok: false,
          message:
            'Set WSL_BINDER_KERNEL_URL in .env (or place a binder-enabled WSL2 bzImage at ~/.qa-studio/wsl-kernel/bzImage) to auto-configure .wslconfig.',
          report,
        };
      }

      const res = await fetch(config.wslBinderKernelUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        throw new Error(`Failed to download WSL2 binder kernel (HTTP ${res.status}).`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(kernelPath, buf);
    }

    const wslConfigPath = path.join(os.homedir(), '.wslconfig');
    upsertWslConfigKernel(wslConfigPath, kernelPath);

    await runCmd('wsl', ['--shutdown'], { timeoutMs: 15_000 });
    await runCmd(config.kiriBinary, ['start'], { timeoutMs: 15_000 });

    const report = await runSystemCheck();
    return {
      ok: report.kernelModulesReady.ready,
      message: report.kernelModulesReady.ready
        ? `Updated ${wslConfigPath} with binder-enabled WSL2 kernel and restarted WSL2 + Kiri.`
        : `Updated ${wslConfigPath} and restarted WSL2. Re-check once Kiri finishes waking up.`,
      report,
    };
  }

  // macOS: Use KIRI_GUEST_DIR with Kiri Official (keeps /Applications/Kiri.app Apple signature intact)
  const guestDir = config.paths.kiriGuestDir;
  const kernelFileName = process.arch === 'arm64' ? 'Image' : 'bzImage';
  const kernelTarget = path.join(guestDir, kernelFileName);
  const kernelSourceFile = path.join(guestDir, '.kernel-source-url');
  fs.mkdirSync(guestDir, { recursive: true });

  // Copy companion guest assets from Kiri.app bundle if missing
  const bundleResourceDirs = [
    '/Applications/Kiri.app/Contents/Resources',
    '/Applications/Kiri.app/Contents/Resources/guest',
    path.join(os.homedir(), 'Applications/Kiri.app/Contents/Resources'),
    path.join(os.homedir(), 'Applications/Kiri.app/Contents/Resources/guest'),
  ];
  for (const assetName of ['initramfs.cpio', 'data.img', 'data.img.tgz']) {
    const dest = path.join(guestDir, assetName);
    if (fs.existsSync(dest)) continue;
    for (const srcDir of bundleResourceDirs) {
      const candidate = path.join(srcDir, assetName);
      if (fs.existsSync(candidate)) {
        fs.copyFileSync(candidate, dest);
        break;
      }
    }
  }

  const macosBinderKernelUrl = getLatestMacosBinderKernelUrl();
  const recordedUrl = fs.existsSync(kernelSourceFile)
    ? fs.readFileSync(kernelSourceFile, 'utf8').trim()
    : '';
  const hasValidKernelFile = fs.existsSync(kernelTarget) && fs.statSync(kernelTarget).size > 0;
  const needsDownload =
    !hasValidKernelFile || (Boolean(macosBinderKernelUrl) && recordedUrl !== macosBinderKernelUrl);

  if (needsDownload) {
    if (!macosBinderKernelUrl) {
      const report = await runSystemCheck();
      return {
        ok: false,
        message: `Set MACOS_BINDER_KERNEL_URL in .env (or place your compiled binder-enabled ${kernelFileName} in ${guestDir}) to enable Redroid on Kiri Official.`,
        report,
      };
    }

    const res = await fetch(macosBinderKernelUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`Failed to download macOS Kiri binder kernel (HTTP ${res.status}).`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      throw new Error('Downloaded macOS Kiri binder kernel is empty.');
    }
    const tmpTarget = `${kernelTarget}.tmp`;
    fs.writeFileSync(tmpTarget, buf);
    fs.renameSync(tmpTarget, kernelTarget);
    fs.writeFileSync(kernelSourceFile, `${macosBinderKernelUrl}\n`, 'utf8');
  }

  // Clear cached binder probe and restart Kiri LaunchAgent daemon with KIRI_GUEST_DIR
  clearRuntimeState();
  await restartMacosKiriDaemon(guestDir);

  const report = await runSystemCheck();
  return {
    ok: report.kernelModulesReady.ready,
    message: report.kernelModulesReady.ready
      ? `Kiri Official restarted with binder-enabled guest kernel via KIRI_GUEST_DIR (${guestDir}).`
      : `Placed ${kernelFileName} in ${guestDir} and restarted Kiri daemon, but binderfs was still not detected in the guest VM.`,
    report,
  };
}

export function detectHostProxyIp(mode: RuntimeMode, engine: ContainerEngine = 'kiri'): string {
  if (config.proxyHostOverride) {
    return config.proxyHostOverride;
  }

  const interfaces = os.networkInterfaces();

  if (mode === 'docker') {
    if (engine === 'kiri') {
      // Kiri default bridge gateway: 198.19.248.254 on macOS, 172.18.0.1 on Linux/Windows
      if (process.platform === 'darwin') {
        return '198.19.248.254';
      }
      const kiriBridge = interfaces['kiri0']?.find(
        (iface) => iface.family === 'IPv4' && !iface.internal
      );
      if (kiriBridge?.address) {
        return kiriBridge.address;
      }
    }

    // Standard docker0 bridge IP on Linux
    const docker0 = interfaces['docker0']?.find(
      (iface) => iface.family === 'IPv4' && !iface.internal
    );
    if (docker0?.address) {
      return docker0.address;
    }

    if (process.platform !== 'linux') {
      return 'host.docker.internal';
    }
  }

  // Prefer primary non-internal IPv4 LAN address (usable by physical Android devices on same Wi-Fi & containers)
  const preferredOrder = ['en0', 'eth0', 'wlan0', 'wlp', 'enp', 'Wi-Fi', 'Ethernet'];
  const allIpv4: Array<{ name: string; address: string }> = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) {
        allIpv4.push({ name, address: entry.address });
      }
    }
  }

  for (const prefix of preferredOrder) {
    const found = allIpv4.find((item) => item.name.startsWith(prefix));
    if (found) return found.address;
  }

  return allIpv4[0]?.address ?? '127.0.0.1';
}

async function checkKernelModules(
  isWsl: boolean,
  runtime: ContainerRuntimeStatus
): Promise<KernelModulesStatus> {
  // On macOS / Windows with Kiri running, check binder directly inside the Kiri guest kernel
  // Uses ~/.qa-studio/runtime-state.json cache so repeated launches return instantly (<20ms)
  if (process.platform !== 'linux') {
    if (runtime.engine === 'kiri' && runtime.kiriRunning) {
      const expectedKernelPath =
        process.platform === 'darwin'
          ? path.join(config.paths.kiriGuestDir, process.arch === 'arm64' ? 'Image' : 'bzImage')
          : path.join(config.paths.qaStudioHome, 'wsl-kernel', 'bzImage');

      const cached = readRuntimeState();
      const cacheValid =
        cached &&
        cached.engine === 'kiri' &&
        cached.binderVerified &&
        cached.kiriVersion === runtime.kiriVersion &&
        (!cached.kernelPath || fs.existsSync(cached.kernelPath));

      if (cacheValid) {
        return {
          applicable: true,
          ready: true,
          binder: true,
          ashmem: true,
          checkedInGuestVm: true,
          message:
            'Android binderfs verified (cached for current Kiri version). Redroid containers are ready.',
          fixCommands: [],
        };
      }

      const probe = await runCmd(
        runtime.binary,
        ['run', '--rm', 'alpine', 'sh', '-c', 'grep -qi binder /proc/filesystems && echo OK'],
        { timeoutMs: 8000, env: getKiriEnv() }
      );
      const guestBinder = probe.ok && probe.stdout.includes('OK');

      if (guestBinder) {
        writeRuntimeState({
          engine: 'kiri',
          kiriVersion: runtime.kiriVersion,
          binderVerified: true,
          kernelPath: fs.existsSync(expectedKernelPath) ? expectedKernelPath : undefined,
          verifiedAt: new Date().toISOString(),
        });
        return {
          applicable: true,
          ready: true,
          binder: true,
          ashmem: true,
          checkedInGuestVm: true,
          message:
            'Android binderfs is active inside Kiri guest kernel. Redroid containers are ready!',
          fixCommands: [],
        };
      }

      const fixCommands =
        process.platform === 'darwin'
          ? [
              '# Set MACOS_BINDER_KERNEL_URL in .env or place compiled Image in ~/.qa-studio/kiri-guest/',
              '# Then click "Auto-Configure Kiri Guest Kernel (KIRI_GUEST_DIR)" above.',
            ]
          : [
              '# Windows Kiri uses WSL2 kernel — set WSL_BINDER_KERNEL_URL in .env and click Auto-Configure above',
              'wsl --shutdown',
            ];

      return {
        applicable: true,
        ready: false,
        binder: false,
        ashmem: false,
        checkedInGuestVm: true,
        message:
          process.platform === 'darwin'
            ? 'Kiri Official is running, but binderfs was not detected in the guest kernel. Click Auto-Configure to attach your binder-enabled guest kernel via KIRI_GUEST_DIR.'
            : 'Kiri Official is running, but WSL2 kernel does not expose binderfs yet. Click Auto-Configure to set a binder-enabled WSL2 kernel in .wslconfig.',
        fixCommands,
      };
    }

    return {
      applicable: false,
      ready: false,
      binder: false,
      ashmem: false,
      message:
        'Install your binder-enabled Kiri fork for container Android on macOS/Windows, or use Direct ADB Mode with a physical phone.',
      fixCommands: ['npm run runtime:install'],
    };
  }

  let binder =
    fs.existsSync('/dev/binder') ||
    fs.existsSync('/dev/binderfs') ||
    fs.existsSync('/dev/binder-control');
  let ashmem = fs.existsSync('/dev/ashmem');

  try {
    const filesystems = fs.readFileSync('/proc/filesystems', 'utf8');
    if (filesystems.includes('binder')) binder = true;
  } catch {
    // ignore
  }

  try {
    const misc = fs.readFileSync('/proc/misc', 'utf8');
    if (misc.includes('ashmem')) ashmem = true;
    if (misc.includes('binder')) binder = true;
  } catch {
    // ignore
  }

  if (!binder || !ashmem) {
    const lsmod = await runCmd('lsmod', [], { timeoutMs: 5000 });
    if (lsmod.ok) {
      if (lsmod.stdout.includes('binder_linux')) binder = true;
      if (lsmod.stdout.includes('ashmem_linux')) ashmem = true;
    }
  }

  // Android 11+ Redroid works with binderfs + memfd even without legacy ashmem
  const ready = binder;

  const fixCommands: string[] = [];
  if (!ready) {
    if (isWsl) {
      fixCommands.push(
        '# WSL2 requires a kernel compiled with CONFIG_ANDROID_BINDERFS=y',
        'sudo modprobe binder_linux devices="binder,hwbinder,vndbinder"',
        '# Or point %UserProfile%\\.wslconfig to your custom Redroid-ready WSL2 kernel'
      );
    } else {
      fixCommands.push(
        'sudo apt-get update && sudo apt-get install -y linux-modules-extra-$(uname -r)',
        'sudo modprobe binder_linux devices="binder,hwbinder,vndbinder"',
        'sudo modprobe ashmem_linux || true'
      );
    }
  }

  return {
    applicable: true,
    ready,
    binder,
    ashmem,
    message: ready
      ? ashmem
        ? 'Kernel modules binder and ashmem are active and ready for Redroid.'
        : 'Kernel binderfs is active (Android 11+ uses memfd, ready for Redroid).'
      : 'Missing Linux Android binder module (binder_linux / binderfs).',
    fixCommands,
  };
}

export async function listAdbDevices(): Promise<AdbDeviceInfo[]> {
  const result = await runCmd('adb', ['devices', '-l'], { timeoutMs: 8000 });
  if (!result.ok) return [];

  const lines = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('List of devices') && !l.startsWith('*'));

  const devices: AdbDeviceInfo[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const serial = parts[0];
    const state = parts[1];
    const meta: Record<string, string> = {};

    for (const token of parts.slice(2)) {
      const idx = token.indexOf(':');
      if (idx > 0) {
        meta[token.slice(0, idx)] = token.slice(idx + 1);
      }
    }

    let transportType: AdbDeviceInfo['transportType'] = 'unknown';
    if (serial.startsWith('emulator-')) {
      transportType = 'emulator';
    } else if (serial.includes(':')) {
      transportType = 'network';
    } else if (meta.usb) {
      transportType = 'usb';
    } else {
      transportType = 'usb';
    }

    devices.push({
      serial,
      state,
      model: meta.model?.replace(/_/g, ' '),
      product: meta.product,
      device: meta.device,
      transportType,
    });
  }

  return devices;
}

export async function runSystemCheck(): Promise<SystemCheckReport> {
  const platform = process.platform;
  const isWsl = detectWsl();

  const [containerRuntime, adbVersion, maestroVer] = await Promise.all([
    detectContainerRuntime(),
    runCmd('adb', ['version'], { timeoutMs: 5000 }),
    runCmd('maestro', ['--version'], { timeoutMs: 4000 }),
  ]);

  const kernelModulesReady = await checkKernelModules(isWsl, containerRuntime);
  const dockerAvailable = containerRuntime.engine !== 'none';
  const adbAvailable = adbVersion.ok;
  const maestroAvailable = maestroVer.ok;
  const connectedDevices = adbAvailable ? await listAdbDevices() : [];
  const cert = findAndroidCaCertificate();

  const readyForDocker =
    dockerAvailable && adbAvailable && (!kernelModulesReady.applicable || kernelModulesReady.ready);

  // Recommend Container Mode ('docker') whenever Kiri or Docker is ready with binder (including macOS Kiri fork!)
  const recommendedMode: RuntimeMode =
    dockerAvailable && (platform === 'linux' || kernelModulesReady.ready) ? 'docker' : 'direct-adb';

  const dockerFixCommand = containerRuntime.kiriInstalled
    ? containerRuntime.configCommand
    : containerRuntime.installCommand;

  const adbFixCommand =
    platform === 'linux'
      ? 'sudo apt-get update && sudo apt-get install -y android-tools-adb'
      : platform === 'darwin'
        ? 'brew install android-platform-tools'
        : 'winget install Google.PlatformTools';

  return {
    timestamp: new Date().toISOString(),
    os: platform,
    osRelease: os.release(),
    arch: os.arch(),
    isWsl,
    containerRuntime,
    dockerAvailable,
    dockerVersion:
      containerRuntime.engine === 'kiri'
        ? containerRuntime.kiriVersion
        : containerRuntime.dockerVersion,
    dockerError: dockerAvailable
      ? undefined
      : containerRuntime.kiriInstalled
        ? `Kiri (${containerRuntime.binary}) is installed but engine is stopped. Click Configure/Start Kiri.`
        : `Neither Kiri (${containerRuntime.binary}) nor Docker daemon is available. Install Kiri from your fork releases.`,
    dockerFixCommand: dockerAvailable ? undefined : dockerFixCommand,
    kernelModulesReady,
    adbAvailable,
    adbVersion: adbAvailable ? adbVersion.stdout.split(/\r?\n/)[0] : undefined,
    adbError: adbAvailable ? undefined : adbVersion.stderr || 'ADB binary not found in PATH.',
    adbFixCommand: adbAvailable ? undefined : adbFixCommand,
    maestroAvailable,
    maestroVersion: maestroAvailable ? maestroVer.stdout.split(/\r?\n/)[0] : undefined,
    connectedDevices,
    certReady: Boolean(cert),
    certFileName: cert?.fileName,
    certFixCommand: 'npm run certs:setup',
    recommendedMode,
    readyForDocker,
    readyForDirectAdb: adbAvailable,
  };
}
