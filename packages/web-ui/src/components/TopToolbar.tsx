import {
  Activity,
  Bot,
  Container,
  Crown,
  Eraser,
  Flame,
  Loader2,
  Play,
  RefreshCw,
  Smartphone,
  Square,
  Upload,
} from 'lucide-react';
import type {
  ActiveSession,
  AdbDeviceInfo,
  AndroidVersion,
  LicenseStatus,
  RuntimeMode,
  SystemCheckReport,
} from '../types';

interface TopToolbarProps {
  mode: RuntimeMode;
  onModeChange: (mode: RuntimeMode) => void;
  androidVersion: AndroidVersion;
  onAndroidVersionChange: (v: AndroidVersion) => void;
  selectedSerial: string;
  onSelectedSerialChange: (serial: string) => void;
  devices: AdbDeviceInfo[];
  onRefreshDevices: () => void;
  refreshingDevices: boolean;
  session: ActiveSession;
  sessionBusy: boolean;
  onStartSession: () => void;
  onStopSession: () => void;
  license: LicenseStatus | null;
  systemReport: SystemCheckReport | null;
  onOpenLicense: () => void;
  onOpenSystemCheck: () => void;
  onOpenFirebase: () => void;
  onOpenAutomation: () => void;
  onOpenUploadApk: () => void;
  onOpenClearData: () => void;
}

const ANDROID_VERSIONS: Array<{ value: AndroidVersion; label: string; isProOnly: boolean }> = [
  { value: '14', label: 'Android 14', isProOnly: false },
  { value: '13', label: 'Android 13', isProOnly: true },
  { value: '12', label: 'Android 12', isProOnly: true },
  { value: '11', label: 'Android 11', isProOnly: true },
];

