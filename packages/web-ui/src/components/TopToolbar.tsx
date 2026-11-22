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
import { BrandLogo } from './BrandLogo';

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
    <header className="flex min-h-[54px] flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-4 py-2">
      {/* Left: Brand Breadcrumb + Session Target Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Brand Logo + Breadcrumb */}
        <div className="flex items-center gap-2.5 pr-1">
          <BrandLogo className="h-7 w-7 shrink-0" />
          <div className="hidden items-center gap-1.5 text-xs sm:flex">
            <span className="font-semibold text-[#111827]">AirgapDroid</span>
            <span className="text-[#9CA3AF]">/</span>
            <span className="font-medium text-[#6B7280]">App Live Workbench</span>
          </div>
        </div>

        <div className="hidden h-5 w-px bg-[#E5E7EB] sm:block" />

        {/* Runtime Mode Switcher */}
        <div
          className="inline-flex rounded-md border border-[#E5E7EB] bg-[#F3F4F6] p-0.5"
          role="group"
          aria-label="Runtime Mode"
        >
          <button
            type="button"
            disabled={session.active || sessionBusy}
            onClick={() => onModeChange('docker')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
              mode === 'docker'
                ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
            title="Run lightweight Redroid Android containers locally via Kiri (or Docker fallback)"
          >
            <Container className="h-3.5 w-3.5" />
            {systemReport?.containerRuntime?.engine === 'docker' ? 'Docker Mode' : 'Kiri Mode'}
          </button>
          <button
            type="button"
            disabled={session.active || sessionBusy}
            onClick={() => onModeChange('direct-adb')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
              mode === 'direct-adb'
                ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
            title="Attach to a physical Android device (USB/Wi-Fi) or local emulator via ADB"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Direct ADB
          </button>
        </div>

        {/* Target Selector */}
        {mode === 'docker' ? (
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
            className="studio-select"
          >
            {ANDROID_VERSIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
                {item.isProOnly && !isPro ? ' (PRO)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-1.5">
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
              <RefreshCw className={`h-3.5 w-3.5 text-[#4B5563] ${refreshingDevices ? 'animate-spin' : ''}`} />
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
            className="studio-btn-accent"
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

      {/* Right: Studio Tools + Plan + System Health */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          id="firebase-builds-btn"
          type="button"
          onClick={onOpenFirebase}
          className="studio-btn"
        >
          <Flame className="h-3.5 w-3.5 text-[#4B5563]" />
          <span>Firebase Builds</span>
        </button>

        <button
          id="automation-testing-btn"
          type="button"
          onClick={onOpenAutomation}
          className="studio-btn"
        >
          <Bot className="h-3.5 w-3.5 text-[#4B5563]" />
          <span>Auto Test & Report</span>
          {!isPro && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-800">
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
          <Upload className="h-3.5 w-3.5 text-[#4B5563]" />
          <span>Upload APK</span>
        </button>

        <button
          id="clear-app-data-btn"
          type="button"
          onClick={onOpenClearData}
          className="studio-btn"
        >
          <Eraser className="h-3.5 w-3.5 text-[#4B5563]" />
          <span className="hidden md:inline">Clear App Data</span>
        </button>

        <div className="mx-1 h-5 w-px bg-[#E5E7EB]" />

        {/* License Pill */}
        <button
          id="license-status-btn"
          type="button"
          onClick={onOpenLicense}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            reverifyRequired
              ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
              : isPro
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-[#D1D5DB] bg-white text-[#374151] hover:border-[#9CA3AF] hover:bg-[#F9FAFB]'
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
              reverifyRequired ? 'text-rose-600' : isPro ? 'text-amber-600' : 'text-[#6B7280]'
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
          <span
            className={`h-2 w-2 rounded-full ${
              systemHealthy ? 'bg-[#1F7A3E]' : 'bg-amber-500'
            }`}
          />
          <Activity className="h-3.5 w-3.5 text-[#4B5563]" />
          <span className="hidden lg:inline">System</span>
        </button>
      </div>
    </header>
  );
}
