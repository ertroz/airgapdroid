import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getAdbBinary } from './adb.js';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCmd(
  command: string,
  args: string[] = [],
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const resolvedCmd = command === 'adb' ? getAdbBinary() : command;
  try {
    const { stdout, stderr } = await execFileAsync(resolvedCmd, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: options.env ?? process.env,
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (err: unknown) {
    const error = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      message?: string;
    };
    const exitCode = typeof error.code === 'number' ? error.code : 1;
    return {
      ok: false,
      stdout: (error.stdout ?? '').toString().trim(),
      stderr: ((error.stderr ?? '').toString().trim() || error.message || 'Command failed').trim(),
      exitCode,
    };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
