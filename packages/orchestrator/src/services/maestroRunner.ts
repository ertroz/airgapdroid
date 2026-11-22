import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FlowRunReport, MaestroTemplate, RecordedFlowStep } from '../types.js';
import { runCmd } from '../utils/shell.js';
import { runRecordedFlow, saveFlowRunReport } from './automationRecorder.js';
import { automationWs } from './automationWs.js';
import { logcatService } from './logcatService.js';
import { getActiveSession } from './sessionService.js';

const MAESTRO_TEMPLATES: MaestroTemplate[] = [
  {
    id: 'login-flow',
    name: 'Login Flow',
    description: 'Launches app, fills email & password fields, taps Sign In, and asserts Dashboard.',
    yaml: `appId: com.example.app
---
- launchApp
- tapOn: "Email"
- inputText: "qa.user@example.com"
- tapOn: "Password"
- inputText: "Secret123!"
- tapOn: "Sign In"
- assertVisible: "Dashboard"
`,
  },
  {
    id: 'smoke-test',
    name: 'Smoke Test',
    description: 'Verifies Android Settings launches cleanly, scrolls, and navigates back.',
    yaml: `appId: com.android.settings
---
- launchApp
- waitForAnimationToEnd
- assertVisible: "Settings"
- swipe:
    direction: UP
- pressKey: back
`,
  },
  {
    id: 'form-validation',
    name: 'Form Validation',
    description: 'Submits an empty form and verifies validation error message appears.',
    yaml: `appId: com.example.app
---
- launchApp
- tapOn: "Submit"
- assertVisible: "Required"
`,
  },
];

export function getMaestroTemplates(): MaestroTemplate[] {
  return MAESTRO_TEMPLATES;
}

