import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { config, ensureStudioDirectories } from '../config.js';
import type { TestReport, TestStep, TestStepResult, TestSuite } from '../types.js';
import { runCmd, sleep } from '../utils/shell.js';
import { logcatService } from './logcatService.js';
import { getActiveSession } from './sessionService.js';

const execFileBinaryAsync = promisify(execFile);

const DEFAULT_SUITES: TestSuite[] = [
  {
    id: 'default-smoke-suite',
    name: 'Android Settings Smoke Test',
    description: 'Launches Android Settings, verifies foreground window, captures screenshot, and navigates back.',
    packageName: 'com.android.settings',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step-1',
        action: 'launch_app',
        label: 'Launch Settings App',
        packageName: 'com.android.settings',
      },
      {
        id: 'step-2',
        action: 'wait',
        label: 'Wait for UI render',
        durationMs: 1500,
      },
      {
        id: 'step-3',
        action: 'assert_foreground',
        label: 'Verify Settings in foreground',
        packageName: 'com.android.settings',
      },
      {
        id: 'step-4',
        action: 'screenshot',
        label: 'Capture Smoke Screenshot',
      },
      {
        id: 'step-5',
        action: 'keyevent',
        label: 'Press Home',
        keycode: 'KEYCODE_HOME',
      },
    ],
  },
];

function readSuites(): TestSuite[] {
  ensureStudioDirectories();
  if (!fs.existsSync(config.paths.testSuitesFile)) {
    fs.writeFileSync(config.paths.testSuitesFile, JSON.stringify(DEFAULT_SUITES, null, 2));
    return DEFAULT_SUITES;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(config.paths.testSuitesFile, 'utf8')) as TestSuite[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SUITES;
  } catch {
    return DEFAULT_SUITES;
  }
}

function writeSuites(suites: TestSuite[]): void {
  ensureStudioDirectories();
  fs.writeFileSync(config.paths.testSuitesFile, JSON.stringify(suites, null, 2));
}

export function listTestSuites(): TestSuite[] {
  return readSuites();
}

export function saveTestSuite(input: {
  id?: string;
  name: string;
  description?: string;
  packageName?: string;
  steps: TestStep[];
}): TestSuite {
  if (!input.name?.trim()) {
    const err = new Error('Test suite name is required.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    const err = new Error('Test suite must contain at least one step.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const suites = readSuites();
  const now = new Date().toISOString();
  const normalizedSteps = input.steps.map((s, idx) => ({
    ...s,
    id: s.id || `step-${idx + 1}-${crypto.randomUUID().slice(0, 6)}`,
  }));

  const existingIdx = input.id ? suites.findIndex((s) => s.id === input.id) : -1;
  let saved: TestSuite;
  if (existingIdx >= 0) {
    saved = {
      ...suites[existingIdx],
      name: input.name.trim(),
      description: input.description?.trim(),
      packageName: input.packageName?.trim(),
      steps: normalizedSteps,
      updatedAt: now,
    };
    suites[existingIdx] = saved;
  } else {
    saved = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim(),
      packageName: input.packageName?.trim(),
      steps: normalizedSteps,
      createdAt: now,
      updatedAt: now,
    };
    suites.unshift(saved);
  }

  writeSuites(suites);
  return saved;
}

export function deleteTestSuite(id: string): TestSuite[] {
  const suites = readSuites().filter((s) => s.id !== id);
  writeSuites(suites);
  return suites;
}

async function captureDeviceScreenshot(serial: string, reportId: string, stepIdx: number): Promise<string> {
  const screenshotsDir = path.join(config.paths.reportsDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const fileName = `${reportId}-step-${stepIdx + 1}.png`;
  const targetPath = path.join(screenshotsDir, fileName);

  const { stdout } = await execFileBinaryAsync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    maxBuffer: 25 * 1024 * 1024,
    timeout: 15_000,
  });

  if (!stdout || stdout.length < 64) {
    throw new Error('Empty screenshot buffer returned by device.');
  }
  fs.writeFileSync(targetPath, stdout);
  return fileName;
}

