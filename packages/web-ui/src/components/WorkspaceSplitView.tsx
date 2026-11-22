import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Code2,
  Crown,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Filter,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import { api, getAutomationWsUrl } from '../api/client';
import type {
  ActiveSession,
  AndroidVersion,
  ExportedBugReport,
  FlowRunReport,
  LicenseStatus,
  MaestroTemplate,
  RecordedFlow,
  RecordedFlowStep,
  RuntimeMode,
} from '../types';

type MitmFilterPresetId = 'all' | 'xhr' | 'json' | 'mutations' | 'errors';

const MITM_FILTER_PRESETS: Array<{
  id: MitmFilterPresetId;
  label: string;
  expression: string;
  title: string;
}> = [
  {
    id: 'all',
    label: 'All',
    expression: '',
    title: 'Show all captured HTTP/HTTPS traffic',
  },
  {
    id: 'xhr',
    label: 'XHR / API',
    expression: '!~a & !~t html',
    title: 'Hide static assets (images, JS, CSS, fonts) and HTML documents',
  },
  {
    id: 'json',
    label: 'JSON',
    expression: '~t json',
    title: 'Show only responses with JSON content-type',
  },
  {
    id: 'mutations',
    label: 'POST / PUT',
    expression: '~m "POST|PUT|PATCH|DELETE"',
    title: 'Show only POST, PUT, PATCH, and DELETE requests',
  },
  {
    id: 'errors',
    label: 'Errors',
    expression: '~c "^[45]"',
    title: 'Show only HTTP 4xx and 5xx error responses',
  },
];

