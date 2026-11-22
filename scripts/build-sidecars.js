#!/usr/bin/env node
/**
 * Compiles packages/orchestrator into a standalone Tauri sidecar binary
 * (`qa-orchestrator-<triple>`) and prepares `ws-scrcpy-<triple>` in
 * packages/desktop/src-tauri/binaries/.
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

function main() {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  const triple = targetIdx >= 0 && args[targetIdx + 1] ? args[targetIdx + 1] : detectHostTriple();
  const isWin = triple.includes('windows');
  const ext = isWin ? '.exe' : '';

  fs.mkdirSync(BINARIES_DIR, { recursive: true });

  // 1. Build orchestrator TypeScript & bundle to single CommonJS file via esbuild
  console.log('[1/3] Bundling @qa-studio/orchestrator with esbuild...');
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
      `--outfile=${distBundle}`,
    ],
    { cwd: ROOT_DIR, stdio: 'inherit' }
  );

  // 2. Compile standalone qa-orchestrator binary (prefer bun build --compile, fallback to @yao-pkg/pkg)
  const orchestratorOut = path.join(BINARIES_DIR, `qa-orchestrator-${triple}${ext}`);
  console.log(`[2/3] Compiling standalone sidecar: ${path.basename(orchestratorOut)}...`);

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

  // 3. Ensure ws-scrcpy sidecar binary exists (runs container or host ws-scrcpy on port 8000)
  const wsScrcpyOut = path.join(BINARIES_DIR, `ws-scrcpy-${triple}${ext}`);
  if (!fs.existsSync(wsScrcpyOut)) {
    console.log(`[3/3] Creating ws-scrcpy launcher sidecar: ${path.basename(wsScrcpyOut)}...`);
    const wsLauncherJs = path.join(ORCHESTRATOR_DIR, 'dist', 'ws-scrcpy-sidecar.cjs');
    fs.writeFileSync(
      wsLauncherJs,
      `const { spawn } = require('node:child_process');
const port = process.env.PORT || '8000';
const runtime = process.env.CONTAINER_RUNTIME === 'docker' ? 'docker' : 'kiri';
const child = spawn(
  runtime,
  [
    'run',
    '--rm',
    '-p',
    port + ':8000',
    '--add-host',
    'host.docker.internal:host-gateway',
    '--name',
    'qa-studio-ws-scrcpy',
    'emptysuns/scrcpy-web:v0.1',
    'sh',
    '-c',
    'adb start-server && (adb connect host.docker.internal:5555 || true); cd dist && exec node ./index.js',
  ],
  { stdio: 'inherit' }
);
child.on('exit', (code) => process.exit(code || 0));
process.on('SIGTERM', () => { child.kill('SIGTERM'); process.exit(0); });
`
    );
    if (commandExists('bun')) {
      execFileSync('bun', ['build', '--compile', wsLauncherJs, '--outfile', wsScrcpyOut], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
    } else {
      execFileSync(
        'npx',
        [
          '--yes',
          '@yao-pkg/pkg',
          wsLauncherJs,
          '--targets',
          getPkgTarget(triple),
          '--output',
          wsScrcpyOut,
        ],
        { cwd: ROOT_DIR, stdio: 'inherit' }
      );
    }
  } else {
    console.log(`[3/3] Found existing ${path.basename(wsScrcpyOut)}.`);
  }

  console.log('[SUCCESS] Desktop sidecars prepared in', BINARIES_DIR);
}

main();
