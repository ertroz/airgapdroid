import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Optional compile-time public configuration injected when bundling desktop sidecars
declare const __QA_GUMROAD_PRODUCT_ID__: string | undefined;
declare const __QA_GUMROAD_PRODUCT_PERMALINK__: string | undefined;
declare const __QA_GUMROAD_CHECKOUT_URL__: string | undefined;
declare const __QA_GOOGLE_OAUTH_CLIENT_ID__: string | undefined;
declare const __QA_MACOS_BINDER_KERNEL_URL__: string | undefined;
declare const __QA_WSL_BINDER_KERNEL_URL__: string | undefined;

const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const candidateRepoRoot = path.resolve(currentDir, '..', '..', '..');
const isMonorepo = fs.existsSync(
  path.join(candidateRepoRoot, 'packages', 'orchestrator', 'package.json')
);
const repoRoot = isMonorepo ? candidateRepoRoot : process.cwd();

const qaStudioHome = path.join(os.homedir(), '.qa-studio');

// Load optional user-level ~/.qa-studio/.env first, then monorepo .env when running from source
const homeEnvPath = path.join(qaStudioHome, '.env');
if (fs.existsSync(homeEnvPath)) {
  dotenv.config({ path: homeEnvPath });
}
if (isMonorepo) {
  dotenv.config({ path: path.join(repoRoot, '.env') });
}

function parseIntWithDefault(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

const bakedGumroadProductId =
  typeof __QA_GUMROAD_PRODUCT_ID__ !== 'undefined' ? __QA_GUMROAD_PRODUCT_ID__ : '';
const bakedGumroadProductPermalink =
  typeof __QA_GUMROAD_PRODUCT_PERMALINK__ !== 'undefined' ? __QA_GUMROAD_PRODUCT_PERMALINK__ : '';
const bakedGumroadCheckoutUrl =
  typeof __QA_GUMROAD_CHECKOUT_URL__ !== 'undefined' ? __QA_GUMROAD_CHECKOUT_URL__ : '';
const bakedGoogleOAuthClientId =
  typeof __QA_GOOGLE_OAUTH_CLIENT_ID__ !== 'undefined' ? __QA_GOOGLE_OAUTH_CLIENT_ID__ : '';
const bakedMacosBinderKernelUrl =
  typeof __QA_MACOS_BINDER_KERNEL_URL__ !== 'undefined' ? __QA_MACOS_BINDER_KERNEL_URL__ : '';
const bakedWslBinderKernelUrl =
  typeof __QA_WSL_BINDER_KERNEL_URL__ !== 'undefined' ? __QA_WSL_BINDER_KERNEL_URL__ : '';

const certsHomeDir = path.join(qaStudioHome, 'certs');
const apkTmpDir = '/tmp/qa-apks';
const mitmWebPort = Number(process.env.MITM_WEB_PORT || 8082);
const gumroadProductId = process.env.GUMROAD_PRODUCT_ID?.trim() || bakedGumroadProductId;
const gumroadProductPermalink =
  process.env.GUMROAD_PRODUCT_PERMALINK?.trim() || bakedGumroadProductPermalink;
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
  wslBinderKernelUrl: process.env.WSL_BINDER_KERNEL_URL?.trim() || bakedWslBinderKernelUrl,
  macosBinderKernelUrl: process.env.MACOS_BINDER_KERNEL_URL?.trim() || bakedMacosBinderKernelUrl,
  autoStopKiriOnExit: process.env.AUTO_STOP_KIRI_ON_EXIT !== 'false',
  wsScrcpyPort: Number(process.env.WS_SCRCPY_PORT || 8000),
  mitmProxyPort: Number(process.env.MITM_PROXY_PORT || 8080),
  mitmWebPort,
  mitmWebUpstreamPort: Number(process.env.MITM_WEB_UPSTREAM_PORT || mitmWebPort + 10000),
  mitmWebPassword: process.env.MITM_WEB_PASSWORD?.trim() || 'qa-studio',
  metroPort: 8081,
  proxyHostOverride: process.env.QA_PROXY_HOST?.trim() || '',
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || bakedGoogleOAuthClientId,
  gumroadProductId,
  gumroadProductPermalink,
  gumroadCheckoutUrl: process.env.GUMROAD_CHECKOUT_URL?.trim() || bakedGumroadCheckoutUrl,
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
    certsRepoDir: isMonorepo ? path.join(repoRoot, 'certs') : certsHomeDir,
    mitmRepoDir: isMonorepo ? path.join(repoRoot, '.mitmproxy') : path.join(qaStudioHome, 'mitmproxy'),
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