function parseMaestroYamlToSteps(yaml: string): { appId: string; steps: RecordedFlowStep[] } {
  const lines = yaml.split(/\r?\n/);
  let appId = 'com.example.app';
  const steps: RecordedFlowStep[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---') continue;

    if (trimmed.startsWith('appId:')) {
      appId = trimmed.replace(/^appId:\s*/, '').replace(/['"]/g, '').trim();
      continue;
    }

    const id = `yaml-${i + 1}-${crypto.randomUUID().slice(0, 4)}`;

    if (trimmed.startsWith('- launchApp')) {
      const target = trimmed.replace(/^- launchApp:?\s*/, '').replace(/['"]/g, '').trim();
      steps.push({
        id,
        action: 'launchApp',
        appId: target || appId,
        label: `launchApp: ${target || appId}`,
      });
    } else if (trimmed.startsWith('- tapOn:')) {
      const val = trimmed.replace(/^- tapOn:\s*/, '').replace(/^["']|["']$/g, '').trim();
      if (val) {
        steps.push({
          id,
          action: 'tap',
          selectorType: 'text',
          value: val,
          label: `tapOn: "${val}"`,
        });
      } else {
        // Multi-line tapOn block (id / text / point)
        let selectorType: 'text' | 'id' | 'coords' = 'text';
        let value = '';
        let fallbackCoords: [number, number] | undefined;
        while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1])) {
          i++;
          const sub = lines[i].trim();
          if (sub.startsWith('id:')) {
            selectorType = 'id';
            value = sub.replace(/^id:\s*/, '').replace(/^["']|["']$/g, '').trim();
          } else if (sub.startsWith('text:')) {
            selectorType = 'text';
            value = sub.replace(/^text:\s*/, '').replace(/^["']|["']$/g, '').trim();
          } else if (sub.startsWith('point:')) {
            selectorType = 'coords';
            value = sub.replace(/^point:\s*/, '').replace(/^["']|["']$/g, '').trim();
            const [px, py] = value.split(',').map((n) => Number(n.trim()));
            if (!Number.isNaN(px) && !Number.isNaN(py)) {
              fallbackCoords = [px, py];
            }
          }
        }
        steps.push({
          id,
          action: 'tap',
          selectorType,
          value,
          fallbackCoords,
          label: `tapOn (${selectorType}: ${value})`,
        });
      }
    } else if (trimmed.startsWith('- inputText:')) {
      const text = trimmed.replace(/^- inputText:\s*/, '').replace(/^["']|["']$/g, '').trim();
      steps.push({ id, action: 'inputText', text, label: `inputText: "${text}"` });
    } else if (trimmed.startsWith('- assertVisible:')) {
      const value = trimmed.replace(/^- assertVisible:\s*/, '').replace(/^["']|["']$/g, '').trim();
      steps.push({
        id,
        action: 'assertVisible',
        selectorType: 'text',
        value,
        label: `assertVisible: "${value}"`,
      });
    } else if (trimmed.startsWith('- swipe')) {
      let direction: 'up' | 'down' | 'left' | 'right' = 'up';
      while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1])) {
        i++;
        const sub = lines[i].trim();
        if (sub.startsWith('direction:')) {
          const dir = sub.replace(/^direction:\s*/, '').trim().toLowerCase();
          if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') {
            direction = dir;
          }
        }
      }
      steps.push({ id, action: 'swipe', direction, label: `swipe ${direction}` });
    } else if (trimmed.startsWith('- pressKey:')) {
      steps.push({ id, action: 'back', label: 'pressKey: back' });
    } else if (trimmed.startsWith('- waitForAnimationToEnd')) {
      steps.push({ id, action: 'wait', durationMs: 1200, label: 'waitForAnimationToEnd' });
    }
  }

  return { appId, steps };
}

export async function runMaestroYaml(input: {
  yaml: string;
  name?: string;
  deviceSerial?: string;
}): Promise<{ engine: 'maestro-cli' | 'adb-fallback'; report: FlowRunReport }> {
  const serial = input.deviceSerial?.trim() || getActiveSession().deviceSerial;
  if (!serial) {
    const err = new Error('No active device session. Start Kiri Mode or Direct ADB Mode first.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  if (!input.yaml?.trim()) {
    const err = new Error('YAML content is required.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const maestroCheck = await runCmd('maestro', ['--version'], { timeoutMs: 4000 });
  if (!maestroCheck.ok) {
    automationWs.emitLog(
      'Maestro CLI not detected on PATH — using built-in ADB YAML fallback executor.',
      'warn'
    );
    const parsed = parseMaestroYamlToSteps(input.yaml);
    const report = await runRecordedFlow({
      flow: {
        name: input.name?.trim() || 'Maestro YAML (ADB Fallback)',
        appId: parsed.appId,
        steps: parsed.steps,
      },
      deviceSerial: serial,
    });
    report.source = 'maestro-yaml';
    saveFlowRunReport(report);
    return { engine: 'adb-fallback', report };
  }

  // Native Maestro CLI execution
  const tmpYaml = path.join('/tmp', `qa-studio-maestro-${Date.now()}.yaml`);
  fs.writeFileSync(tmpYaml, input.yaml, 'utf8');

  const runId = `run-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const outputLines: string[] = [];

  automationWs.emitLog(`Executing: maestro --device ${serial} test ${tmpYaml}`);

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn('maestro', ['--device', serial, 'test', tmpYaml], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const handleData = (chunk: Buffer, isErr = false) => {
      const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        outputLines.push(line);
        automationWs.emitLog(line, isErr ? 'warn' : 'info');
      }
    };

    child.stdout.on('data', (d: Buffer) => handleData(d, false));
    child.stderr.on('data', (d: Buffer) => handleData(d, true));
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  try {
    fs.unlinkSync(tmpYaml);
  } catch {
    // ignore cleanup
  }

  const passed = exitCode === 0;
  const report: FlowRunReport = {
    id: runId,
    source: 'maestro-yaml',
    flowName: input.name?.trim() || 'Maestro YAML Run',
    deviceSerial: serial,
    status: passed ? 'PASS' : 'FAIL',
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    passedSteps: passed ? 1 : 0,
    failedSteps: passed ? 0 : 1,
    totalSteps: 1,
    stepResults: [
      {
        stepId: 'maestro-cli',
        index: 0,
        action: 'maestro test',
        label: 'Maestro CLI Execution',
        status: passed ? 'PASS' : 'FAIL',
        durationMs: Date.now() - startMs,
        detail: outputLines.slice(-4).join(' | ') || `Exited with code ${exitCode}`,
      },
    ],
    errorLogs: logcatService.getRecentErrors(40),
    screenshotFiles: [],
    failedApiRequests: [],
  };

  saveFlowRunReport(report);
  automationWs.broadcast({ type: 'run_finished', report });

  return { engine: 'maestro-cli', report };
}