async function executeStep(
  serial: string,
  step: TestStep,
  reportId: string,
  stepIdx: number,
  fallbackPkg?: string
): Promise<TestStepResult> {
  const start = Date.now();
  const label = step.label?.trim() || `${step.action}`;

  try {
    switch (step.action) {
      case 'launch_app': {
        const pkg = step.packageName?.trim() || fallbackPkg;
        if (!pkg) throw new Error('packageName is required for launch_app.');
        const res = await runCmd(
          'adb',
          ['-s', serial, 'shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'],
          { timeoutMs: 15_000 }
        );
        if (!res.ok || res.stdout.includes('No activities found')) {
          throw new Error(res.stderr || res.stdout || `Failed to launch ${pkg}`);
        }
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Launched ${pkg}`,
        };
      }

      case 'tap': {
        const x = Number(step.x ?? 540);
        const y = Number(step.y ?? 960);
        const res = await runCmd('adb', ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], {
          timeoutMs: 8000,
        });
        if (!res.ok) throw new Error(res.stderr || 'adb input tap failed');
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Tapped (${x}, ${y})`,
        };
      }

      case 'swipe': {
        const x1 = Number(step.x ?? 540);
        const y1 = Number(step.y ?? 1400);
        const x2 = Number(step.x2 ?? 540);
        const y2 = Number(step.y2 ?? 400);
        const dur = Number(step.durationMs ?? 300);
        const res = await runCmd(
          'adb',
          ['-s', serial, 'shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(dur)],
          { timeoutMs: 10_000 }
        );
        if (!res.ok) throw new Error(res.stderr || 'adb input swipe failed');
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Swiped (${x1},${y1}) -> (${x2},${y2}) in ${dur}ms`,
        };
      }

      case 'input_text': {
        const rawText = step.text ?? '';
        const escaped = rawText.replace(/\s+/g, '%s');
        const res = await runCmd('adb', ['-s', serial, 'shell', 'input', 'text', escaped], {
          timeoutMs: 8000,
        });
        if (!res.ok) throw new Error(res.stderr || 'adb input text failed');
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Entered text (${rawText.length} chars)`,
        };
      }

      case 'keyevent': {
        const key = step.keycode?.trim() || 'KEYCODE_HOME';
        const res = await runCmd('adb', ['-s', serial, 'shell', 'input', 'keyevent', key], {
          timeoutMs: 8000,
        });
        if (!res.ok) throw new Error(res.stderr || 'adb input keyevent failed');
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Sent keyevent ${key}`,
        };
      }

      case 'wait': {
        const ms = Math.max(100, Math.min(30_000, Number(step.durationMs ?? 1000)));
        await sleep(ms);
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Waited ${ms}ms`,
        };
      }

      case 'assert_foreground': {
        const pkg = step.packageName?.trim() || fallbackPkg;
        if (!pkg) throw new Error('packageName is required for assert_foreground.');
        const res = await runCmd(
          'adb',
          ['-s', serial, 'shell', 'dumpsys window windows | grep -E "mCurrentFocus|mFocusedApp" || dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity"'],
          { timeoutMs: 10_000 }
        );
        if (!res.ok || !res.stdout.includes(pkg)) {
          throw new Error(`Expected ${pkg} in foreground, got: ${res.stdout.slice(0, 160) || 'unknown'}`);
        }
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Confirmed ${pkg} is active in foreground`,
        };
      }

      case 'monkey_stress': {
        const pkg = step.packageName?.trim() || fallbackPkg;
        const count = Math.max(10, Math.min(2000, Number(step.eventCount ?? 100)));
        const args = ['-s', serial, 'shell', 'monkey'];
        if (pkg) args.push('-p', pkg);
        args.push('--throttle', '50', '--ignore-crashes', String(count));
        const res = await runCmd('adb', args, { timeoutMs: 60_000 });
        if (!res.ok) throw new Error(res.stderr || res.stdout || 'Monkey stress test failed');
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Completed ${count} randomized UI events${pkg ? ` on ${pkg}` : ''}`,
        };
      }

      case 'screenshot': {
        const screenshotFile = await captureDeviceScreenshot(serial, reportId, stepIdx);
        return {
          stepId: step.id,
          action: step.action,
          label,
          status: 'passed',
          durationMs: Date.now() - start,
          detail: `Captured ${screenshotFile}`,
          screenshotFile,
        };
      }
    }
  } catch (err) {
    let screenshotFile: string | undefined;
    try {
      screenshotFile = await captureDeviceScreenshot(serial, reportId, stepIdx);
    } catch {
      // ignore screenshot failure on error
    }
    return {
      stepId: step.id,
      action: step.action,
      label,
      status: 'failed',
      durationMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
      screenshotFile,
    };
  }
}

