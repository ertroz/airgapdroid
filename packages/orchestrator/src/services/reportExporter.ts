import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { config, ensureStudioDirectories } from '../config.js';
import type { ExportedBugReport, FlowRunReport } from '../types.js';
import { runCmd, sleep } from '../utils/shell.js';
import { getAdbBinary } from '../utils/adb.js';
import { getFlowRunReport, listFlowRunReports } from './automationRecorder.js';
import { logcatService } from './logcatService.js';
import { supportsMediaCodecH264 } from './screenStreamService.js';
import { getActiveSession } from './sessionService.js';

let activeScreenRecord: {
  proc: ChildProcess;
  serial: string;
  remotePath: string;
  startedAt: string;
  outputBuffer: string[];
} | null = null;

let lastRecordedVideoFile: string | null = null;
let lastScreenRecordError: string | null = null;

function createHttpError(message: string, statusCode = 400): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export function getScreenRecordStatus(): {
  recording: boolean;
  serial?: string;
  startedAt?: string;
  lastVideoFile: string | null;
  lastError: string | null;
} {
  return {
    recording: Boolean(activeScreenRecord),
    serial: activeScreenRecord?.serial,
    startedAt: activeScreenRecord?.startedAt,
    lastVideoFile: lastRecordedVideoFile,
    lastError: lastScreenRecordError,
  };
}

