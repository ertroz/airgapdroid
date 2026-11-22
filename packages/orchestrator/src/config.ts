import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env if present
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

function parseIntWithDefault(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

const qaStudioHome = path.join(os.homedir(), '.qa-studio');
const certsHomeDir = path.join(qaStudioHome, 'certs');
const apkTmpDir = '/tmp/qa-apks';
const mitmWebPort = Number(process.env.MITM_WEB_PORT || 8082);
const gumroadProductId = process.env.GUMROAD_PRODUCT_ID?.trim() || '';
const gumroadProductPermalink = process.env.GUMROAD_PRODUCT_PERMALINK?.trim() || '';
const gumroadEnabled = Boolean(gumroadProductId || gumroadProductPermalink);
const allowDemoProRaw = process.env.QA_ALLOW_DEMO_PRO?.trim().toLowerCase();
const allowDemoPro =
  allowDemoProRaw === 'true'
    ? true
    : allowDemoProRaw === 'false'
      ? false
      : !gumroadEnabled;

export const config = {
  port: Number(process.env.PORT || 4000),
  webUiUrl: process.env.WEB_UI_URL || 'http://localhost:3000',
  containerRuntime: (process.env.CONTAINER_RUNTIME?.trim().toLowerCase() || 'auto') as
    | 'auto'
    | 'kiri'
    | 'docker',
  kiriBinary: process.env.KIRI_BINARY?.trim() || 'kiri',
  kiriForkRepo:
    process.env.KIRI_REPO?.trim() || process.env.KIRI_FORK_REPO?.trim() || 'libracoder/kiri',
  wslBinderKernelUrl: process.env.WSL_BINDER_KERNEL_URL?.trim() || '',
  macosBinderKernelUrl: process.env.MACOS_BINDER_KERNEL_URL?.trim() || '',
  autoStopKiriOnExit: process.env.AUTO_STOP_KIRI_ON_EXIT !== 'false',
  wsScrcpyPort: Number(process.env.WS_SCRCPY_PORT || 8000),
  mitmProxyPort: Number(process.env.MITM_PROXY_PORT || 8080),
  mitmWebPort,
  mitmWebUpstreamPort: Number(process.env.MITM_WEB_UPSTREAM_PORT || mitmWebPort + 10000),
  mitmWebPassword: process.env.MITM_WEB_PASSWORD?.trim() || 'qa-studio',
  metroPort: 8081,
  proxyHostOverride: process.env.QA_PROXY_HOST?.trim() || '',
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '',
  gumroadProductId,
  gumroadProductPermalink,
  gumroadCheckoutUrl: process.env.GUMROAD_CHECKOUT_URL?.trim() || '',
  gumroadMaxUses: parseIntWithDefault(process.env.GUMROAD_MAX_USES, 3, 0),
  gumroadOfflineGraceDays: parseIntWithDefault(process.env.GUMROAD_OFFLINE_GRACE_DAYS, 7, 1),
  gumroadReverifyHours: parseIntWithDefault(process.env.GUMROAD_REVERIFY_HOURS, 24, 1),
  gumroadApiBaseUrl: (process.env.GUMROAD_API_BASE_URL?.trim() || 'https://api.gumroad.com').replace(/\/+$/, ''),
  gumroadEnabled,
  allowDemoPro,
  licenseValidationUrl: process.env.LICENSE_VALIDATION_URL?.trim() || '',
  demoProDefault: allowDemoPro && process.env.QA_DEMO_PRO === 'true',
  repoRoot,
  paths: {
    qaStudioHome,
    certsHomeDir,
    kiriGuestDir:
      process.env.KIRI_GUEST_DIR?.trim() || path.join(qaStudioHome, 'kiri-guest'),
    runtimeStateFile: path.join(qaStudioHome, 'runtime-state.json'),
    testSuitesFile: path.join(qaStudioHome, 'test-suites.json'),
    flowsDir: path.join(qaStudioHome, 'flows'),
    recordingsDir: path.join(qaStudioHome, 'recordings'),
    reportsDir: path.join(qaStudioHome, 'reports'),
    exportsDir: path.join(qaStudioHome, 'reports', 'exports'),
    certsRepoDir: path.join(repoRoot, 'certs'),
    mitmRepoDir: path.join(repoRoot, '.mitmproxy'),
    licenseFile: path.join(qaStudioHome, 'license.json'),
    firebaseProfilesFile: path.join(qaStudioHome, 'firebase-profiles.json'),
    firebaseAuthFile: path.join(qaStudioHome, 'firebase-auth.enc'),
    apkTmpDir,
  },
} as const;

export function ensureStudioDirectories(): void {
  fs.mkdirSync(config.paths.qaStudioHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(config.paths.certsHomeDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(config.paths.flowsDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(config.paths.recordingsDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(config.paths.reportsDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(config.paths.exportsDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(config.paths.apkTmpDir, { recursive: true, mode: 0o755 });
}
