import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { config, ensureStudioDirectories } from '../config.js';
import type {
  FlowRunReport,
  FlowStepResult,
  RecordedFlow,
  RecordedFlowStep,
  UiHierarchyNode,
} from '../types.js';
import { runCmd, sleep } from '../utils/shell.js';
import { getAdbBinary } from '../utils/adb.js';
import { automationWs } from './automationWs.js';
import { logcatService } from './logcatService.js';
import { getActiveSession } from './sessionService.js';

const execFileBinaryAsync = promisify(execFile);

let activeRecordingFlow: RecordedFlow | null = null;

function resolveSerial(requested?: string): string {
  const serial = requested?.trim() || getActiveSession().deviceSerial;
  if (!serial) {
    const err = new Error('No active device session. Start Kiri Mode or Direct ADB Mode first.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }
  return serial;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseAttr(tag: string, name: string): string {
  const regex = new RegExp(`${name}="([^"]*)"`);
  const match = tag.match(regex);
  return match ? decodeXmlEntities(match[1]) : '';
}

export async function dumpUiHierarchy(requestedSerial?: string): Promise<UiHierarchyNode[]> {
  const serial = resolveSerial(requestedSerial);
  let xml = '';

  const ttyDump = await runCmd(
    'adb',
    ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty'],
    { timeoutMs: 12_000 }
  );

  if (ttyDump.ok && ttyDump.stdout.includes('<hierarchy')) {
    xml = ttyDump.stdout;
  } else {
    await runCmd('adb', ['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/qa_window_dump.xml'], {
      timeoutMs: 12_000,
    });
    const catDump = await runCmd('adb', ['-s', serial, 'shell', 'cat', '/sdcard/qa_window_dump.xml'], {
      timeoutMs: 8000,
    });
    xml = catDump.stdout;
  }

  const nodes: UiHierarchyNode[] = [];
  const nodeRegex = /<node\s+([^>]+)>/g;
  let match: RegExpExecArray | null;

  while ((match = nodeRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const boundsStr = parseAttr(attrs, 'bounds');
    const bMatch = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!bMatch) continue;

    const x1 = Number(bMatch[1]);
    const y1 = Number(bMatch[2]);
    const x2 = Number(bMatch[3]);
    const y2 = Number(bMatch[4]);
    if (x2 <= x1 || y2 <= y1) continue;

    nodes.push({
      text: parseAttr(attrs, 'text'),
      resourceId: parseAttr(attrs, 'resource-id'),
      contentDesc: parseAttr(attrs, 'content-desc'),
      className: parseAttr(attrs, 'class'),
      bounds: [x1, y1, x2, y2],
      clickable: parseAttr(attrs, 'clickable') === 'true',
    });
  }

  return nodes;
}

export function matchSmartSelector(
  nodes: UiHierarchyNode[],
  x: number,
  y: number
): RecordedFlowStep {
  // Find all nodes whose bounds contain (x, y), preferring smallest bounding area
  const containing = nodes
    .filter((n) => x >= n.bounds[0] && x <= n.bounds[2] && y >= n.bounds[1] && y <= n.bounds[3])
    .sort((a, b) => {
      const areaA = (a.bounds[2] - a.bounds[0]) * (a.bounds[3] - a.bounds[1]);
      const areaB = (b.bounds[2] - b.bounds[0]) * (b.bounds[3] - b.bounds[1]);
      return areaA - areaB;
    });

  // Prefer node with meaningful text or resource-id
  const best =
    containing.find((n) => n.text.trim() || n.resourceId.trim() || n.contentDesc.trim()) ??
    containing[0];

  const id = `step-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`;
  const roundedCoords: [number, number] = [Math.round(x), Math.round(y)];

  if (best?.text.trim()) {
    return {
      id,
      action: 'tap',
      selectorType: 'text',
      value: best.text.trim(),
      fallbackCoords: roundedCoords,
      label: `Tap "${best.text.trim()}"`,
    };
  }

  if (best?.resourceId.trim()) {
    const shortId = best.resourceId.includes('/')
      ? best.resourceId.split('/').pop()!
      : best.resourceId;
    return {
      id,
      action: 'tap',
      selectorType: 'id',
      value: best.resourceId.trim(),
      fallbackCoords: roundedCoords,
      label: `Tap #${shortId}`,
    };
  }

  if (best?.contentDesc.trim()) {
    return {
      id,
      action: 'tap',
      selectorType: 'text',
      value: best.contentDesc.trim(),
      fallbackCoords: roundedCoords,
      label: `Tap "${best.contentDesc.trim()}"`,
    };
  }

  return {
    id,
    action: 'tap',
    selectorType: 'coords',
    value: `${roundedCoords[0]},${roundedCoords[1]}`,
    fallbackCoords: roundedCoords,
    label: `Tap (${roundedCoords[0]}, ${roundedCoords[1]})`,
  };
}

export async function recordTapAtCoords(input: {
  x: number;
  y: number;
  deviceSerial?: string;
}): Promise<{ step: RecordedFlowStep; nodesCount: number }> {
  let nodes: UiHierarchyNode[] = [];
  try {
    nodes = await dumpUiHierarchy(input.deviceSerial);
  } catch {
    // Fallback to raw coords if uiautomator dump is unavailable on screen
  }

  const step = matchSmartSelector(nodes, input.x, input.y);

  // Execute the tap on the live device so QA sees immediate feedback while recording
  const serial = resolveSerial(input.deviceSerial);
  await runCmd(
    'adb',
    ['-s', serial, 'shell', 'input', 'tap', String(Math.round(input.x)), String(Math.round(input.y))],
    { timeoutMs: 8000 }
  );

  if (activeRecordingFlow) {
    activeRecordingFlow.steps.push(step);
    activeRecordingFlow.updatedAt = new Date().toISOString();
  }

  return { step, nodesCount: nodes.length };
}

export async function recordCustomStep(input: {
  action: RecordedFlowStep['action'];
  text?: string;
  value?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  durationMs?: number;
  appId?: string;
  deviceSerial?: string;
  executeOnDevice?: boolean;
}): Promise<RecordedFlowStep> {
  const id = `step-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`;
  let step: RecordedFlowStep;

  switch (input.action) {
    case 'inputText':
      step = {
        id,
        action: 'inputText',
        text: input.text ?? '',
        label: `Input "${input.text ?? ''}"`,
      };
      break;
    case 'assertVisible':
      step = {
        id,
        action: 'assertVisible',
        selectorType: 'text',
        value: input.value ?? input.text ?? '',
        label: `Assert "${input.value ?? input.text ?? ''}" visible`,
      };
      break;
    case 'swipe':
      step = {
        id,
        action: 'swipe',
        direction: input.direction ?? 'up',
        label: `Swipe ${input.direction ?? 'up'}`,
      };
      break;
    case 'back':
      step = { id, action: 'back', label: 'Press Back' };
      break;
    case 'wait':
      step = {
        id,
        action: 'wait',
        durationMs: input.durationMs ?? 1500,
        label: `Wait ${input.durationMs ?? 1500}ms`,
      };
      break;
    case 'launchApp':
      step = {
        id,
        action: 'launchApp',
        appId: input.appId ?? '',
        label: `Launch ${input.appId ?? 'app'}`,
      };
      break;
    default:
      step = { id, action: input.action, label: input.action };
  }

  if (input.executeOnDevice !== false && getActiveSession().deviceSerial) {
    const serial = resolveSerial(input.deviceSerial);
    if (step.action === 'inputText' && step.text) {
      await runCmd('adb', ['-s', serial, 'shell', 'input', 'text', step.text.replace(/\s+/g, '%s')], {
        timeoutMs: 8000,
      });
    } else if (step.action === 'back') {
      await runCmd('adb', ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], {
        timeoutMs: 6000,
      });
    } else if (step.action === 'swipe') {
      const coords =
        step.direction === 'down'
          ? ['540', '400', '540', '1400']
          : step.direction === 'left'
            ? ['900', '960', '180', '960']
            : step.direction === 'right'
              ? ['180', '960', '900', '960']
              : ['540', '1400', '540', '400'];
      await runCmd('adb', ['-s', serial, 'shell', 'input', 'swipe', ...coords, '300'], {
        timeoutMs: 8000,
      });
    }
  }

  if (activeRecordingFlow) {
    activeRecordingFlow.steps.push(step);
    activeRecordingFlow.updatedAt = new Date().toISOString();
  }

  return step;
}

// ============================================================================
// Flows Persistence (~/.qa-studio/flows/*.json) & Maestro YAML Conversion
// ============================================================================
export function listFlows(): RecordedFlow[] {
  ensureStudioDirectories();
  const files = fs.readdirSync(config.paths.flowsDir).filter((f) => f.endsWith('.json'));
  const flows: RecordedFlow[] = [];
  for (const f of files) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(config.paths.flowsDir, f), 'utf8')
      ) as RecordedFlow;
      flows.push(parsed);
    } catch {
      // skip invalid file
    }
  }
  flows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return flows;
}

