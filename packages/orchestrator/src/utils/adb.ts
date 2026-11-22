import fs from 'node:fs';
import path from 'node:path';

let cachedAdbPath: string | null = null;

/**
 * Resolves the ADB binary path with priority:
 * 1. QA_STUDIO_ADB_PATH (injected by Tauri desktop sidecar launcher)
 * 2. Bundled sibling `adb` / `adb.exe` next to the sidecar executable
 * 3. Standard Android SDK platform-tools locations
 * 4. Host PATH (`adb`)
 */
export function getAdbBinary(): string {
  if (cachedAdbPath) return cachedAdbPath;

  const envPath = process.env.QA_STUDIO_ADB_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    cachedAdbPath = envPath;
    return cachedAdbPath;
  }

  const exeDir = path.dirname(process.execPath);
  const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const siblingAdb = path.join(exeDir, adbName);
  if (fs.existsSync(siblingAdb)) {
    cachedAdbPath = siblingAdb;
    return cachedAdbPath;
  }

  const home = process.env.HOME || process.env.USERPROFILE || '';
  const sdkCandidates = [
    path.join(home, 'Library/Android/sdk/platform-tools', adbName),
    path.join(home, 'Android/Sdk/platform-tools', adbName),
    path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools', adbName),
  ];

  for (const candidate of sdkCandidates) {
    if (candidate && fs.existsSync(candidate)) {
      cachedAdbPath = candidate;
      return cachedAdbPath;
    }
  }

  cachedAdbPath = 'adb';
  return cachedAdbPath;
}