export function TopToolbar({
  mode,
  onModeChange,
  androidVersion,
  onAndroidVersionChange,
  selectedSerial,
  onSelectedSerialChange,
  devices,
  onRefreshDevices,
  refreshingDevices,
  session,
  sessionBusy,
  onStartSession,
  onStopSession,
  license,
  systemReport,
  onOpenLicense,
  onOpenSystemCheck,
  onOpenFirebase,
  onOpenAutomation,
  onOpenUploadApk,
  onOpenClearData,
}: TopToolbarProps) {
  const isPro = Boolean(license?.isPro);
  const reverifyRequired = Boolean(license?.reverifyRequired);
  const allowedVersions = license?.features?.allowedAndroidVersions ?? ['14'];
  const systemHealthy = Boolean(
    systemReport && (mode === 'docker' ? systemReport.readyForDocker : systemReport.readyForDirectAdb)
  );

  return (
    <header className="flex min-h-[52px] flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#101013] px-3 py-1.5">
      {/* Left: Brand + Runtime Mode Switcher */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 pr-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-zinc-900 font-mono text-xs font-bold tracking-tight text-zinc-100">
            QA
          </div>
          <div className="hidden sm:block">
            <h1 className="text-xs font-semibold tracking-tight text-zinc-100">
              Local Web QA Studio
            </h1>
            <p className="text-[10px] leading-none text-zinc-500">
              Self-Hosted Device & API Workbench
            </p>
          </div>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* Mode Switcher */}
        <div
          className="inline-flex rounded-md border border-white/10 bg-[#0a0a0d] p-0.5"
          role="group"
          aria-label="Runtime Mode"
        >
          <button
            type="button"
            disabled={session.active || sessionBusy}
            onClick={() => onModeChange('docker')}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
              mode === 'docker'
                ? 'bg-[#222228] text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Run lightweight Redroid Android containers locally via Kiri (or Docker fallback)"
          >
            <Container className="h-3 w-3" />
            {systemReport?.containerRuntime?.engine === 'docker' ? 'Docker Mode' : 'Kiri Mode'}
          </button>
          <button
            type="button"
            disabled={session.active || sessionBusy}
            onClick={() => onModeChange('direct-adb')}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
              mode === 'direct-adb'
                ? 'bg-[#222228] text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Attach to a physical Android device (USB/Wi-Fi) or local emulator via ADB"
          >
            <Smartphone className="h-3 w-3" />
            Direct ADB
          </button>
        </div>

        {/* Target Selector */}
        {mode === 'docker' ? (
          <div className="flex items-center gap-1.5">
            <select
              id="android-version-select"
              aria-label="Android OS Version"
              value={androidVersion}
              disabled={session.active || sessionBusy}
              onChange={(e) => {
                const next = e.target.value as AndroidVersion;
                if (!allowedVersions.includes(next) && !isPro) {
                  onOpenLicense();
                  return;
                }
                onAndroidVersionChange(next);
              }}
              className="studio-select font-medium"
            >
              {ANDROID_VERSIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                  {item.isProOnly && !isPro ? ' (PRO)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              id="adb-device-select"
              aria-label="ADB Device Target"
              value={selectedSerial}
              disabled={session.active || sessionBusy}
              onChange={(e) => onSelectedSerialChange(e.target.value)}
              className="studio-select max-w-[210px] font-mono"
            >
              {devices.length === 0 ? (
                <option value="">No ADB devices found</option>
              ) : (
                devices.map((d) => (
                  <option key={d.serial} value={d.serial}>
                    {d.serial} {d.model ? `· ${d.model}` : ''} ({d.state})
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={onRefreshDevices}
              disabled={refreshingDevices || session.active}
              className="studio-btn px-2"
              title="Refresh connected ADB devices"
              aria-label="Refresh ADB devices"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingDevices ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {/* Start / Stop Session */}
        {!session.active ? (
          <button
            id="session-start-btn"
            type="button"
            onClick={onStartSession}
            disabled={sessionBusy}
            className="studio-btn-primary"
          >
            {sessionBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            {sessionBusy ? 'Starting...' : 'Start'}
          </button>
        ) : (
          <button
            id="session-stop-btn"
            type="button"
            onClick={onStopSession}
            disabled={sessionBusy}
            className="studio-btn-danger"
          >
            {sessionBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-3.5 w-3.5 fill-current" />
            )}
            {sessionBusy ? 'Stopping...' : 'Stop'}
          </button>
        )}
      </div>

      {/* Right: QA Actions + License + System Health */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          id="firebase-builds-btn"
          type="button"
          onClick={onOpenFirebase}
          className="studio-btn"
        >
          <Flame className="h-3.5 w-3.5 text-amber-400" />
          <span>Firebase Builds</span>
        </button>

        <button
          id="automation-testing-btn"
          type="button"
          onClick={onOpenAutomation}
          className="studio-btn"
        >
          <Bot className="h-3.5 w-3.5 text-amber-400" />
          <span>Auto Test & Report</span>
          {!isPro && (
            <span className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-amber-300">
              PRO
            </span>
          )}
        </button>

        <button
          id="upload-apk-btn"
          type="button"
          onClick={onOpenUploadApk}
          className="studio-btn"
        >
          <Upload className="h-3.5 w-3.5 text-zinc-300" />
          <span>Upload APK</span>
        </button>

        <button
          id="clear-app-data-btn"
          type="button"
          onClick={onOpenClearData}
          className="studio-btn"
        >
          <Eraser className="h-3.5 w-3.5 text-zinc-300" />
          <span className="hidden md:inline">Clear App Data</span>
        </button>

        <div className="mx-0.5 h-5 w-px bg-white/10" />

        {/* License Pill */}
        <button
          id="license-status-btn"
          type="button"
          onClick={onOpenLicense}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            reverifyRequired
              ? 'border-rose-500/35 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15'
              : isPro
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                : 'border-white/10 bg-[#18181c] text-zinc-300 hover:border-white/20 hover:text-white'
          }`}
          title={
            reverifyRequired
              ? 'Offline grace window expired — click to re-verify your Gumroad license'
              : license?.demoProAllowed
                ? 'Manage Commercial License & Demo Pro Preview'
                : 'Manage Gumroad Commercial License'
          }
        >
          <Crown
            className={`h-3.5 w-3.5 ${
              reverifyRequired ? 'text-rose-400' : isPro ? 'text-amber-400' : 'text-zinc-500'
            }`}
          />
          <span>
            {reverifyRequired
              ? 'Re-verify'
              : license?.isDemoPreview
                ? 'Pro Preview'
                : isPro
                  ? 'Pro'
                  : 'Free'}
          </span>
        </button>

        {/* System Health Button */}
        <button
          id="system-check-btn"
          type="button"
          onClick={onOpenSystemCheck}
          className="studio-btn"
          title="Open System Check Wizard"
        >
          <Activity
            className={`h-3.5 w-3.5 ${systemHealthy ? 'text-emerald-400' : 'text-amber-400'}`}
          />
          <span className="hidden lg:inline">System</span>
        </button>
      </div>
    </header>
  );
}
