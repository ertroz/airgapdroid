#!/usr/bin/env node
/**
 * Compiles packages/orchestrator into a standalone Tauri sidecar binary
 * (`qa-orchestrator-<triple>`) in packages/desktop/src-tauri/binaries/.
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BINARIES_DIR = path.join(ROOT_DIR, 'packages', 'desktop', 'src-tauri', 'binaries');
const ORCHESTRATOR_DIR = path.join(ROOT_DIR, 'packages', 'orchestrator');

function detectHostTriple() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin') {
    return a === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  if (p === 'win32') {
    return 'x86_64-pc-windows-msvc';
  }
  return 'x86_64-unknown-linux-gnu';
}

function getPkgTarget(triple) {
  if (triple === 'aarch64-apple-darwin') return 'node20-macos-arm64';
  if (triple === 'x86_64-apple-darwin') return 'node20-macos-x64';
  if (triple === 'x86_64-pc-windows-msvc') return 'node20-win-x64';
  return 'node20-linux-x64';
}

function commandExists(cmd) {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function loadRootDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    parsed[key] = val;
  }
  return parsed;
}

function buildPublicDefines() {
  const dotEnv = loadRootDotEnv();
  const readPublic = (key) => (process.env[key]?.trim() || dotEnv[key]?.trim() || '');
  const publicMap = [
    ['__QA_GUMROAD_PRODUCT_ID__', readPublic('GUMROAD_PRODUCT_ID')],
    ['__QA_GUMROAD_PRODUCT_PERMALINK__', readPublic('GUMROAD_PRODUCT_PERMALINK')],
    ['__QA_GUMROAD_CHECKOUT_URL__', readPublic('GUMROAD_CHECKOUT_URL')],
    ['__QA_GOOGLE_OAUTH_CLIENT_ID__', readPublic('GOOGLE_OAUTH_CLIENT_ID')],
    ['__QA_MACOS_BINDER_KERNEL_URL__', readPublic('MACOS_BINDER_KERNEL_URL')],
    ['__QA_WSL_BINDER_KERNEL_URL__', readPublic('WSL_BINDER_KERNEL_URL')],
  ];
  return publicMap
    .filter(([, val]) => val.length > 0)
    .map(([key, val]) => `--define:${key}=${JSON.stringify(val)}`);
}

function main() {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  const triple = targetIdx >= 0 && args[targetIdx + 1] ? args[targetIdx + 1] : detectHostTriple();
  const isWin = triple.includes('windows');
  const ext = isWin ? '.exe' : '';

  fs.mkdirSync(BINARIES_DIR, { recursive: true });

  // Clean up obsolete ws-scrcpy sidecar if present (replaced by built-in screen stream on :8000)
  const obsoleteWsScrcpy = path.join(BINARIES_DIR, `ws-scrcpy-${triple}${ext}`);
  if (fs.existsSync(obsoleteWsScrcpy)) {
    fs.unlinkSync(obsoleteWsScrcpy);
  }

  // 1. Build orchestrator TypeScript & bundle to single CommonJS file via esbuild
  console.log('[1/2] Bundling @qa-studio/orchestrator with esbuild...');
  const distBundle = path.join(ORCHESTRATOR_DIR, 'dist', 'sidecar-bundle.cjs');
  execSync('npm run build --workspace=@qa-studio/orchestrator', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
  execFileSync(
    'npx',
    [
      '--yes',
      'esbuild',
      path.join(ORCHESTRATOR_DIR, 'src', 'index.ts'),
      '--bundle',
      '--platform=node',
      '--target=node20',
      '--format=cjs',
      ...buildPublicDefines(),
      `--outfile=${distBundle}`,
    ],
    { cwd: ROOT_DIR, stdio: 'inherit' }
  );

  // 2. Compile standalone qa-orchestrator binary (prefer bun build --compile, fallback to @yao-pkg/pkg)
  const orchestratorOut = path.join(BINARIES_DIR, `qa-orchestrator-${triple}${ext}`);
  console.log(`[2/2] Compiling standalone sidecar: ${path.basename(orchestratorOut)}...`);

  if (commandExists('bun')) {
    execFileSync(
      'bun',
      ['build', '--compile', distBundle, '--outfile', orchestratorOut],
      { cwd: ROOT_DIR, stdio: 'inherit' }
    );
  } else {
    execFileSync(
      'npx',
      [
        '--yes',
        '@yao-pkg/pkg',
        distBundle,
        '--targets',
        getPkgTarget(triple),
        '--output',
        orchestratorOut,
      ],
      { cwd: ROOT_DIR, stdio: 'inherit' }
    );
  }

  console.log(`\nSidecar binary ready in ${BINARIES_DIR}:`);
  console.log(`  - ${path.basename(orchestratorOut)}`);
}

main();
