import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  Radio,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Video,
  Wifi,
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

  const [splitPercent, setSplitPercent] = useState(43);
  const [dragging, setDragging] = useState(false);
  const [scrcpyKey, setScrcpyKey] = useState(0);
  const [mitmKey, setMitmKey] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const screenOverlayRef = useRef<HTMLDivElement | null>(null);
  const mitmIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Right Panel Multi-Tab Studio
  const [rightTab, setRightTab] = useState<'automation' | 'network' | 'reports'>('automation');
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
    if (rightTab !== 'network') return;
    pushMitmFilter(effectiveMitmFilter);
  }, [rightTab, effectiveMitmFilter, pushMitmFilter]);

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

  // Drag resizer
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(28, Math.min(72, rawPct)));
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
      setRightTab('automation');
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
      setRightTab('automation');
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
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#09090b] lg:flex-row ${
        dragging ? 'select-none' : ''
      }`}
    >
      {/* Left Panel — Interactive Android Screen (ws-scrcpy :8000) + Recorder Toolbar */}
      <section
        style={{ flexBasis: `${splitPercent}%` }}
        className="flex min-h-[340px] min-w-0 flex-1 flex-col border-b border-white/[0.08] bg-[#0b0b0e] lg:min-h-0 lg:flex-none lg:border-b-0"
      >
        {/* Panel Header */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#101013] px-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-200">Android Screen</span>
            {session.active ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {session.deviceSerial}
              </span>
            ) : (
              <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                IDLE
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {session.active && (
              <>
                <button
                  type="button"
                  onClick={() => setScrcpyKey((k) => k + 1)}
                  className="rounded p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
                  title="Reload ws-scrcpy screen stream"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <a
                  href={session.wsScrcpyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
                  title="Open ws-scrcpy in new tab (http://localhost:8000)"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Quick Recorder & Bug Report Toolbar (above device frame) */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] bg-[#0e0e11] px-3 py-1.5">
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
                setRightTab('automation');
                setAutomationSubTab('nocode');
                onNotify('info', 'Visual Recorder Active', 'Click anywhere on the Android screen to record Smart Selector taps.');
              }}
              className="studio-btn py-1 text-[11px]"
            >
              <CircleDot className="h-3 w-3 text-rose-400" />
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
              screenRecording ? 'border-rose-500/40 bg-rose-500/15 text-rose-300' : ''
            }`}
          >
            <Video className={`h-3 w-3 ${screenRecording ? 'animate-pulse text-rose-400' : 'text-zinc-400'}`} />
            {screenRecording ? 'Stop .mp4' : 'Screen Record (.mp4)'}
          </button>

          <button
            type="button"
            onClick={() => void handleExportBugReport()}
            disabled={exportingBug}
            className="studio-btn ml-auto py-1 text-[11px]"
          >
            {exportingBug ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileArchive className="h-3 w-3 text-amber-400" />
            )}
            Export Bug Report
          </button>
        </div>

        {/* Recording Quick-Insert Sub-toolbar */}
        {recordingFlow && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-rose-500/20 bg-rose-500/[0.06] px-3 py-1.5">
            <input
              type="text"
              value={quickInputText}
              onChange={(e) => setQuickInputText(e.target.value)}
              placeholder="Text to input..."
              className="studio-input h-6 w-28 py-0 text-[11px]"
            />
            <button
              type="button"
              onClick={() => void handleInsertStep('inputText')}
              className="studio-btn h-6 py-0 text-[10px]"
            >
              + Input Text
            </button>

            <input
              type="text"
              value={quickAssertText}
              onChange={(e) => setQuickAssertText(e.target.value)}
              placeholder="Assert text..."
              className="studio-input h-6 w-28 py-0 text-[11px]"
            />
            <button
              type="button"
              onClick={() => void handleInsertStep('assertVisible')}
              className="studio-btn h-6 py-0 text-[10px]"
            >
              + Assert Visible
            </button>

            <button
              type="button"
              onClick={() => void handleInsertStep('swipe')}
              className="studio-btn h-6 py-0 text-[10px]"
            >
              + Swipe
            </button>
            <button
              type="button"
              onClick={() => void handleInsertStep('back')}
              className="studio-btn h-6 py-0 text-[10px]"
            >
              + Back
            </button>
          </div>
        )}

        {/* Active Automations Telemetry Strip */}
        {session.active && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0e0e11] px-3 py-1 font-mono text-[10px]">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                session.metroReversed ? 'bg-sky-500/10 text-sky-300' : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              <Radio className="h-3 w-3" />
              Metro :8081 {session.metroReversed ? 'Reversed' : 'Pending'}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                session.proxyConfigured ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              <Wifi className="h-3 w-3" />
              Proxy {session.proxyHost ? `${session.proxyHost}:${session.proxyPort}` : ':8080'}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                session.sslCertInjected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              {session.sslCertInjected ? 'HTTPS CA Injected' : 'CA Manual/Unrooted'}
            </span>
          </div>
        )}

        {/* Viewport / Device Bezel */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {session.active ? (
            <div className="relative flex h-full max-h-[760px] w-full max-w-[420px] flex-col rounded-[28px] border border-white/15 bg-[#151519] p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
              <div className="mb-2 flex items-center justify-center gap-2">
                <div className="h-1 w-12 rounded-full bg-zinc-700/80" />
                <div className="h-1.5 w-1.5 rounded-full bg-zinc-700/90" />
              </div>

              <div className="relative flex-1 overflow-hidden rounded-[20px] border border-white/10 bg-black">
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
                    className="absolute inset-0 z-10 cursor-crosshair border-2 border-rose-500/70 bg-rose-500/[0.04]"
                    title="Click to record Smart Selector tap"
                  >
                    <div className="pointer-events-none m-2 inline-flex items-center gap-1.5 rounded bg-rose-600/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow">
                      <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
                      REC · Click screen to capture Smart Selector
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between px-3 font-mono text-[10px] text-zinc-500">
                <span>
                  {session.mode === 'docker'
                    ? `Redroid · Android ${session.androidVersion}`
                    : 'Direct ADB'}
                </span>
                <div className="h-1 w-16 rounded-full bg-zinc-700/70" />
                <span>1080×1920</span>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#111114] p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#18181c]">
                <Smartphone className="h-5 w-5 text-zinc-200" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-zinc-100">
                Ready to Launch Local Android Session
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {mode === 'docker'
                  ? `Starts a lightweight Redroid Android ${androidVersion} container (1080×1920 @ 420 DPI) via Kiri/Docker and streams screen & touch via ws-scrcpy.`
                  : selectedSerial
                    ? `Attaches directly to ${selectedSerial} via ADB without spinning up a heavy emulator.`
                    : 'Connect a physical phone (USB/Wi-Fi) or switch to Kiri Mode to boot Redroid.'}
              </p>

              <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4 text-[11px] text-zinc-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span>
                    Auto <code className="font-mono text-zinc-200">adb reverse tcp:8081</code> for React Native Metro
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span>
                    Auto global HTTP proxy (<code className="font-mono text-zinc-200">:8080</code>) & clean reset on Stop
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span>
                    Auto mitmproxy CA injection (<code className="font-mono text-zinc-200">/system/etc/security/cacerts</code>)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onStartSession}
                disabled={sessionBusy}
                className="studio-btn-primary mt-5 w-full py-2"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {sessionBusy ? 'Booting & Configuring Device...' : 'Start QA Session'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Draggable Divider */}
      <div
        onMouseDown={() => setDragging(true)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace panels"
        className="hidden w-1.5 cursor-col-resize items-center justify-center bg-[#0f0f12] transition-colors hover:bg-zinc-700/60 lg:flex"
      >
        <div className="h-8 w-0.5 rounded-full bg-white/15" />
      </div>

      {/* Right Panel — Multi-Tab QA Studio */}
      <section className="relative flex min-h-[340px] min-w-0 flex-1 flex-col bg-[#0c0c0f] lg:min-h-0">
        {/* Multi-Tab Header */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#101013] px-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRightTab('automation')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                rightTab === 'automation'
                  ? 'bg-[#202026] text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Bot className="h-3.5 w-3.5 text-amber-400" />
              Automation Studio
              {!isPro && (
                <span className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-amber-300">
                  PRO
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setRightTab('network')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                rightTab === 'network'
                  ? 'bg-[#202026] text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Globe className="h-3.5 w-3.5 text-emerald-400" />
              Network Inspector
            </button>

            <button
              type="button"
              onClick={() => setRightTab('reports')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                rightTab === 'reports'
                  ? 'bg-[#202026] text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-sky-400" />
              Test Reports ({runReports.length})
              {!isPro && (
                <span className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-amber-300">
                  PRO
                </span>
              )}
            </button>
          </div>

          {rightTab === 'network' && (
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
                className="studio-btn py-0.5 text-[10px]"
                title="Start mitmweb (:8082) container or local mitmproxy binary"
              >
                <Play className="h-2.5 w-2.5 text-emerald-400" />
                Start mitmweb
              </button>
              <button
                type="button"
                onClick={() => setMitmKey((k) => k + 1)}
                className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                title="Reload mitmweb"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <a
                href={session.mitmWebUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                title="Open mitmweb in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Tab Body */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {rightTab === 'network' ? (
            /* Tab 2: Live Network Inspector (mitmweb :8082 — Free Tier) */
            <div className="flex h-full flex-col">
              {/* Quick Filter Preset Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] bg-[#0e0e11] px-3 py-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500">
                  <Filter className="h-3 w-3" />
                  Filter:
                </span>
                <div className="inline-flex flex-wrap items-center gap-1">
                  {MITM_FILTER_PRESETS.map((preset) => {
                    const active = mitmFilterPreset === preset.id;
                    const activeClass =
                      preset.id === 'errors'
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                        : preset.id === 'all'
                          ? 'border-white/20 bg-[#202026] text-zinc-100'
                          : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setMitmFilterPreset(preset.id)}
                        title={preset.title}
                        className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          active
                            ? activeClass
                            : 'border-white/[0.08] bg-[#141418] text-zinc-400 hover:border-white/15 hover:text-zinc-200'
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
                    className="studio-input h-6 w-44 py-0 font-mono text-[10px]"
                  />
                  {effectiveMitmFilter && (
                    <>
                      <code
                        className="hidden max-w-[180px] truncate rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 xl:inline-block"
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
                        className="rounded p-0.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
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
                className={`min-h-0 w-full flex-1 border-0 bg-[#0d0d10] ${dragging ? 'pointer-events-none' : ''}`}
              />
            </div>
          ) : !isPro ? (
            /* Pro Gate for Tab 1 (Automation Studio) & Tab 3 (Test Reports) */
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#121216] p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
                    <Crown className="h-4 w-4 text-amber-400" />
                  </div>
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    Pro Feature
                  </span>
                </div>

                <h3 className="mt-4 text-sm font-semibold text-zinc-100">
                  No-Code Visual Recorder, Maestro YAML & Bug Reports
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  Record Smart Selector flows directly on your Android screen, execute Maestro YAML scripts with live WebSocket progress, record `.mp4` videos, and export Jira/Linear-ready `.zip` bug reports.
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
                      <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
                      Buy Pro on Gumroad
                    </a>
                  )}
                  {license?.demoProAllowed && (
                    <button
                      type="button"
                      onClick={onEnableDemoPro}
                      className="studio-btn flex-1 py-2"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      Demo Pro Preview
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : rightTab === 'automation' ? (
            /* Tab 1: Automation Studio */
            <div className="flex h-full flex-col overflow-hidden">
              {/* Sub-tab Switcher */}
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0e0e11] px-4 py-2">
                <div className="inline-flex rounded-md border border-white/10 bg-[#09090b] p-0.5">
                  <button
                    type="button"
                    onClick={() => setAutomationSubTab('nocode')}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium ${
                      automationSubTab === 'nocode'
                        ? 'bg-[#202026] text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <CircleDot className="h-3 w-3 text-rose-400" />
                    No-Code Flow Builder ({recordedSteps.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutomationSubTab('maestro')}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium ${
                      automationSubTab === 'maestro'
                        ? 'bg-[#202026] text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Code2 className="h-3 w-3 text-sky-400" />
                    Maestro YAML Editor
                  </button>
                </div>

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
                    className="studio-select text-[11px]"
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

                  {/* Recorded Steps List */}
                  <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#09090b] p-3">
                    {recordedSteps.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center py-10 text-center text-xs text-zinc-500">
                        <p>No steps recorded yet.</p>
                        <p className="mt-1 text-[11px]">
                          Click <strong className="text-zinc-300">Record Flow</strong> above the Android screen and tap elements to capture Smart Selectors.
                        </p>
                      </div>
                    ) : (
                      recordedSteps.map((step, idx) => {
                        const status = liveStepStatus[step.id];
                        return (
                          <div
                            key={step.id}
                            className={`flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs ${
                              status === 'PASS'
                                ? 'border-emerald-500/30 bg-emerald-500/10'
                                : status === 'FAIL'
                                  ? 'border-rose-500/30 bg-rose-500/10'
                                  : status === 'RUNNING'
                                    ? 'border-sky-500/40 bg-sky-500/10'
                                    : 'border-white/[0.07] bg-[#141418]'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="font-mono text-[10px] text-zinc-500">#{idx + 1}</span>
                              <span className="truncate font-medium text-zinc-200">
                                {step.label || step.action}
                              </span>
                              {step.selectorType && (
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                                  {step.selectorType}
                                </span>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {status === 'RUNNING' && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />}
                              {status === 'PASS' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                              {status === 'FAIL' && <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                              <button
                                type="button"
                                onClick={() =>
                                  setRecordedSteps((prev) => prev.filter((s) => s.id !== step.id))
                                }
                                className="text-zinc-500 hover:text-rose-400"
                                title="Remove step"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRunFlow()}
                      disabled={runningFlow || recordedSteps.length === 0 || !session.active}
                      className="studio-btn-primary"
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
                      <Code2 className="h-3.5 w-3.5 text-sky-400" />
                      Convert to Maestro YAML
                    </button>
                    {recordedSteps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecordedSteps([]);
                          setLiveStepStatus({});
                        }}
                        className="studio-btn ml-auto text-zinc-400"
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
                      className="studio-btn-primary"
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
                    className="studio-input min-h-[180px] flex-1 resize-none font-mono text-[11px] leading-relaxed"
                  />

                  <div className="h-32 overflow-y-auto rounded-md border border-white/[0.08] bg-[#09090b] p-2.5 font-mono text-[10px]">
                    {consoleLines.length === 0 ? (
                      <span className="text-zinc-500">
                        Live Maestro / ADB execution console output will stream here...
                      </span>
                    ) : (
                      consoleLines.map((item, idx) => (
                        <div
                          key={idx}
                          className={
                            item.level === 'pass'
                              ? 'text-emerald-400'
                              : item.level === 'fail'
                                ? 'text-rose-400'
                                : item.level === 'warn'
                                  ? 'text-amber-300'
                                  : 'text-zinc-300'
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
                <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">
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
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                          selectedReport?.id === rep.id
                            ? 'border-zinc-400/50 bg-[#202026] text-zinc-100'
                            : 'border-white/10 bg-[#141418] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            rep.status === 'PASS' ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        {rep.flowName}
                      </button>
                    ))}
                  </div>

                  {selectedReport && (
                    <div className="space-y-3 rounded-lg border border-white/[0.08] bg-[#101013] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                selectedReport.status === 'PASS'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-rose-500/15 text-rose-300'
                              }`}
                            >
                              {selectedReport.status} ({selectedReport.passedSteps}/{selectedReport.totalSteps})
                            </span>
                            <span className="text-xs font-semibold text-zinc-100">
                              {selectedReport.flowName}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-zinc-500">
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

                      <div className="space-y-1.5">
                        {selectedReport.stepResults.map((s) => (
                          <div
                            key={`${s.stepId}-${s.index}`}
                            className="rounded border border-white/[0.06] bg-[#141418] p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-zinc-200">
                                {s.index + 1}. {s.label}
                              </span>
                              <span
                                className={`font-mono text-[10px] font-semibold ${
                                  s.status === 'PASS' ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {s.status} ({s.durationMs}ms)
                              </span>
                            </div>
                            <p className="mt-0.5 font-mono text-[11px] text-zinc-400">{s.detail}</p>
                            {s.screenshotFile && (
                              <img
                                src={api.getScreenshotUrl(s.screenshotFile)}
                                alt={`Failure screenshot for ${s.label}`}
                                className="mt-2 max-h-56 rounded border border-white/10"
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
    </main>
  );
}