export async function startScreenRecord(requestedSerial?: string): Promise<{
  recording: boolean;
  serial: string;
  startedAt: string;
}> {
  if (activeScreenRecord) {
    return {
      recording: true,
      serial: activeScreenRecord.serial,
      startedAt: activeScreenRecord.startedAt,
    };
  }

  const serial = requestedSerial?.trim() || getActiveSession().deviceSerial;
  if (!serial) {
    throw createHttpError('No active device session. Start Kiri Mode or Direct ADB Mode first.', 400);
  }

  const hasH264Encoder = await supportsMediaCodecH264(serial);
  if (!hasH264Encoder) {
    const msg =
      'Hardware H.264 MediaCodec encoder is unavailable on this device (common on Redroid without /dev/dma_heap). Use live Screen Viewer or Bug Report ZIP screenshots instead.';
    lastScreenRecordError = msg;
    logcatService.emitSystem(`Screen record unavailable on ${serial}: ${msg}`);
    throw createHttpError(msg, 400);
  }

  lastScreenRecordError = null;
  const adb = getAdbBinary();
  const remotePath = '/sdcard/qa-studio-screenrecord.mp4';
  await runCmd(adb, ['-s', serial, 'shell', 'rm', '-f', remotePath], { timeoutMs: 5000 });

  const proc = spawn(
    adb,
    ['-s', serial, 'shell', 'screenrecord', '--time-limit', '180', remotePath],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const startedAt = new Date().toISOString();
  const outputBuffer: string[] = [];
  const state = { proc, serial, remotePath, startedAt, outputBuffer };
  activeScreenRecord = state;

  const appendOut = (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim();
    if (text && outputBuffer.length < 20) {
      outputBuffer.push(text);
    }
  };
  proc.stdout?.on('data', appendOut);
  proc.stderr?.on('data', appendOut);

  let exitedEarly = false;
  let exitCode: number | null = null;
  proc.on('close', (code) => {
    exitedEarly = true;
    exitCode = code;
    if (activeScreenRecord?.proc === proc) {
      const detail = outputBuffer.join(' ').trim();
      lastScreenRecordError =
        detail || `adb screenrecord exited unexpectedly (code ${code ?? 'signal'}).`;
      activeScreenRecord = null;
      logcatService.emitSystem(`Screen record ended early: ${lastScreenRecordError}`);
    }
  });

  // Give screenrecord a brief startup window to detect immediate codec/permission failures
  await sleep(600);
  if (exitedEarly) {
    const detail = outputBuffer.join(' ').trim();
    const errMsg =
      detail ||
      `Device screenrecord failed immediately on startup (exit ${exitCode ?? 'signal'}).`;
    lastScreenRecordError = errMsg;
    throw createHttpError(errMsg, 400);
  }

  logcatService.emitSystem(`Started device screenrecord on ${serial}...`);
  return { recording: true, serial, startedAt };
}

export async function stopScreenRecord(): Promise<{
  stopped: boolean;
  videoFile: string | null;
  sizeBytes: number;
  error?: string;
}> {
  if (!activeScreenRecord) {
    return {
      stopped: false,
      videoFile: null,
      sizeBytes: 0,
      error: lastScreenRecordError || 'No active screen recording in progress.',
    };
  }

  const { serial, remotePath, proc, outputBuffer } = activeScreenRecord;
  activeScreenRecord = null;

  const adb = getAdbBinary();
  // Send SIGINT inside Android so MP4 moov atom is finalized cleanly
  await runCmd(adb, ['-s', serial, 'shell', 'pkill', '-2', 'screenrecord'], { timeoutMs: 5000 });
  try {
    proc.kill('SIGINT');
  } catch {
    // ignore
  }
  await sleep(1200);

  ensureStudioDirectories();
  const fileName = `recording-${Date.now()}.mp4`;
  const localPath = path.join(config.paths.recordingsDir, fileName);
  const pullRes = await runCmd(adb, ['-s', serial, 'pull', remotePath, localPath], {
    timeoutMs: 30_000,
  });

  if (pullRes.ok && fs.existsSync(localPath)) {
    const sizeBytes = fs.statSync(localPath).size;
    if (sizeBytes > 0) {
      lastRecordedVideoFile = fileName;
      lastScreenRecordError = null;
      logcatService.emitSystem(`Saved screen recording ${fileName} (${(sizeBytes / 1024).toFixed(0)} KB).`);
      return { stopped: true, videoFile: fileName, sizeBytes };
    }
    try {
      fs.unlinkSync(localPath);
    } catch {
      // ignore
    }
  }

  const errDetail =
    outputBuffer.join(' ').trim() ||
    [pullRes.stderr, pullRes.stdout].filter(Boolean).join(' ').trim() ||
    'Device screenrecord did not produce a valid .mp4 file.';
  lastScreenRecordError = errDetail;
  return { stopped: false, videoFile: null, sizeBytes: 0, error: errDetail };
}

export function formatBugReportMarkdown(report: FlowRunReport, videoFile?: string): string {
  const failedSteps = report.stepResults.filter((s) => s.status === 'FAIL');
  const lines: string[] = [
    `## QA Bug & Test Report — ${report.flowName}`,
    '',
    `- **Status:** **${report.status}** (${report.passedSteps}/${report.totalSteps} steps passed)`,
    `- **Device:** \`${report.deviceSerial}\``,
    `- **Source:** \`${report.source}\``,
    `- **Duration:** ${(report.durationMs / 1000).toFixed(2)}s`,
    `- **Executed At:** ${report.startedAt}`,
    ...(videoFile ? [`- **Screen Recording:** \`${videoFile}\` (attached in ZIP)`] : []),
    '',
    '### Step-by-Step Summary',
    '| # | Step | Action | Status | Duration | Detail |',
    '|---|------|--------|--------|----------|--------|',
    ...report.stepResults.map(
      (s, idx) =>
        `| ${idx + 1} | ${s.label} | \`${s.action}\` | **${s.status}** | ${s.durationMs}ms | ${s.detail.replace(/\|/g, '\\|')} |`
    ),
  ];

  if (failedSteps.length > 0) {
    lines.push('', '### Failure Evidence');
    for (const f of failedSteps) {
      lines.push(
        `- **Step ${f.index + 1} (${f.label}):** ${f.detail}${
          f.screenshotFile ? ` _(screenshot: \`${f.screenshotFile}\`)_` : ''
        }`
      );
    }
  }

  if (report.failedApiRequests.length > 0) {
    lines.push('', '### Failed API Requests (`mitmproxy`)');
    for (const req of report.failedApiRequests) {
      lines.push(`- \`${req.status}\` **${req.method}** \`${req.url}\``);
    }
  }

  if (report.errorLogs.length > 0) {
    lines.push('', '### Logcat Error Snippet (`adb logcat *:E`)', '```text', ...report.errorLogs.slice(-25), '```');
  }

  return lines.join('\n');
}

export async function exportBugReportBundle(input?: {
  runId?: string;
  failedApiRequests?: Array<{ method: string; url: string; status: number }>;
}): Promise<ExportedBugReport> {
  ensureStudioDirectories();

  let report: FlowRunReport | null = input?.runId
    ? getFlowRunReport(input.runId)
    : listFlowRunReports()[0] ?? null;

  const session = getActiveSession();
  if (!report) {
    // Allow exporting an ad-hoc bug report from current session + logcat even before running a flow
    report = {
      id: `run-${Date.now()}-${crypto.randomUUID().slice(0, 4)}`,
      source: 'flow',
      flowName: 'Manual QA Session Snapshot',
      deviceSerial: session.deviceSerial || 'no-device',
      status: 'PASS',
      startedAt: session.startedAt || new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      passedSteps: 0,
      failedSteps: 0,
      totalSteps: 0,
      stepResults: [],
      errorLogs: logcatService.getRecentErrors(40),
      screenshotFiles: [],
      failedApiRequests: input?.failedApiRequests ?? [],
    };
  } else if (input?.failedApiRequests && input.failedApiRequests.length > 0) {
    report = { ...report, failedApiRequests: input.failedApiRequests };
  }

  const videoFile = report.videoFile || lastRecordedVideoFile || undefined;
  const markdown = formatBugReportMarkdown(report, videoFile);

  const reportId = `bug-report-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`;
  const zipFileName = `${reportId}.zip`;
  const zipPath = path.join(config.paths.exportsDir, zipFileName);

  const zip = new AdmZip();
  zip.addFile('BUG_REPORT.md', Buffer.from(markdown, 'utf8'));
  zip.addFile('run-summary.json', Buffer.from(JSON.stringify(report, null, 2), 'utf8'));

  if (report.errorLogs.length > 0) {
    zip.addFile('logcat-errors.txt', Buffer.from(report.errorLogs.join('\n'), 'utf8'));
  }

  for (const shot of report.screenshotFiles) {
    const shotPath = path.join(config.paths.reportsDir, 'screenshots', shot);
    if (fs.existsSync(shotPath)) {
      zip.addLocalFile(shotPath, 'screenshots');
    }
  }

  if (videoFile) {
    const vidPath = path.join(config.paths.recordingsDir, videoFile);
    if (fs.existsSync(vidPath)) {
      zip.addLocalFile(vidPath, 'videos');
    }
  }

  zip.writeZip(zipPath);

  return {
    reportId,
    runId: report.id,
    zipFileName,
    downloadUrl: `/api/reports/download/${reportId}`,
    markdown,
    createdAt: new Date().toISOString(),
  };
}

export function resolveExportZipPath(reportId: string): string | null {
  const safe = path.basename(reportId).replace(/[^a-zA-Z0-9._-]/g, '');
  const target = path.join(config.paths.exportsDir, `${safe}.zip`);
  return fs.existsSync(target) ? target : null;
}
