import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Radio, ShieldCheck, Smartphone, Wifi, Wrench } from 'lucide-react';
import { api } from './api/client';
import { AutomationDrawer } from './components/AutomationDrawer';
import { BugReportModal } from './components/BugReportModal';
import { ClearDataModal } from './components/ClearDataModal';
import { FirebaseDrawer } from './components/FirebaseDrawer';
import { LicenseModal } from './components/LicenseModal';
import { LogcatPanel } from './components/LogcatPanel';
import { ProvisioningModal, type ProvisioningState } from './components/ProvisioningModal';
import { SystemCheckModal } from './components/SystemCheckModal';
import { ToastStack } from './components/ToastStack';
import { TopToolbar } from './components/TopToolbar';
import { UploadApkModal } from './components/UploadApkModal';
import { WorkspaceSplitView } from './components/WorkspaceSplitView';
import type {
  ActiveSession,
  AdbDeviceInfo,
  AndroidVersion,
  ExportedBugReport,
  LicenseStatus,
  RuntimeMode,
  SystemCheckReport,
  ToastMessage,
} from './types';

const INITIAL_SESSION: ActiveSession = {
  active: false,
  mode: null,
  deviceSerial: null,
  proxyPort: 8080,
  metroPort: 8081,
  wsScrcpyUrl: 'http://localhost:8000',
  mitmWebUrl: 'http://localhost:8082',
  metroReversed: false,
  proxyConfigured: false,
  sslCertInjected: false,
  automations: [],
};