export function getFlow(id: string): RecordedFlow | null {
  const safeId = path.basename(id).replace(/[^a-zA-Z0-9._-]/g, '');
  const target = path.join(config.paths.flowsDir, `${safeId}.json`);
  if (!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target, 'utf8')) as RecordedFlow;
}

export function saveFlow(input: {
  id?: string;
  name: string;
  appId?: string;
  steps: RecordedFlowStep[];
}): RecordedFlow {
  if (!input.name?.trim()) {
    const err = new Error('Flow name is required.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  ensureStudioDirectories();
  const now = new Date().toISOString();
  const existing = input.id ? getFlow(input.id) : null;
  const id = existing?.id || input.id?.replace(/[^a-zA-Z0-9._-]/g, '') || `flow-${Date.now()}`;

  const flow: RecordedFlow = {
    id,
    name: input.name.trim(),
    appId: input.appId?.trim() || existing?.appId,
    steps: input.steps ?? [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  fs.writeFileSync(path.join(config.paths.flowsDir, `${id}.json`), JSON.stringify(flow, null, 2));
  return flow;
}

export function deleteFlow(id: string): RecordedFlow[] {
  const safeId = path.basename(id).replace(/[^a-zA-Z0-9._-]/g, '');
  const target = path.join(config.paths.flowsDir, `${safeId}.json`);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  return listFlows();
}

export function convertFlowToMaestroYaml(flow: {
  appId?: string;
  steps: RecordedFlowStep[];
}): string {
  const appId = flow.appId?.trim() || 'com.example.app';
  const lines: string[] = [`appId: ${appId}`, '---'];

  for (const step of flow.steps) {
    switch (step.action) {
      case 'launchApp':
        lines.push(`- launchApp: ${step.appId || appId}`);
        break;
      case 'tap':
        if (step.selectorType === 'id' && step.value) {
          lines.push(`- tapOn:\n    id: "${step.value}"`);
        } else if (step.selectorType === 'text' && step.value) {
          lines.push(`- tapOn: "${step.value.replace(/"/g, '\\"')}"`);
        } else if (step.fallbackCoords) {
          lines.push(`- tapOn:\n    point: "${step.fallbackCoords[0]},${step.fallbackCoords[1]}"`);
        }
        break;
      case 'inputText':
        lines.push(`- inputText: "${(step.text ?? '').replace(/"/g, '\\"')}"`);
        break;
      case 'assertVisible':
        lines.push(`- assertVisible: "${(step.value ?? step.text ?? '').replace(/"/g, '\\"')}"`);
        break;
      case 'swipe':
        lines.push(`- swipe:\n    direction: ${(step.direction ?? 'up').toUpperCase()}`);
        break;
      case 'back':
        lines.push('- pressKey: back');
        break;
      case 'wait':
        lines.push('- waitForAnimationToEnd');
        break;
    }
  }

  return `${lines.join('\n')}\n`;
}

// ============================================================================
// Flow Replay Engine with Smart Selector + Real-time WebSocket Progress
// ============================================================================
export async function captureScreenshotToReports(
  serial: string,
  runId: string,
  tag: string
): Promise<string> {
  const screenshotsDir = path.join(config.paths.reportsDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const fileName = `${runId}-${tag}.png`;
  const target = path.join(screenshotsDir, fileName);

  const { stdout } = await execFileBinaryAsync(
    getAdbBinary(),
    ['-s', serial, 'exec-out', 'screencap', '-p'],
    {
      encoding: 'buffer',
      maxBuffer: 25 * 1024 * 1024,
      timeout: 15_000,
    }
  );

  if (!stdout || stdout.length < 64) {
    throw new Error('Device returned empty screenshot');
  }
  fs.writeFileSync(target, stdout);
  return fileName;
}

export async function runRecordedFlow(input: {
  flowId?: string;
  flow?: { name?: string; appId?: string; steps: RecordedFlowStep[] };
  deviceSerial?: string;
}): Promise<FlowRunReport> {
  const serial = resolveSerial(input.deviceSerial);
  let flow: RecordedFlow | undefined;

  if (input.flowId) {
    flow = getFlow(input.flowId) ?? undefined;
    if (!flow) {
      const err = new Error(`Flow "${input.flowId}" not found.`) as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
  } else if (input.flow) {
    flow = {
      id: 'inline-flow',
      name: input.flow.name?.trim() || 'Recorded Flow',
      appId: input.flow.appId,
      steps: input.flow.steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    throw new Error('Provide flowId or inline flow steps.');
  }

  const runId = `run-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const stepResults: FlowStepResult[] = [];
  const screenshotFiles: string[] = [];

  automationWs.broadcast({
    type: 'run_started',
    runId,
    flowName: flow.name,
    totalSteps: flow.steps.length,
  });
  automationWs.emitLog(`Starting flow "${flow.name}" on ${serial} (${flow.steps.length} steps)...`);

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const stepStart = Date.now();
    const label = step.label || step.action;

    automationWs.broadcast({
      type: 'step_progress',
      runId,
      index: i,
      stepId: step.id,
      status: 'RUNNING',
      label,
    });

    try {
      let detail = '';

      if (step.action === 'launchApp') {
        const pkg = step.appId || flow.appId;
        if (!pkg) throw new Error('appId is required for launchApp.');
        const res = await runCmd(
          'adb',
          ['-s', serial, 'shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'],
          { timeoutMs: 15_000 }
        );
        if (!res.ok || res.stdout.includes('No activities found')) {
          throw new Error(res.stderr || res.stdout || `Cannot launch ${pkg}`);
        }
        detail = `Launched ${pkg}`;
      } else if (step.action === 'tap') {
        let tapX = step.fallbackCoords?.[0];
        let tapY = step.fallbackCoords?.[1];
        let matchedVia = 'fallback coords';

        if (step.selectorType && step.selectorType !== 'coords' && step.value) {
          const nodes = await dumpUiHierarchy(serial);
          const found = nodes.find((n) =>
            step.selectorType === 'text'
              ? n.text === step.value || n.contentDesc === step.value
              : n.resourceId === step.value || n.resourceId.endsWith(`/${step.value}`)
          );
          if (found) {
            tapX = Math.round((found.bounds[0] + found.bounds[2]) / 2);
            tapY = Math.round((found.bounds[1] + found.bounds[3]) / 2);
            matchedVia = `${step.selectorType}="${step.value}"`;
          } else if (tapX === undefined || tapY === undefined) {
            throw new Error(`Element not found (${step.selectorType}="${step.value}")`);
          }
        }

        if (tapX === undefined || tapY === undefined) {
          throw new Error('No tap target coordinates available.');
        }

        const res = await runCmd('adb', ['-s', serial, 'shell', 'input', 'tap', String(tapX), String(tapY)], {
          timeoutMs: 8000,
        });
        if (!res.ok) throw new Error(res.stderr || 'adb tap failed');
        detail = `Tapped (${tapX}, ${tapY}) via ${matchedVia}`;
      } else if (step.action === 'inputText') {
        const txt = step.text ?? '';
        const res = await runCmd(
          'adb',
          ['-s', serial, 'shell', 'input', 'text', txt.replace(/\s+/g, '%s')],
          { timeoutMs: 8000 }
        );
        if (!res.ok) throw new Error(res.stderr || 'adb input text failed');
        detail = `Typed "${txt}"`;
      } else if (step.action === 'assertVisible') {
        const targetText = (step.value ?? step.text ?? '').trim();
        if (!targetText) throw new Error('Expected text is required for assertVisible.');
        const nodes = await dumpUiHierarchy(serial);
        const visible = nodes.some(
          (n) =>
            n.text.toLowerCase().includes(targetText.toLowerCase()) ||
            n.contentDesc.toLowerCase().includes(targetText.toLowerCase())
        );
        if (!visible) {
          throw new Error(`Assertion failed: "${targetText}" is not visible on screen.`);
        }
        detail = `Verified "${targetText}" is visible`;
      } else if (step.action === 'swipe') {
        const coords =
          step.direction === 'down'
            ? ['540', '400', '540', '1400']
            : step.direction === 'left'
              ? ['900', '960', '180', '960']
              : step.direction === 'right'
                ? ['180', '960', '900', '960']
                : ['540', '1400', '540', '400'];
        await runCmd('adb', ['-s', serial, 'shell', 'input', 'swipe', ...coords, '300'], {
          timeoutMs: 8000,
        });
        detail = `Swiped ${step.direction ?? 'up'}`;
      } else if (step.action === 'back') {
        await runCmd('adb', ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], {
          timeoutMs: 6000,
        });
        detail = 'Pressed Back';
      } else if (step.action === 'wait') {
        const ms = step.durationMs ?? 1500;
        await sleep(ms);
        detail = `Waited ${ms}ms`;
      }

      const result: FlowStepResult = {
        stepId: step.id,
        index: i,
        action: step.action,
        label,
        status: 'PASS',
        durationMs: Date.now() - stepStart,
        detail,
      };
      stepResults.push(result);
      automationWs.broadcast({ type: 'step_progress', runId, ...result });
      automationWs.emitLog(`[PASS] Step ${i + 1}: ${label} — ${detail}`, 'pass');
    } catch (err) {
      let screenshotFile: string | undefined;
      try {
        screenshotFile = await captureScreenshotToReports(serial, runId, `fail-step-${i + 1}`);
        screenshotFiles.push(screenshotFile);
      } catch {
        // ignore screenshot capture failure
      }

      const detail = err instanceof Error ? err.message : String(err);
      const result: FlowStepResult = {
        stepId: step.id,
        index: i,
        action: step.action,
        label,
        status: 'FAIL',
        durationMs: Date.now() - stepStart,
        detail,
        screenshotFile,
      };
      stepResults.push(result);
      automationWs.broadcast({ type: 'step_progress', runId, ...result });
      automationWs.emitLog(`[FAIL] Step ${i + 1}: ${label} — ${detail}`, 'fail');
    }
  }

  const passedSteps = stepResults.filter((r) => r.status === 'PASS').length;
  const failedSteps = stepResults.length - passedSteps;

  const report: FlowRunReport = {
    id: runId,
    source: 'flow',
    flowId: flow.id,
    flowName: flow.name,
    deviceSerial: serial,
    status: failedSteps === 0 ? 'PASS' : 'FAIL',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    passedSteps,
    failedSteps,
    totalSteps: stepResults.length,
    stepResults,
    errorLogs: logcatService.getRecentErrors(40),
    screenshotFiles,
    failedApiRequests: [],
  };

  saveFlowRunReport(report);
  automationWs.broadcast({ type: 'run_finished', report });
  automationWs.emitLog(
    `Flow "${flow.name}" completed: ${report.status} (${passedSteps}/${report.totalSteps}).`,
    report.status === 'PASS' ? 'pass' : 'fail'
  );

  return report;
}

export function saveFlowRunReport(report: FlowRunReport): void {
  ensureStudioDirectories();
  fs.writeFileSync(
    path.join(config.paths.reportsDir, `${report.id}.json`),
    JSON.stringify(report, null, 2)
  );
}

export function listFlowRunReports(): FlowRunReport[] {
  ensureStudioDirectories();
  const files = fs
    .readdirSync(config.paths.reportsDir)
    .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
    .sort()
    .reverse();

  const out: FlowRunReport[] = [];
  for (const f of files.slice(0, 50)) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(config.paths.reportsDir, f), 'utf8')) as FlowRunReport);
    } catch {
      // skip
    }
  }
  return out;
}

export function getFlowRunReport(id: string): FlowRunReport | null {
  const safe = path.basename(id).replace(/[^a-zA-Z0-9._-]/g, '');
  const target = path.join(config.paths.reportsDir, `${safe}.json`);
  if (!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target, 'utf8')) as FlowRunReport;
}