export async function runAutomatedTestSuite(input: {
  suiteId?: string;
  suite?: { name: string; packageName?: string; steps: TestStep[] };
  deviceSerial?: string;
  notes?: string;
}): Promise<TestReport> {
  const session = getActiveSession();
  const serial = input.deviceSerial?.trim() || session.deviceSerial;
  if (!serial) {
    const err = new Error(
      'No active QA session or target device. Start Kiri Mode or Direct ADB Mode first.'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  let suite: TestSuite | undefined;
  if (input.suiteId) {
    suite = readSuites().find((s) => s.id === input.suiteId);
    if (!suite) {
      const err = new Error('Test suite not found.') as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
  } else if (input.suite) {
    suite = {
      id: 'adhoc',
      name: input.suite.name || 'Ad-hoc Automated Run',
      packageName: input.suite.packageName,
      steps: input.suite.steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    suite = readSuites()[0];
  }

  const reportId = `rep-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  logcatService.emitSystem(`Running automated test suite "${suite.name}" on ${serial}...`);

  const stepResults: TestStepResult[] = [];
  for (let i = 0; i < suite.steps.length; i++) {
    const result = await executeStep(serial, suite.steps[i], reportId, i, suite.packageName);
    stepResults.push(result);
  }

  const passedSteps = stepResults.filter((r) => r.status === 'passed').length;
  const failedSteps = stepResults.length - passedSteps;
  const report: TestReport = {
    id: reportId,
    suiteId: suite.id,
    suiteName: suite.name,
    deviceSerial: serial,
    mode: session.mode,
    androidVersion: session.androidVersion,
    status: failedSteps === 0 ? 'passed' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    passedSteps,
    failedSteps,
    totalSteps: stepResults.length,
    stepResults,
    errorLogs: logcatService.getRecentErrors(40),
    notes: input.notes?.trim() || undefined,
  };

  ensureStudioDirectories();
  fs.writeFileSync(
    path.join(config.paths.reportsDir, `${reportId}.json`),
    JSON.stringify(report, null, 2)
  );

  logcatService.emitSystem(
    `Automated suite "${suite.name}" finished: ${report.status.toUpperCase()} (${passedSteps}/${stepResults.length} passed).`
  );

  return report;
}

export function listTestReports(): TestReport[] {
  ensureStudioDirectories();
  const files = fs
    .readdirSync(config.paths.reportsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();

  const reports: TestReport[] = [];
  for (const file of files.slice(0, 50)) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(config.paths.reportsDir, file), 'utf8')
      ) as TestReport;
      reports.push(parsed);
    } catch {
      // skip corrupt report
    }
  }
  return reports;
}

export function getTestReport(id: string): TestReport | null {
  const safeId = path.basename(id).replace(/[^a-zA-Z0-9._-]/g, '');
  const target = path.join(config.paths.reportsDir, `${safeId}.json`);
  if (!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target, 'utf8')) as TestReport;
}

export function deleteTestReport(id: string): boolean {
  const safeId = path.basename(id).replace(/[^a-zA-Z0-9._-]/g, '');
  const target = path.join(config.paths.reportsDir, `${safeId}.json`);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    return true;
  }
  return false;
}

export function formatReportMarkdown(report: TestReport): string {
  const lines: string[] = [
    `# QA Automation Report — ${report.suiteName}`,
    '',
    `- **Report ID:** \`${report.id}\``,
    `- **Status:** **${report.status.toUpperCase()}** (${report.passedSteps}/${report.totalSteps} steps passed)`,
    `- **Device:** \`${report.deviceSerial}\`${report.androidVersion ? ` (Android ${report.androidVersion})` : ''}`,
    `- **Duration:** ${(report.durationMs / 1000).toFixed(2)}s`,
    `- **Timestamp:** ${report.startedAt}`,
    ...(report.notes ? [`- **QA Notes:** ${report.notes}`] : []),
    '',
    '## Step Results',
    '| # | Step | Action | Status | Duration | Detail |',
    '|---|------|--------|--------|----------|--------|',
    ...report.stepResults.map(
      (s, i) =>
        `| ${i + 1} | ${s.label} | \`${s.action}\` | ${s.status === 'passed' ? 'PASS' : 'FAIL'} | ${s.durationMs}ms | ${s.detail.replace(/\|/g, '\\|')} |`
    ),
  ];

  if (report.errorLogs.length > 0) {
    lines.push('', '## Captured Logcat Errors (`*:E`)', '```text', ...report.errorLogs, '```');
  }

  return lines.join('\n');
}

export function formatReportHtml(report: TestReport): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = report.stepResults
    .map(
      (s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(s.label)}</td>
        <td><code>${esc(s.action)}</code></td>
        <td><span class="badge ${s.status}">${s.status.toUpperCase()}</span></td>
        <td>${s.durationMs}ms</td>
        <td>${esc(s.detail)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>QA Report — ${esc(report.suiteName)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #09090b; color: #f4f4f5; padding: 32px; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 6px; }
    .meta { color: #a1a1aa; font-size: 13px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #27272a; }
    th { color: #a1a1aa; font-weight: 600; }
    .badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .passed { background: rgba(16,185,129,0.15); color: #34d399; }
    .failed { background: rgba(244,63,94,0.15); color: #fb7185; }
    pre { background: #141418; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; color: #fda4af; }
  </style>
</head>
<body>
  <h1>QA Automation Report: ${esc(report.suiteName)}</h1>
  <div class="meta">
    Status: <strong>${report.status.toUpperCase()}</strong> (${report.passedSteps}/${report.totalSteps}) ·
    Device: <code>${esc(report.deviceSerial)}</code> ·
    Duration: ${(report.durationMs / 1000).toFixed(2)}s ·
    ${esc(report.startedAt)}
  </div>
  <table>
    <thead><tr><th>#</th><th>Step</th><th>Action</th><th>Status</th><th>Duration</th><th>Detail</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${
    report.errorLogs.length > 0
      ? `<h2>Captured Logcat Errors</h2><pre>${esc(report.errorLogs.join('\n'))}</pre>`
      : ''
  }
</body>
</html>`;
}