export function App() {
  const [engineBooting, setEngineBooting] = useState(true);
  const [systemReport, setSystemReport] = useState<SystemCheckReport | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [configuringRuntime, setConfiguringRuntime] = useState(false);
  const [configuringBinder, setConfiguringBinder] = useState(false);
  const [provisioning, setProvisioning] = useState<ProvisioningState>({
    open: false,
    androidVersion: '14',
    stage: 'starting-runtime',
    percent: 0,
    message: '',
  });

  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [session, setSession] = useState<ActiveSession>(INITIAL_SESSION);
  const [sessionBusy, setSessionBusy] = useState(false);

  const [mode, setMode] = useState<RuntimeMode>('docker');
  const [androidVersion, setAndroidVersion] = useState<AndroidVersion>('14');
  const [devices, setDevices] = useState<AdbDeviceInfo[]>([]);
  const [selectedSerial, setSelectedSerial] = useState('');
  const [refreshingDevices, setRefreshingDevices] = useState(false);

  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [firebaseOpen, setFirebaseOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [uploadApkOpen, setUploadApkOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [exportedBugReport, setExportedBugReport] = useState<ExportedBugReport | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback(
    (tone: ToastMessage['tone'], title: string, description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, tone, title, description }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const runSystemCheck = useCallback(async (openOnIssues = false) => {
    setSystemLoading(true);
    try {
      const report = await api.getSystemCheck();
      setSystemReport(report);
      setDevices(report.connectedDevices);
      setMode(report.recommendedMode);

      if (report.connectedDevices.length > 0) {
        const ready =
          report.connectedDevices.find((d) => d.state === 'device') ?? report.connectedDevices[0];
        setSelectedSerial(ready.serial);
      }

      const needsAttention =
        !report.adbAvailable ||
        (report.recommendedMode === 'docker' && !report.readyForDocker);
      if (openOnIssues && needsAttention && report.connectedDevices.length === 0) {
        setSystemModalOpen(true);
      }
    } catch (err) {
      notify(
        'error',
        'Orchestrator Unreachable',
        err instanceof Error
          ? err.message
          : 'Make sure packages/orchestrator is running on port 4000.'
      );
    } finally {
      setSystemLoading(false);
    }
  }, [notify]);

  // Initial bootstrap: wait briefly for sidecar /api/health, then load System Check, License, and Session
  useEffect(() => {
    const bootstrap = async () => {
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          await api.health();
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      setEngineBooting(false);

      await runSystemCheck(true);
      try {
        const [lic, sess] = await Promise.all([
          api.getLicenseStatus(),
          api.getSessionStatus(),
        ]);
        setLicense(lic);
        setSession(sess);
        if (sess.active && sess.mode) {
          setMode(sess.mode);
          if (sess.androidVersion) setAndroidVersion(sess.androidVersion);
          if (sess.deviceSerial) setSelectedSerial(sess.deviceSerial);
        }
      } catch {
        // Error toast already triggered by system check if backend is down
      }
    };
    void bootstrap();
  }, [runSystemCheck]);

  const handleRefreshDevices = async () => {
    setRefreshingDevices(true);
    try {
      const { devices: list } = await api.getAdbDevices();
      setDevices(list);
      if (list.length > 0 && !list.some((d) => d.serial === selectedSerial)) {
        setSelectedSerial(list[0].serial);
      }
      notify('info', 'ADB Devices Refreshed', `${list.length} device(s) detected.`);
    } catch (err) {
      notify('error', 'Failed to list ADB devices', err instanceof Error ? err.message : undefined);
    } finally {
      setRefreshingDevices(false);
    }
  };

  const handleConnectDirectImmediately = async (serial: string) => {
    setMode('direct-adb');
    setSelectedSerial(serial);
    setSessionBusy(true);
    try {
      const started = await api.startSession({
        mode: 'direct-adb',
        deviceSerial: serial,
      });
      setSession(started);
      notify('success', 'Connected Immediately', `${started.deviceSerial} is ready for QA!`);
    } catch (err) {
      notify('error', 'Direct ADB Connect Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSessionBusy(false);
    }
  };

  const handleStartSession = async () => {
    const allowed = license?.features?.allowedAndroidVersions ?? ['14'];
    if (mode === 'docker' && !allowed.includes(androidVersion) && !license?.isPro) {
      setLicenseModalOpen(true);
      return;
    }

    setSessionBusy(true);
    try {
      if (mode === 'docker') {
        if (!systemReport?.dockerAvailable) {
          setProvisioning({
            open: true,
            androidVersion,
            stage: 'starting-runtime',
            percent: 8,
            message: 'Waking Kiri / OrbStack / Colima / Docker Engine...',
          });
          const runtimeRes = await api.startContainerRuntime();
          setSystemReport(runtimeRes.report);
          if (!runtimeRes.ok) {
            setProvisioning((p) => ({
              ...p,
              stage: 'error',
              message: runtimeRes.message,
              error: runtimeRes.message,
            }));
            setSessionBusy(false);
            return;
          }
        }

        await new Promise<void>((resolve, reject) => {
          const es = new EventSource(api.getPullProgressUrl(androidVersion));
          es.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data as string) as {
                stage: 'checking' | 'starting-runtime' | 'pulling' | 'ready' | 'error';
                percent: number;
                message: string;
                done: boolean;
                error?: string;
              };
              const mappedStage: ProvisioningState['stage'] =
                data.stage === 'ready'
                  ? 'booting'
                  : data.stage === 'checking'
                    ? 'pulling'
                    : data.stage;
              setProvisioning({
                open: true,
                androidVersion,
                stage: mappedStage,
                percent: data.stage === 'ready' ? 92 : data.percent,
                message: data.message,
                error: data.error,
              });
              if (data.done) {
                es.close();
                if (data.error) reject(new Error(data.error));
                else resolve();
              }
            } catch {
              // ignore parse error
            }
          };
          es.onerror = () => {
            es.close();
            resolve();
          };
        });

        setProvisioning((p) => ({
          ...p,
          stage: 'booting',
          percent: 95,
          message: `Booting Android ${androidVersion} & injecting proxy/CA...`,
        }));
      }

      const started = await api.startSession({
        mode,
        androidVersion: mode === 'docker' ? androidVersion : undefined,
        deviceSerial: mode === 'direct-adb' ? selectedSerial || undefined : undefined,
      });
      setSession(started);
      setProvisioning((p) => ({ ...p, open: false, stage: 'done', percent: 100 }));
      notify(
        'success',
        'QA Session Active',
        `${started.deviceSerial} ready · Metro :8081 ${
          started.metroReversed ? 'reversed' : 'pending'
        } · Proxy :${started.proxyPort}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start session.';
      setProvisioning((p) =>
        p.open ? { ...p, stage: 'error', error: message, message } : p
      );
      notify('error', 'Failed to Start Session', message);
    } finally {
      setSessionBusy(false);
    }
  };

  const handleStopSession = async () => {
    setSessionBusy(true);
    try {
      const res = await api.stopSession();
      setSession(res.session);
      notify(
        'info',
        'Session Stopped',
        'Global HTTP proxy reset to :0 and active container resources reclaimed.'
      );
    } catch (err) {
      notify('error', 'Failed to Stop Session', err instanceof Error ? err.message : undefined);
    } finally {
      setSessionBusy(false);
    }
  };

  const handleEnableDemoPro = async () => {
    try {
      const res = await api.activateLicense({ demoPreview: true });
      setLicense(res.status);
      notify('success', 'Demo Pro Preview Active', 'Multi-OS, Automated Testing, and Bug Reporting unlocked.');
    } catch (err) {
      notify('error', 'Could not enable Demo Pro', err instanceof Error ? err.message : undefined);
    }
  };

  const handleConfigureRuntime = async () => {
    setConfiguringRuntime(true);
    try {
      const res = await api.configureRuntime();
      setSystemReport(res.report);
      notify('success', 'Kiri Runtime Configured', res.message);
    } catch (err) {
      notify('error', 'Kiri Configuration Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setConfiguringRuntime(false);
    }
  };

  const handleConfigureBinder = async () => {
    setConfiguringBinder(true);
    try {
      const res = await api.configureBinder();
      setSystemReport(res.report);
      notify('success', 'Binder Configured', res.message);
    } catch (err) {
      notify('warning', 'Binder Setup Needs Action', err instanceof Error ? err.message : undefined);
    } finally {
      setConfiguringBinder(false);
    }
  };

  const readyDirectDevice = devices.find((d) => d.state === 'device');

  const hasSystemWarning = Boolean(
    systemReport &&
      (!systemReport.adbAvailable ||
        (mode === 'docker' && !systemReport.readyForDocker) ||
        !systemReport.certReady)
  );

  if (engineBooting) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F7F8FA] text-[#111827]">
        <div className="flex flex-col items-center rounded-xl border border-[#E5E7EB] bg-white px-8 py-7 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#111827] font-mono text-sm font-bold text-white">
            QA
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#111827]">
            <Loader2 className="h-4 w-4 animate-spin text-[#E54D2E]" />
            Starting QA Engine...
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">
            Initializing local orchestrator, bundled ADB, and screen streaming
          </p>
        </div>
      </div>
    );
  }

  const activeRuntimeName =
    session.mode === 'docker' || (!session.active && mode === 'docker')
      ? systemReport?.containerRuntime?.engine === 'docker'
        ? 'Docker (Redroid)'
        : 'Kiri (Redroid)'
      : 'Direct ADB';

  const activeTargetLabel = session.active
    ? session.mode === 'docker'
      ? `Android ${session.androidVersion}`
      : session.deviceSerial || 'Direct Device'
    : mode === 'docker'
      ? `Android ${androidVersion}`
      : selectedSerial || 'No Device Selected';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F7F8FA] text-[#111827]">
      {/* Top Control Toolbar */}
      <TopToolbar
        mode={mode}
        onModeChange={setMode}
        androidVersion={androidVersion}
        onAndroidVersionChange={setAndroidVersion}
        selectedSerial={selectedSerial}
        onSelectedSerialChange={setSelectedSerial}
        devices={devices}
        onRefreshDevices={() => void handleRefreshDevices()}
        refreshingDevices={refreshingDevices}
        session={session}
        sessionBusy={sessionBusy}
        onStartSession={() => void handleStartSession()}
        onStopSession={() => void handleStopSession()}
        license={license}
        systemReport={systemReport}
        onOpenLicense={() => setLicenseModalOpen(true)}
        onOpenSystemCheck={() => setSystemModalOpen(true)}
        onOpenFirebase={() => setFirebaseOpen(true)}
        onOpenAutomation={() => setAutomationOpen(true)}
        onOpenUploadApk={() => setUploadApkOpen(true)}
        onOpenClearData={() => setClearDataOpen(true)}
      />

      {/* Smart Onboarding: 1-Click Connect Device Immediately when Direct ADB phone is detected */}
      {!session.active && readyDirectDevice && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-200 bg-[#EBF9F0] px-4 py-1.5 text-xs text-[#14532D]">
          <div className="flex items-center gap-2 truncate">
            <Smartphone className="h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
            <span className="truncate">
              Android device detected via ADB:{' '}
              <strong className="font-mono text-[#111827]">
                {readyDirectDevice.model || readyDirectDevice.serial}
              </strong>{' '}
              — ready for 0-second testing without Docker.
            </span>
          </div>
          <button
            type="button"
            disabled={sessionBusy}
            onClick={() => void handleConnectDirectImmediately(readyDirectDevice.serial)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#1F7A3E] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#166534]"
          >
            Connect Device Immediately
          </button>
        </div>
      )}

      {/* Slim System Check Warning Banner when dependencies need attention */}
      {hasSystemWarning && systemReport && !readyDirectDevice && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="truncate">
              {!systemReport.adbAvailable
                ? 'ADB binary was not detected on host PATH.'
                : mode === 'docker' && !systemReport.readyForDocker
                  ? !systemReport.dockerAvailable
                    ? systemReport.containerRuntime?.kiriInstalled
                      ? 'Kiri is installed but not running yet — open System Wizard to configure & start.'
                      : 'Kiri container runtime not found — install Kiri Official or switch to Direct ADB.'
                    : 'Android binder kernel support is missing for Redroid containers.'
                  : 'mitmproxy Android SSL CA cert (<hash>.0) is not generated yet.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSystemModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100/60"
          >
            <Wrench className="h-3 w-3" />
            Open System Wizard
          </button>
        </div>
      )}

      {/* TestMu AI Style Session Breadcrumb & Configuration Metadata Bar */}
      <div className="shrink-0 bg-[#F7F8FA] px-4 pt-2.5 pb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {session.active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#1F7A3E] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D1D5DB] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#4B5563]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#9CA3AF]" />
                Standby
              </span>
            )}
            <h1 className="text-sm font-semibold tracking-tight text-[#111827]">
              {activeTargetLabel}
            </h1>
            <span className="hidden text-xs text-[#6B7280] sm:inline">
              · {activeRuntimeName}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[11px] shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="flex items-center gap-1.5">
              <span className="text-[#6B7280]">Viewport:</span>
              <span className="font-mono font-medium tabular-nums text-[#111827]">1080×1920</span>
            </div>
            <div className="h-3.5 w-px bg-[#E5E7EB]" />
            <div className="flex items-center gap-1.5">
              <Radio className="h-3 w-3 text-[#6B7280]" />
              <span className="text-[#6B7280]">Metro :8081</span>
              <span
                className={`font-medium ${
                  session.active && session.metroReversed ? 'text-[#1F7A3E]' : 'text-[#6B7280]'
                }`}
              >
                {session.active ? (session.metroReversed ? 'Reversed' : 'Pending') : 'Auto'}
              </span>
            </div>
            <div className="h-3.5 w-px bg-[#E5E7EB]" />
            <div className="flex items-center gap-1.5">
              <Wifi className="h-3 w-3 text-[#6B7280]" />
              <span className="text-[#6B7280]">Proxy</span>
              <span
                className={`font-mono font-medium ${
                  session.active && session.proxyConfigured ? 'text-[#1F7A3E]' : 'text-[#6B7280]'
                }`}
              >
                {session.proxyHost ? `${session.proxyHost}:${session.proxyPort}` : `:${session.proxyPort}`}
              </span>
            </div>
            <div className="hidden h-3.5 w-px bg-[#E5E7EB] md:block" />
            <div className="hidden items-center gap-1.5 md:flex">
              <ShieldCheck className="h-3 w-3 text-[#6B7280]" />
              <span
                className={`font-medium ${
                  session.active
                    ? session.sslCertInjected
                      ? 'text-[#1F7A3E]'
                      : 'text-amber-700'
                    : systemReport?.certReady
                      ? 'text-[#1F7A3E]'
                      : 'text-[#6B7280]'
                }`}
              >
                {session.active
                  ? session.sslCertInjected
                    ? 'HTTPS CA Injected'
                    : 'CA Manual/Unrooted'
                  : systemReport?.certReady
                    ? 'CA Ready'
                    : 'CA Pending'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split-View Workspace */}
      <WorkspaceSplitView
        session={session}
        sessionBusy={sessionBusy}
        mode={mode}
        androidVersion={androidVersion}
        selectedSerial={selectedSerial}
        license={license}
        onStartSession={() => void handleStartSession()}
        onOpenLicense={() => setLicenseModalOpen(true)}
        onEnableDemoPro={() => void handleEnableDemoPro()}
        onBugReportReady={(rep) => setExportedBugReport(rep)}
        onNotify={notify}
      />

      {/* Bottom Collapsible Error Logcat Terminal */}
      <LogcatPanel sessionActive={session.active} onNotify={notify} />

      {/* Modals & Drawers */}
      <SystemCheckModal
        open={systemModalOpen}
        report={systemReport}
        loading={systemLoading}
        configuringRuntime={configuringRuntime}
        configuringBinder={configuringBinder}
        onClose={() => setSystemModalOpen(false)}
        onRecheck={() => void runSystemCheck(false)}
        onConfigureRuntime={() => void handleConfigureRuntime()}
        onConfigureBinder={() => void handleConfigureBinder()}
        onSelectMode={(nextMode) => setMode(nextMode)}
      />

      <FirebaseDrawer
        open={firebaseOpen}
        onClose={() => setFirebaseOpen(false)}
        license={license}
        session={session}
        onOpenLicense={() => setLicenseModalOpen(true)}
        onEnableDemoPro={() => void handleEnableDemoPro()}
        onNotify={notify}
      />

      <AutomationDrawer
        open={automationOpen}
        onClose={() => setAutomationOpen(false)}
        license={license}
        session={session}
        onOpenLicense={() => setLicenseModalOpen(true)}
        onEnableDemoPro={() => void handleEnableDemoPro()}
        onNotify={notify}
      />

      <BugReportModal
        open={Boolean(exportedBugReport)}
        report={exportedBugReport}
        onClose={() => setExportedBugReport(null)}
      />

      <UploadApkModal
        open={uploadApkOpen}
        session={session}
        onClose={() => setUploadApkOpen(false)}
        onNotify={notify}
      />

      <ClearDataModal
        open={clearDataOpen}
        session={session}
        onClose={() => setClearDataOpen(false)}
        onNotify={notify}
      />

      <LicenseModal
        open={licenseModalOpen}
        license={license}
        onClose={() => setLicenseModalOpen(false)}
        onLicenseUpdated={(updated) => setLicense(updated)}
        onNotify={notify}
      />

      <ProvisioningModal
        state={provisioning}
        onClose={() => setProvisioning((p) => ({ ...p, open: false }))}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
export default App;