interface WorkspaceSplitViewProps {
  session: ActiveSession;
  sessionBusy: boolean;
  mode: RuntimeMode;
  androidVersion: AndroidVersion;
  selectedSerial: string;
  license: LicenseStatus | null;
  onStartSession: () => void;
  onOpenLicense: () => void;
  onEnableDemoPro: () => void;
  onBugReportReady: (report: ExportedBugReport) => void;
  onNotify: (tone: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

export function WorkspaceSplitView({
  session,
  sessionBusy,
  mode,
  androidVersion,
  selectedSerial,
  license,
  onStartSession,
  onOpenLicense,
  onEnableDemoPro,
  onBugReportReady,
  onNotify,
}: WorkspaceSplitViewProps) {
  const isPro = Boolean(license?.isPro);

  // TestMu AI layout proportion: Left Workbench (~58%) + Right Device Canvas (~42%)
  const [splitPercent, setSplitPercent] = useState(58);
  const [dragging, setDragging] = useState(false);
  const [scrcpyKey, setScrcpyKey] = useState(0);
  const [mitmKey, setMitmKey] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const screenOverlayRef = useRef<HTMLDivElement | null>(null);
  const mitmIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Left Panel Multi-Tab Studio
  const [leftTab, setLeftTab] = useState<'automation' | 'network' | 'reports'>('automation');
  const [automationSubTab, setAutomationSubTab] = useState<'nocode' | 'maestro'>('nocode');
  const [mitmFilterPreset, setMitmFilterPreset] = useState<MitmFilterPresetId>('all');
  const [mitmDomainFilter, setMitmDomainFilter] = useState('');

  const effectiveMitmFilter = useMemo(() => {
    const presetExpr =
      MITM_FILTER_PRESETS.find((p) => p.id === mitmFilterPreset)?.expression ?? '';
    const trimmedDomain = mitmDomainFilter.trim().replace(/"/g, '');
    const domainExpr = trimmedDomain
      ? trimmedDomain.includes(' ')
        ? `~d "${trimmedDomain}"`
        : `~d ${trimmedDomain}`
      : '';
    return [domainExpr, presetExpr].filter(Boolean).join(' & ');
  }, [mitmFilterPreset, mitmDomainFilter]);

  const pushMitmFilter = useCallback((filterExpr: string) => {
    const win = mitmIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'qa-studio:set-mitm-filter', filter: filterExpr }, '*');
  }, []);

  useEffect(() => {
    if (leftTab !== 'network') return;
    pushMitmFilter(effectiveMitmFilter);
  }, [leftTab, effectiveMitmFilter, pushMitmFilter]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data && typeof ev.data === 'object' && ev.data.type === 'qa-studio:mitm-ready') {
        pushMitmFilter(effectiveMitmFilter);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [effectiveMitmFilter, pushMitmFilter]);

  // Visual Recorder & Flow Builder State
  const [recordingFlow, setRecordingFlow] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<RecordedFlowStep[]>([]);
  const [flowName, setFlowName] = useState('New Recorded Flow');
  const [flowAppId, setFlowAppId] = useState('');
  const [savedFlows, setSavedFlows] = useState<RecordedFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [runningFlow, setRunningFlow] = useState(false);
  const [liveStepStatus, setLiveStepStatus] = useState<Record<string, 'RUNNING' | 'PASS' | 'FAIL'>>({});

  // Quick Record Input / Assert prompts
  const [quickInputText, setQuickInputText] = useState('');
  const [quickAssertText, setQuickAssertText] = useState('');

  // Screen Record (.mp4) & Export Bug Report
  const [screenRecording, setScreenRecording] = useState(false);
  const [exportingBug, setExportingBug] = useState(false);

  // Maestro YAML Studio State
  const [templates, setTemplates] = useState<MaestroTemplate[]>([]);
  const [yamlText, setYamlText] = useState('');
  const [runningYaml, setRunningYaml] = useState(false);
  const [consoleLines, setConsoleLines] = useState<Array<{ line: string; level: string }>>([]);

  // Test Reports History
  const [runReports, setRunReports] = useState<FlowRunReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<FlowRunReport | null>(null);

  const liveCounts = useMemo(() => {
    let passed = 0;
    let failed = 0;
    for (const s of recordedSteps) {
      const st = liveStepStatus[s.id];
      if (st === 'PASS') passed += 1;
      else if (st === 'FAIL') failed += 1;
    }
    return { passed, failed };
  }, [recordedSteps, liveStepStatus]);

  // Drag resizer
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(35, Math.min(72, rawPct)));
    };
    const handleUp = () => setDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  // Load Pro Automation data when Pro is active
  const loadProAutomationData = useCallback(async () => {
    if (!isPro) return;
    try {
      const [flowsRes, tmplRes, runsRes] = await Promise.all([
        api.getFlows(),
        api.getMaestroTemplates(),
        api.getFlowRunReports(),
      ]);
      setSavedFlows(flowsRes.flows);
      setTemplates(tmplRes.templates);
      if (tmplRes.templates.length > 0) {
        setYamlText((prev) => prev || tmplRes.templates[0].yaml);
      }
      setRunReports(runsRes.runs);
      if (runsRes.runs.length > 0) {
        setSelectedReport((prev) => prev ?? runsRes.runs[0]);
      }
    } catch {
      // ignore initial load error if unauthenticated
    }
  }, [isPro]);

  useEffect(() => {
    void loadProAutomationData();
  }, [loadProAutomationData]);

  // WebSocket /ws/automation for real-time step status & Maestro console streaming
  useEffect(() => {
    let closed = false;
    let timer: number | undefined;
    let ws: WebSocket | null = null;

    const connect = () => {
      ws = new WebSocket(getAutomationWsUrl());
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as {
            type: string;
            stepId?: string;
            status?: 'RUNNING' | 'PASS' | 'FAIL';
            line?: string;
            level?: string;
            report?: FlowRunReport;
          };

          if (data.type === 'run_started') {
            setLiveStepStatus({});
          } else if (data.type === 'step_progress' && data.stepId && data.status) {
            setLiveStepStatus((prev) => ({ ...prev, [data.stepId!]: data.status! }));
          } else if (data.type === 'console' && data.line) {
            setConsoleLines((prev) => [...prev.slice(-150), { line: data.line!, level: data.level || 'info' }]);
          } else if (data.type === 'run_finished' && data.report) {
            setRunReports((prev) => [data.report!, ...prev.filter((r) => r.id !== data.report!.id)]);
            setSelectedReport(data.report);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (!closed) timer = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  // Handle Record Tap overlay click (maps viewport click to 1080x1920 Android coordinates)
  const handleRecordOverlayClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!recordingFlow || !screenOverlayRef.current) return;
    const rect = screenOverlayRef.current.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const deviceX = Math.round(relX * 1080);
    const deviceY = Math.round(relY * 1920);

    try {
      const res = await api.recordTap({ x: deviceX, y: deviceY, deviceSerial: session.deviceSerial ?? undefined });
      setRecordedSteps((prev) => [...prev, res.step]);
      setLeftTab('automation');
      setAutomationSubTab('nocode');
      onNotify('info', 'Recorded Smart Tap', res.step.label || `(${deviceX}, ${deviceY})`);
    } catch (err) {
      onNotify('error', 'Record Tap Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleInsertStep = async (
    action: 'inputText' | 'assertVisible' | 'swipe' | 'back' | 'wait'
  ) => {
    if (!isPro) {
      onOpenLicense();
      return;
    }
    try {
      const payload =
        action === 'inputText'
          ? { action, text: quickInputText.trim() || 'hello@example.com' }
          : action === 'assertVisible'
            ? { action, value: quickAssertText.trim() || 'Welcome' }
            : action === 'swipe'
              ? { action, direction: 'up' as const }
              : action === 'wait'
                ? { action, durationMs: 1500 }
                : { action };

      const res = await api.recordStep({
        ...payload,
        deviceSerial: session.deviceSerial ?? undefined,
      });
      setRecordedSteps((prev) => [...prev, res.step]);
      if (action === 'inputText') setQuickInputText('');
      if (action === 'assertVisible') setQuickAssertText('');
      setLeftTab('automation');
      setAutomationSubTab('nocode');
    } catch (err) {
      onNotify('error', 'Could not add step', err instanceof Error ? err.message : undefined);
    }
  };

  const handleToggleScreenRecord = async () => {
    if (!isPro) {
      onOpenLicense();
      return;
    }
    if (!session.active) {
      onNotify('warning', 'No Active Session', 'Start a device session first.');
      return;
    }
    try {
      if (!screenRecording) {
        await api.startScreenRecord(session.deviceSerial ?? undefined);
        setScreenRecording(true);
        onNotify('info', 'Screen Recording Started', 'Recording device screen to .mp4...');
      } else {
        const res = await api.stopScreenRecord();
        setScreenRecording(false);
        if (res.stopped && res.videoFile && res.sizeBytes > 0) {
          onNotify(
            'success',
            'Screen Recording Saved',
            `${res.videoFile} (${(res.sizeBytes / 1024).toFixed(0)} KB)`
          );
        } else {
          onNotify(
            'warning',
            'No Screen Recording Saved',
            res.error || 'Device did not produce a valid .mp4 video file.'
          );
        }
      }
    } catch (err) {
      setScreenRecording(false);
      onNotify('error', 'Screen Record Error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleExportBugReport = async () => {
    if (!isPro) {
      onOpenLicense();
      return;
    }
    setExportingBug(true);
    try {
      const exported = await api.exportBugReport({ runId: selectedReport?.id });
      onBugReportReady(exported);
    } catch (err) {
      onNotify('error', 'Export Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExportingBug(false);
    }
  };

  const handleSaveFlow = async () => {
    if (recordedSteps.length === 0) return;
    try {
      const res = await api.saveFlow({
        id: selectedFlowId || undefined,
        name: flowName.trim() || 'Recorded Flow',
        appId: flowAppId.trim() || undefined,
        steps: recordedSteps,
      });
      setSavedFlows(res.flows);
      setSelectedFlowId(res.flow.id);
      onNotify('success', 'Flow Saved', `${res.flow.name} (${res.flow.steps.length} steps)`);
    } catch (err) {
      onNotify('error', 'Failed to Save Flow', err instanceof Error ? err.message : undefined);
    }
  };

  const handleRunFlow = async () => {
    if (!session.active) {
      onNotify('warning', 'No Active Session', 'Start a device session first.');
      return;
    }
    if (recordedSteps.length === 0) return;

    setRunningFlow(true);
    setLiveStepStatus({});
    try {
      const res = await api.runFlow({
        flow: {
          name: flowName.trim() || 'Recorded Flow',
          appId: flowAppId.trim() || undefined,
          steps: recordedSteps,
        },
        deviceSerial: session.deviceSerial ?? undefined,
      });
      onNotify(
        res.report.status === 'PASS' ? 'success' : 'error',
        `Flow ${res.report.status}`,
        `${res.report.passedSteps}/${res.report.totalSteps} steps passed.`
      );
    } catch (err) {
      onNotify('error', 'Flow Execution Error', err instanceof Error ? err.message : undefined);
    } finally {
      setRunningFlow(false);
    }
  };

  const handleConvertToYaml = async () => {
    if (recordedSteps.length === 0) return;
    try {
      const res = await api.exportFlowToYaml({
        appId: flowAppId.trim() || undefined,
        steps: recordedSteps,
      });
      setYamlText(res.yaml);
      setAutomationSubTab('maestro');
      onNotify('success', 'Converted to Maestro YAML');
    } catch (err) {
      onNotify('error', 'Conversion Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleRunYaml = async () => {
    if (!session.active) {
      onNotify('warning', 'No Active Session', 'Start a device session first.');
      return;
    }
    if (!yamlText.trim()) return;
    setRunningYaml(true);
    setConsoleLines([]);
    try {
      const res = await api.runMaestroYaml({
        yaml: yamlText,
        name: 'Maestro YAML Run',
        deviceSerial: session.deviceSerial ?? undefined,
      });
      onNotify(
        res.report.status === 'PASS' ? 'success' : 'error',
        `Maestro Run ${res.report.status}`,
        `Executed via ${res.engine === 'maestro-cli' ? 'Maestro CLI' : 'ADB Fallback'}`
      );
    } catch (err) {
      onNotify('error', 'YAML Execution Error', err instanceof Error ? err.message : undefined);
    } finally {
      setRunningYaml(false);
    }
  };

  return (
    <main
      ref={containerRef}
      className={`relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-[#F7F8FA] px-4 pb-3 lg:flex-row lg:gap-0 ${
        dragging ? 'select-none' : ''
      }`}
    >
      {/* Left Panel — Tabbed Workbench Card (TestMu AI Style) */}
      <section
        style={{ flexBasis: `${splitPercent}%` }}
        className="flex min-h-[340px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] lg:min-h-0 lg:flex-none"
      >
        {/* TestMu-style Underlined Tab Bar */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-4">
          <div className="flex h-full items-center gap-5">
            <button
              type="button"
              onClick={() => setLeftTab('automation')}
              className={`relative inline-flex h-full items-center gap-1.5 text-xs font-medium transition-colors ${
                leftTab === 'automation'
                  ? 'font-semibold text-[#111827]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>Automation Studio</span>
              {!isPro && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-800">
                  PRO
                </span>
              )}
              {leftTab === 'automation' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[#E54D2E]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setLeftTab('network')}
              className={`relative inline-flex h-full items-center gap-1.5 text-xs font-medium transition-colors ${
                leftTab === 'network'
                  ? 'font-semibold text-[#111827]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Network Inspector</span>
              {leftTab === 'network' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[#E54D2E]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setLeftTab('reports')}
              className={`relative inline-flex h-full items-center gap-1.5 text-xs font-medium transition-colors ${
                leftTab === 'reports'
                  ? 'font-semibold text-[#111827]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Test Reports</span>
              <span className="rounded-full bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#4B5563]">
                {runReports.length}
              </span>
              {!isPro && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-800">
                  PRO
                </span>
              )}
              {leftTab === 'reports' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[#E54D2E]" />
              )}
            </button>
          </div>

          {leftTab === 'network' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await api.startMitmproxy();
                    setMitmKey((k) => k + 1);
                    onNotify(res.ok ? 'success' : 'warning', 'mitmweb (:8082)', res.message);
                  } catch (err) {
                    onNotify('error', 'Failed to start mitmweb', err instanceof Error ? err.message : undefined);
                  }
                }}
                className="studio-btn py-1 text-[11px]"
                title="Start mitmweb (:8082) container or local mitmproxy binary"
              >
                <Play className="h-3 w-3 text-[#1F7A3E]" />
                Start mitmweb
              </button>
              <button
                type="button"
                onClick={() => setMitmKey((k) => k + 1)}
                className="rounded-md p-1.5 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
                title="Reload mitmweb"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <a
                href={session.mitmWebUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md p-1.5 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
                title="Open mitmweb in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Tab Body */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {leftTab === 'network' ? (
            /* Tab 2: Live Network Inspector (mitmweb :8082 — Free Tier) */
            <div className="flex h-full flex-col">
              {/* Quick Filter Preset Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6B7280]">
                  <Filter className="h-3 w-3" />
                  Filter:
                </span>
                <div className="inline-flex flex-wrap items-center gap-1">
                  {MITM_FILTER_PRESETS.map((preset) => {
                    const active = mitmFilterPreset === preset.id;
                    const activeClass =
                      preset.id === 'errors'
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : preset.id === 'all'
                          ? 'border-[#111827] bg-[#111827] text-white'
                          : 'border-[#1F7A3E] bg-[#EBF9F0] text-[#1F7A3E] font-semibold';
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setMitmFilterPreset(preset.id)}
                        title={preset.title}
                        className={`rounded-md border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          active
                            ? activeClass
                            : 'border-[#D1D5DB] bg-white text-[#374151] hover:border-[#9CA3AF] hover:bg-[#F3F4F6]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  <input
                    type="text"
                    value={mitmDomainFilter}
                    onChange={(e) => setMitmDomainFilter(e.target.value)}
                    placeholder="Domain (e.g. api.example.com)"
                    className="studio-input h-7 w-48 py-0 font-mono text-[11px]"
                  />
                  {effectiveMitmFilter && (
                    <>
                      <code
                        className="hidden max-w-[180px] truncate rounded border border-[#E5E7EB] bg-white px-2 py-0.5 font-mono text-[10px] text-[#1F7A3E] xl:inline-block"
                        title={`Active mitmproxy filter: ${effectiveMitmFilter}`}
                      >
                        {effectiveMitmFilter}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          setMitmFilterPreset('all');
                          setMitmDomainFilter('');
                        }}
                        className="rounded-md p-1 text-[#6B7280] hover:bg-[#E5E7EB] hover:text-[#111827]"
                        title="Clear network filter"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <iframe
                ref={mitmIframeRef}
                key={mitmKey}
                src={session.mitmWebUrl}
                onLoad={() => pushMitmFilter(effectiveMitmFilter)}
                title="Live Network Inspector (mitmweb)"
                className={`min-h-0 w-full flex-1 border-0 bg-white ${dragging ? 'pointer-events-none' : ''}`}
              />
            </div>
          ) : !isPro ? (
            /* Pro Gate for Automation Studio & Test Reports */
            <div className="flex h-full items-center justify-center bg-[#FAFBFC] p-6">
              <div className="w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50">
                    <Crown className="h-4 w-4 text-amber-600" />
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                    Pro Feature
                  </span>
                </div>

                <h3 className="mt-4 text-sm font-semibold text-[#111827]">
                  No-Code Visual Recorder, Maestro YAML & Bug Reports
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                  Record Smart Selector flows directly on your Android screen, execute Maestro YAML scripts with live WebSocket progress, record <code className="font-mono text-[#111827]">.mp4</code> videos, and export Jira/Linear-ready <code className="font-mono text-[#111827]">.zip</code> bug reports.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenLicense}
                    className="studio-btn-primary flex-1 py-2"
                  >
                    <Crown className="h-3.5 w-3.5" />
                    Activate License Key
                  </button>
                  {license?.checkoutUrl && (
                    <a
                      href={license.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="studio-btn flex-1 py-2"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Buy Pro on Gumroad
                    </a>
                  )}
                  {license?.demoProAllowed && (
                    <button
                      type="button"
                      onClick={onEnableDemoPro}
                      className="studio-btn flex-1 py-2"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                      Demo Pro Preview
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : leftTab === 'automation' ? (
            /* Tab 1: Automation Studio */
            <div className="flex h-full flex-col overflow-hidden">
              {/* Sub-tab Switcher & TestMu-style Status Summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2">
                <div className="inline-flex rounded-md border border-[#E5E7EB] bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setAutomationSubTab('nocode')}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      automationSubTab === 'nocode'
                        ? 'bg-[#111827] text-white'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    <CircleDot className="h-3 w-3" />
                    No-Code Flow Builder ({recordedSteps.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutomationSubTab('maestro')}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      automationSubTab === 'maestro'
                        ? 'bg-[#111827] text-white'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    <Code2 className="h-3 w-3" />
                    Maestro YAML Editor
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {automationSubTab === 'nocode' && (liveCounts.failed > 0 || liveCounts.passed > 0) && (
                    <div className="flex items-center gap-3 text-[11px] font-medium tabular-nums">
                      <span className="inline-flex items-center gap-1 text-rose-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {liveCounts.failed} Failed
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#1F7A3E]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {liveCounts.passed} Passed
                      </span>
                    </div>
                  )}

                  {savedFlows.length > 0 && automationSubTab === 'nocode' && (
                    <select
                      value={selectedFlowId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedFlowId(id);
                        const found = savedFlows.find((f) => f.id === id);
                        if (found) {
                          setFlowName(found.name);
                          setFlowAppId(found.appId || '');
                          setRecordedSteps(found.steps);
                        }
                      }}
                      className="studio-select py-1 text-[11px]"
                    >
                      <option value="">Load Saved Flow...</option>
                      {savedFlows.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.steps.length} steps)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {automationSubTab === 'nocode' ? (
                <div className="flex min-h-0 flex-1 flex-col p-4">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={flowName}
                      onChange={(e) => setFlowName(e.target.value)}
                      placeholder="Flow name (e.g. Login Checkout)"
                      className="studio-input"
                    />
                    <input
                      type="text"
                      value={flowAppId}
                      onChange={(e) => setFlowAppId(e.target.value)}
                      placeholder="App ID (e.g. com.example.app)"
                      className="studio-input font-mono"
                    />
                  </div>

                  {/* Recorded Steps List — TestMu AI Command Table Pattern */}
                  <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-[#E5E7EB] bg-white">
                    {recordedSteps.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center py-10 text-center text-xs text-[#6B7280]">
                        <p className="font-medium text-[#374151]">No steps recorded yet.</p>
                        <p className="mt-1 text-[11px]">
                          Click <strong className="text-[#111827]">Record Flow</strong> on the Android stage and tap elements to capture Smart Selectors.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#E5E7EB]">
                        {recordedSteps.map((step, idx) => {
                          const status = liveStepStatus[step.id];
                          return (
                            <div
                              key={step.id}
                              className={`flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs transition-colors ${
                                status === 'PASS'
                                  ? 'bg-[#EBF9F0]'
                                  : status === 'FAIL'
                                    ? 'bg-rose-50'
                                    : status === 'RUNNING'
                                      ? 'bg-sky-50'
                                      : 'bg-white hover:bg-[#F9FAFB]'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                {status === 'RUNNING' ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#E54D2E]" />
                                ) : status === 'PASS' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                                ) : status === 'FAIL' ? (
                                  <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                                ) : (
                                  <span className="font-mono text-[10px] font-medium tabular-nums text-[#9CA3AF]">
                                    #{idx + 1}
                                  </span>
                                )}

                                <span className="truncate font-semibold text-[#111827]">
                                  {step.label || step.action}
                                </span>

                                {step.selectorType && (
                                  <span className="rounded border border-[#E5E7EB] bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[10px] text-[#4B5563]">
                                    {step.selectorType}
                                  </span>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRecordedSteps((prev) => prev.filter((s) => s.id !== step.id))
                                  }
                                  className="rounded p-1 text-[#9CA3AF] hover:bg-rose-50 hover:text-rose-600"
                                  title="Remove step"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRunFlow()}
                      disabled={runningFlow || recordedSteps.length === 0 || !session.active}
                      className="studio-btn-accent"
                    >
                      {runningFlow ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                      Run Flow
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveFlow()}
                      disabled={recordedSteps.length === 0}
                      className="studio-btn"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Flow
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConvertToYaml()}
                      disabled={recordedSteps.length === 0}
                      className="studio-btn"
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      Convert to Maestro YAML
                    </button>
                    {recordedSteps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecordedSteps([]);
                          setLiveStepStatus({});
                        }}
                        className="studio-btn ml-auto text-[#6B7280]"
                      >
                        Clear Steps
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Maestro YAML Editor */
                <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {templates.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => setYamlText(tmpl.yaml)}
                          className="studio-btn py-1 text-[11px]"
                        >
                          {tmpl.name}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRunYaml()}
                      disabled={runningYaml || !yamlText.trim() || !session.active}
                      className="studio-btn-accent"
                    >
                      {runningYaml ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                      Run YAML
                    </button>
                  </div>

                  <textarea
                    value={yamlText}
                    onChange={(e) => setYamlText(e.target.value)}
                    spellCheck={false}
                    className="studio-input min-h-[180px] flex-1 resize-none bg-[#F9FAFB] font-mono text-[11px] leading-relaxed text-[#111827]"
                  />

                  <div className="h-32 overflow-y-auto rounded-md border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 font-mono text-[11px]">
                    {consoleLines.length === 0 ? (
                      <span className="text-[#6B7280]">
                        Live Maestro / ADB execution console output will stream here...
                      </span>
                    ) : (
                      consoleLines.map((item, idx) => (
                        <div
                          key={idx}
                          className={
                            item.level === 'pass'
                              ? 'text-[#1F7A3E]'
                              : item.level === 'fail'
                                ? 'text-rose-600'
                                : item.level === 'warn'
                                  ? 'text-amber-700'
                                  : 'text-[#374151]'
                          }
                        >
                          {item.line}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Tab 3: Test Reports */
            <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
              {runReports.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-xs text-[#6B7280]">
                  No test runs recorded yet. Run a No-Code Flow or Maestro YAML script to generate reports.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {runReports.map((rep) => (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => setSelectedReport(rep)}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selectedReport?.id === rep.id
                            ? 'border-[#111827] bg-[#111827] text-white'
                            : 'border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F9FAFB]'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            rep.status === 'PASS' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        {rep.flowName}
                      </button>
                    ))}
                  </div>

                  {selectedReport && (
                    <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                selectedReport.status === 'PASS'
                                  ? 'bg-[#1F7A3E] text-white'
                                  : 'bg-rose-600 text-white'
                              }`}
                            >
                              {selectedReport.status} ({selectedReport.passedSteps}/{selectedReport.totalSteps})
                            </span>
                            <span className="text-xs font-semibold text-[#111827]">
                              {selectedReport.flowName}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[11px] tabular-nums text-[#6B7280]">
                            {selectedReport.deviceSerial} · {(selectedReport.durationMs / 1000).toFixed(2)}s
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleExportBugReport()}
                          disabled={exportingBug}
                          className="studio-btn-primary"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export .zip & Markdown
                        </button>
                      </div>

                      <div className="divide-y divide-[#E5E7EB]">
                        {selectedReport.stepResults.map((s) => (
                          <div
                            key={`${s.stepId}-${s.index}`}
                            className={`px-4 py-3 text-xs ${
                              s.status === 'PASS' ? 'bg-[#EBF9F0]/45' : 'bg-rose-50/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {s.status === 'PASS' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-[#1F7A3E]" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                )}
                                <span className="font-semibold text-[#111827]">
                                  {s.index + 1}. {s.label}
                                </span>
                              </div>
                              <span
                                className={`font-mono text-[11px] font-medium tabular-nums ${
                                  s.status === 'PASS' ? 'text-[#1F7A3E]' : 'text-rose-600'
                                }`}
                              >
                                {s.status} · {s.durationMs}ms
                              </span>
                            </div>
                            <p className="mt-1 pl-5 font-mono text-[11px] text-[#4B5563]">{s.detail}</p>
                            {s.screenshotFile && (
                              <img
                                src={api.getScreenshotUrl(s.screenshotFile)}
                                alt={`Failure screenshot for ${s.label}`}
                                className="mt-2 ml-5 max-h-56 rounded-md border border-[#E5E7EB]"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Draggable Vertical Divider */}
      <div
        onMouseDown={() => setDragging(true)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace panels"
        className="hidden w-2.5 cursor-col-resize items-center justify-center transition-colors lg:flex"
      >
        <div className="h-10 w-1 rounded-full bg-[#D1D5DB] transition-colors hover:bg-[#9CA3AF]" />
      </div>

      {/* Right Panel — Interactive Android Screen Canvas (TestMu AI Stage) */}
      <section className="flex min-h-[340px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] lg:min-h-0">
        {/* Device Stage Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-2">
          <div className="flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5 text-[#4B5563]" />
            <span className="text-xs font-semibold text-[#111827]">Android Screen</span>
            {session.active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF9F0] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#1F7A3E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1F7A3E]" />
                {session.deviceSerial}
              </span>
            ) : (
              <span className="rounded-full border border-[#E5E7EB] bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-[#6B7280]">
                IDLE
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!recordingFlow ? (
              <button
                type="button"
                onClick={() => {
                  if (!isPro) {
                    onOpenLicense();
                    return;
                  }
                  if (!session.active) {
                    onNotify('warning', 'No Active Session', 'Start a device session first.');
                    return;
                  }
                  setRecordingFlow(true);
                  setLeftTab('automation');
                  setAutomationSubTab('nocode');
                  onNotify('info', 'Visual Recorder Active', 'Click anywhere on the Android screen to record Smart Selector taps.');
                }}
                className="studio-btn py-1 text-[11px]"
              >
                <CircleDot className="h-3 w-3 text-rose-600" />
                Record Flow
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRecordingFlow(false)}
                className="studio-btn-danger py-1 text-[11px]"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop Record ({recordedSteps.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleToggleScreenRecord()}
              className={`studio-btn py-1 text-[11px] ${
                screenRecording ? 'border-rose-300 bg-rose-50 text-rose-700' : ''
              }`}
            >
              <Video className={`h-3 w-3 ${screenRecording ? 'animate-pulse text-rose-600' : 'text-[#4B5563]'}`} />
              {screenRecording ? 'Stop .mp4' : 'Screen Record (.mp4)'}
            </button>

            <button
              type="button"
              onClick={() => void handleExportBugReport()}
              disabled={exportingBug}
              className="studio-btn py-1 text-[11px]"
            >
              {exportingBug ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileArchive className="h-3 w-3 text-[#4B5563]" />
              )}
              Export Bug Report
            </button>
          </div>
        </div>

        {/* Recording Quick-Insert Sub-toolbar */}
        {recordingFlow && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-rose-200 bg-rose-50 px-3.5 py-2">
            <input
              type="text"
              value={quickInputText}
              onChange={(e) => setQuickInputText(e.target.value)}
              placeholder="Text to input..."
              className="studio-input h-7 w-28 py-0 text-[11px]"
            />
            <button
              type="button"
              onClick={() => void handleInsertStep('inputText')}
              className="studio-btn h-7 py-0 text-[10px]"
            >
              + Input Text
            </button>

            <input
              type="text"
              value={quickAssertText}
              onChange={(e) => setQuickAssertText(e.target.value)}
              placeholder="Assert text..."
              className="studio-input h-7 w-28 py-0 text-[11px]"
            />
            <button
              type="button"
              onClick={() => void handleInsertStep('assertVisible')}
              className="studio-btn h-7 py-0 text-[10px]"
            >
              + Assert Visible
            </button>

            <button
              type="button"
              onClick={() => void handleInsertStep('swipe')}
              className="studio-btn h-7 py-0 text-[10px]"
            >
              + Swipe
            </button>
            <button
              type="button"
              onClick={() => void handleInsertStep('back')}
              className="studio-btn h-7 py-0 text-[10px]"
            >
              + Back
            </button>
          </div>
        )}

        {/* Viewport / Device Bezel */}
        <div className="studio-stage-grid flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-4">
          {session.active ? (
            <>
              <div className="relative flex h-full max-h-[700px] w-full max-w-[380px] flex-col rounded-[30px] border-[3px] border-[#1F2937] bg-[#111827] p-2.5 shadow-[0_24px_48px_-14px_rgba(15,23,42,0.28)]">
                <div className="mb-2 flex items-center justify-center gap-2">
                  <div className="h-1 w-12 rounded-full bg-slate-700" />
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                </div>

                <div className="relative flex-1 overflow-hidden rounded-[20px] border border-slate-800 bg-black">
                  <iframe
                    key={scrcpyKey}
                    src={session.wsScrcpyUrl}
                    title="Interactive Android Screen (ws-scrcpy)"
                    className={`h-full w-full border-0 ${dragging ? 'pointer-events-none' : ''}`}
                    allow="clipboard-read; clipboard-write"
                  />

                  {/* Interactive Record Flow Overlay */}
                  {recordingFlow && (
                    <div
                      ref={screenOverlayRef}
                      onClick={(e) => void handleRecordOverlayClick(e)}
                      className="absolute inset-0 z-10 cursor-crosshair border-2 border-rose-500 bg-rose-500/[0.06]"
                      title="Click to record Smart Selector tap"
                    >
                      <div className="pointer-events-none m-2 inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow">
                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
                        REC · Click screen to capture Smart Selector
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between px-3 font-mono text-[10px] text-slate-400">
                  <span>
                    {session.mode === 'docker'
                      ? `Redroid · Android ${session.androidVersion}`
                      : 'Direct ADB'}
                  </span>
                  <div className="h-1 w-14 rounded-full bg-slate-700" />
                  <span className="tabular-nums">1080×1920</span>
                </div>
              </div>

              {/* Sleek TestMu-style Control Pill Bar below Phone Frame */}
              <div className="mt-3 flex w-full max-w-[380px] items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-[11px] shadow-sm">
                <div className="flex items-center gap-2 font-mono text-[#374151]">
                  <span className="h-2 w-2 rounded-full bg-[#1F7A3E]" />
                  <span>LIVE</span>
                  <span className="text-[#D1D5DB]">|</span>
                  <span className="truncate text-[#6B7280]">{session.deviceSerial}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setScrcpyKey((k) => k + 1)}
                    className="rounded p-1 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
                    title="Reload Android screen stream"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={session.wsScrcpyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded p-1 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
                    title="Open live screen in new tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#F9FAFB]">
                <Smartphone className="h-5 w-5 text-[#111827]" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-[#111827]">
                Ready to Launch Local Android Session
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                {mode === 'docker'
                  ? `Starts a lightweight Redroid Android ${androidVersion} container (1080×1920 @ 420 DPI) via Kiri/Docker and streams screen & touch live.`
                  : selectedSerial
                    ? `Attaches directly to ${selectedSerial} via ADB without spinning up a heavy emulator.`
                    : 'Connect a physical phone (USB/Wi-Fi) or switch to Kiri Mode to boot Redroid.'}
              </p>

              <div className="mt-4 space-y-2 border-t border-[#E5E7EB] pt-4 text-[11px] text-[#4B5563]">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                  <span>
                    Auto <code className="rounded bg-[#F3F4F6] px-1 py-0.5 font-mono text-[#111827]">adb reverse tcp:8081</code> for React Native Metro
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                  <span>
                    Auto global HTTP proxy (<code className="rounded bg-[#F3F4F6] px-1 py-0.5 font-mono text-[#111827]">:8080</code>) & clean reset on Stop
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                  <span>
                    Auto mitmproxy CA injection (<code className="rounded bg-[#F3F4F6] px-1 py-0.5 font-mono text-[#111827]">/system/etc/security/cacerts</code>)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onStartSession}
                disabled={sessionBusy}
                className="studio-btn-accent mt-5 w-full py-2"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {sessionBusy ? 'Booting & Configuring Device...' : 'Start QA Session'}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
