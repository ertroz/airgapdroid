import fs from 'node:fs';
import path from 'node:path';
import { getAdbBinary } from '../utils/adb.js';
import { runCmd } from '../utils/shell.js';
import { logcatService } from './logcatService.js';
import { getActiveSession } from './sessionService.js';

const PACKAGE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

function createHttpError(message: string, statusCode = 400): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function resolveTargetSerial(requestedSerial?: string): string {
  const serial = requestedSerial?.trim() || getActiveSession().deviceSerial;
  if (!serial) {
    throw createHttpError(
      'No active QA session or target device serial. Start a session first.',
      400
    );
  }
  return serial;
}

export async function installApkOnDevice(
  apkFilePath: string,
  requestedSerial?: string
): Promise<{ ok: boolean; serial: string; fileName: string; output: string; durationMs: number }> {
  const serial = resolveTargetSerial(requestedSerial);
  if (!fs.existsSync(apkFilePath)) {
    throw createHttpError(`APK file not found at ${apkFilePath}`, 400);
  }

  const fileName = path.basename(apkFilePath);
  const startTime = Date.now();
  logcatService.emitSystem(`Installing APK ${fileName} to ${serial}...`);

  const res = await runCmd(getAdbBinary(), ['-s', serial, 'install', '-r', '-d', apkFilePath], {
    timeoutMs: 180_000,
  });

  const durationMs = Date.now() - startTime;
  const output = [res.stdout, res.stderr].filter(Boolean).join('\n');

  if (!res.ok || output.includes('Failure [')) {
    logcatService.emitSystem(`APK install failed (${fileName}): ${output}`);
    throw createHttpError(`ADB install failed: ${output || 'Unknown error'}`, 400);
  }

  logcatService.emitSystem(`Installed ${fileName} on ${serial} in ${(durationMs / 1000).toFixed(1)}s.`);
  return {
    ok: true,
    serial,
    fileName,
    output: output || 'Success',
    durationMs,
  };
}

export async function clearAppData(
  packageName: string,
  requestedSerial?: string
): Promise<{ ok: boolean; serial: string; packageName: string; output: string }> {
  const serial = resolveTargetSerial(requestedSerial);
  const pkg = packageName.trim();

  if (!PACKAGE_NAME_REGEX.test(pkg)) {
    throw createHttpError('Invalid Android package name (example: com.example.myapp).', 400);
  }

  const res = await runCmd(getAdbBinary(), ['-s', serial, 'shell', 'pm', 'clear', pkg], {
    timeoutMs: 15_000,
  });
  const output = [res.stdout, res.stderr].filter(Boolean).join('\n');

  if (!res.ok || output.toLowerCase().includes('failed')) {
    throw createHttpError(`Failed to clear app data for ${pkg}: ${output || 'Package not found'}`, 400);
  }

  logcatService.emitSystem(`Cleared app data for ${pkg} on ${serial}.`);
  return {
    ok: true,
    serial,
    packageName: pkg,
    output: output || 'Success',
  };
}
