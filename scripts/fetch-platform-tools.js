#!/usr/bin/env node
/**
 * Downloads official Google Android Platform Tools and extracts `adb`
 * into packages/desktop/src-tauri/binaries/adb-<target-triple> for Tauri bundling.
 *
 * Usage:
 *   node scripts/fetch-platform-tools.js
 *   node scripts/fetch-platform-tools.js --target aarch64-apple-darwin
 *   node scripts/fetch-platform-tools.js --target universal-apple-darwin
 *   node scripts/fetch-platform-tools.js --all
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BINARIES_DIR = path.join(ROOT_DIR, 'packages', 'desktop', 'src-tauri', 'binaries');

const PLATFORM_URLS = {
  darwin: 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip',
  windows: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  linux: 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip',
};

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

function getDownloadGroup(triple) {
  if (triple.includes('apple-darwin')) return 'darwin';
  if (triple.includes('windows')) return 'windows';
  return 'linux';
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const readable = Readable.fromWeb(res.body);
  await pipeline(readable, fs.createWriteStream(destPath));
}

function extractZip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${outDir}" -Force`,
      ],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', outDir], { stdio: 'inherit' });
  }
}

function copyExecutable(src, dest) {
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
}

async function fetchForTriple(triple) {
  if (triple === 'universal-apple-darwin') {
    const universalTargets = [
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
      'universal-apple-darwin',
    ];
    fs.mkdirSync(BINARIES_DIR, { recursive: true });

    const existingUniversal = universalTargets
      .map((t) => path.join(BINARIES_DIR, `adb-${t}`))
      .find((p) => fs.existsSync(p));

    if (existingUniversal) {
      for (const t of universalTargets) {
        const dest = path.join(BINARIES_DIR, `adb-${t}`);
        if (!fs.existsSync(dest)) {
          copyExecutable(existingUniversal, dest);
          console.log(`[3/3] Installed sidecar: ${dest}`);
        } else {
          console.log(`[SKIP] ${path.basename(dest)} already exists.`);
        }
      }
      return;
    }

    await fetchForTriple('aarch64-apple-darwin');
    const sourceBin = path.join(BINARIES_DIR, 'adb-aarch64-apple-darwin');
    for (const t of ['x86_64-apple-darwin', 'universal-apple-darwin']) {
      const dest = path.join(BINARIES_DIR, `adb-${t}`);
      if (!fs.existsSync(dest)) {
        copyExecutable(sourceBin, dest);
        console.log(`[3/3] Installed sidecar: ${dest}`);
      }
    }
    return;
  }

  const group = getDownloadGroup(triple);
  const url = PLATFORM_URLS[group];
  const isWin = group === 'windows';
  const ext = isWin ? '.exe' : '';
  const targetBin = path.join(BINARIES_DIR, `adb-${triple}${ext}`);

  fs.mkdirSync(BINARIES_DIR, { recursive: true });

  if (fs.existsSync(targetBin)) {
    console.log(`[SKIP] ${path.basename(targetBin)} already exists.`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-platform-tools-'));
  const zipPath = path.join(tmpDir, `platform-tools-${group}.zip`);

  try {
    console.log(`[1/3] Downloading ${url}...`);
    await downloadFile(url, zipPath);

    console.log(`[2/3] Extracting platform-tools for ${triple}...`);
    extractZip(zipPath, tmpDir);

    const extractedDir = path.join(tmpDir, 'platform-tools');
    const adbSrc = path.join(extractedDir, `adb${ext}`);
    if (!fs.existsSync(adbSrc)) {
      throw new Error(`Could not find ${adbSrc} in extracted archive.`);
    }

    fs.copyFileSync(adbSrc, targetBin);
    if (!isWin) {
      fs.chmodSync(targetBin, 0o755);
    } else {
      // Copy companion Windows ADB DLLs next to the sidecar binary
      for (const dll of ['AdbWinApi.dll', 'AdbWinUsbApi.dll']) {
        const dllSrc = path.join(extractedDir, dll);
        if (fs.existsSync(dllSrc)) {
          fs.copyFileSync(dllSrc, path.join(BINARIES_DIR, dll));
        }
      }
    }

    console.log(`[3/3] Installed sidecar: ${targetBin}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--all')) {
    const triples = [
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
      'universal-apple-darwin',
      'x86_64-pc-windows-msvc',
      'x86_64-unknown-linux-gnu',
    ];
    for (const triple of triples) {
      await fetchForTriple(triple);
    }
    return;
  }

  const targetIdx = args.indexOf('--target');
  const triple = targetIdx >= 0 && args[targetIdx + 1] ? args[targetIdx + 1] : detectHostTriple();
  await fetchForTriple(triple);
}

main().catch((err) => {
  console.error('[ERROR]', err instanceof Error ? err.message : err);
  process.exit(1);
});
