import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Container,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
  XCircle,
} from 'lucide-react';
import type { RuntimeMode, SystemCheckReport } from '../types';

interface SystemCheckModalProps {
  open: boolean;
  report: SystemCheckReport | null;
  loading: boolean;
  configuringRuntime?: boolean;
  configuringBinder?: boolean;
  onClose: () => void;
  onRecheck: () => void;
  onConfigureRuntime?: () => void;
  onConfigureBinder?: () => void;
  onSelectMode: (mode: RuntimeMode) => void;
}

function CopyCommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-2">
      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-[#111827]">
        {command}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded border border-[#D1D5DB] bg-white p-1 text-[#6B7280] transition-colors hover:text-[#111827]"
        title="Copy command"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-[#1F7A3E]" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function SystemCheckModal({
  open,
  report,
  loading,
  configuringRuntime = false,
  configuringBinder = false,
  onClose,
  onRecheck,
  onConfigureRuntime,
  onConfigureBinder,
  onSelectMode,
}: SystemCheckModalProps) {
  if (!open) return null;

  const osLabel = report
    ? report.os === 'darwin'
      ? 'macOS (darwin)'
      : report.os === 'win32'
        ? 'Windows (win32)'
        : report.isWsl
          ? 'Linux (WSL2)'
          : 'Linux'
    : 'Detecting...';

  const runtime = report?.containerRuntime;
  const runtimeLabel = runtime?.engine === 'docker' ? 'Docker Mode' : 'Kiri Mode';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-check-title"
    >
      <div className="studio-surface flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 id="system-check-title" className="text-sm font-semibold text-[#111827]">
              System Check Wizard & Hybrid Runtime Detector
            </h2>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              Verifies Kiri container runtime (Docker fallback), Android binder kernel, ADB, and mitmproxy CA readiness.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRecheck}
              disabled={loading}
              className="studio-btn shrink-0 whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Re-check
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-[#F7F8FA] p-5">
          {!report ? (
            <div className="flex items-center justify-center py-12 text-xs text-[#6B7280]">
              Running host diagnostics...
            </div>
          ) : (
            <>
              {/* Recommended mode summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <Monitor className="h-4 w-4 text-[#4B5563]" />
                  <div>
                    <div className="text-xs font-medium text-[#374151]">
                      Host OS: <span className="font-mono font-semibold text-[#111827]">{osLabel}</span>{' '}
                      <span className="text-[#6B7280]">({report.arch})</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#6B7280]">
                      Recommended runtime:{' '}
                      <span className="font-semibold text-[#1F7A3E]">
                        {report.recommendedMode === 'docker'
                          ? `${runtimeLabel} (Redroid)`
                          : 'Direct ADB Mode'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelectMode(report.recommendedMode);
                    onClose();
                  }}
                  className="studio-btn-primary"
                >
                  Use {report.recommendedMode === 'docker' ? runtimeLabel : 'Direct ADB Mode'}
                </button>
              </div>

              {/* Check 1: Kiri-First Container Runtime */}
              <div className="rounded-lg border border-[#E5E7EB] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Container className="mt-0.5 h-4 w-4 text-[#4B5563]" />
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#111827]">
                        <span>Container Runtime (Kiri-First)</span>
                        {runtime?.engine === 'kiri' && (
                          <span className="rounded bg-[#EBF9F0] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#1F7A3E]">
                            kiri
                          </span>
                        )}
                        {runtime?.engine === 'docker' && (
                          <span className="rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sky-700">
                            docker fallback
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">
                        {report.dockerAvailable
                          ? runtime?.engine === 'kiri'
                            ? `Kiri runtime active (${runtime.kiriVersion ?? 'ready'}). Lightweight ~15 MB daemon — no Docker Desktop required.`
                            : `Docker fallback active (v${report.dockerVersion ?? 'ready'}). Install Kiri anytime for lower RAM usage.`
                          : report.dockerError ||
                            'Kiri container runtime is not installed yet. Install from your binder-enabled Kiri fork.'}
                      </p>
                    </div>
                  </div>

                  {report.dockerAvailable ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EBF9F0] px-2.5 py-0.5 text-[11px] font-semibold text-[#1F7A3E]">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  ) : runtime?.needsConfig ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle className="h-3 w-3" /> Needs Config
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle className="h-3 w-3" /> Not Installed
                    </span>
                  )}
                </div>

                {!report.dockerAvailable && runtime && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {runtime.kiriInstalled && onConfigureRuntime && (
                        <button
                          type="button"
                          onClick={onConfigureRuntime}
                          disabled={configuringRuntime}
                          className="studio-btn-primary"
                        >
                          {configuringRuntime ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          {configuringRuntime ? 'Configuring Kiri...' : 'Configure & Start Kiri'}
                        </button>
                      )}
                      {!runtime.kiriInstalled && (
                        <a
                          href={runtime.forkReleasesUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="studio-btn-primary"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Install Kiri ({runtime.forkRepo})
                          <ExternalLink className="h-3 w-3 opacity-70" />
                        </a>
                      )}
                    </div>
                    {report.dockerFixCommand && <CopyCommandBlock command={report.dockerFixCommand} />}
                  </div>
                )}
              </div>

              {/* Check 2: Android Binder Kernel Support */}
              <div className="rounded-lg border border-[#E5E7EB] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Cpu className="mt-0.5 h-4 w-4 text-[#4B5563]" />
                    <div>
                      <div className="text-xs font-semibold text-[#111827]">
                        Android Kernel Support (binder / binderfs)
                        {report.kernelModulesReady.checkedInGuestVm && (
                          <span className="ml-2 rounded border border-[#E5E7EB] bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#4B5563]">
                            Kiri Guest Kernel
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">
                        {report.kernelModulesReady.message}
                      </p>
                      {report.kernelModulesReady.applicable && (
                        <div className="mt-2 flex items-center gap-2 font-mono text-[11px]">
                          <span
                            className={`rounded px-1.5 py-0.5 font-medium ${
                              report.kernelModulesReady.binder
                                ? 'bg-[#EBF9F0] text-[#1F7A3E]'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            binder: {report.kernelModulesReady.binder ? 'OK' : 'MISSING'}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 font-medium ${
                              report.kernelModulesReady.ashmem
                                ? 'bg-[#EBF9F0] text-[#1F7A3E]'
                                : 'bg-[#F3F4F6] text-[#4B5563]'
                            }`}
                          >
                            ashmem: {report.kernelModulesReady.ashmem ? 'OK' : 'MEMFD (OK 11+)'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {!report.kernelModulesReady.applicable ? (
                    <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-medium text-[#6B7280]">
                      Pending
                    </span>
                  ) : report.kernelModulesReady.ready ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EBF9F0] px-2.5 py-0.5 text-[11px] font-semibold text-[#1F7A3E]">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                      <XCircle className="h-3 w-3" /> Action Needed
                    </span>
                  )}
                </div>
                {!report.kernelModulesReady.ready && onConfigureBinder && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={onConfigureBinder}
                      disabled={configuringBinder}
                      className="studio-btn-primary"
                    >
                      {configuringBinder ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Cpu className="h-3.5 w-3.5" />
                      )}
                      {configuringBinder
                        ? 'Configuring Binder...'
                        : report.os === 'darwin'
                          ? 'Auto-Configure Kiri Guest Kernel (KIRI_GUEST_DIR)'
                          : report.os === 'win32'
                            ? 'Auto-Configure WSL2 Binder (.wslconfig)'
                            : 'Auto-Load binder_linux Module'}
                    </button>
                  </div>
                )}
                {report.kernelModulesReady.fixCommands.length > 0 && (
                  <CopyCommandBlock command={report.kernelModulesReady.fixCommands.join('\n')} />
                )}
              </div>

              {/* Check 3: ADB & Connected Devices */}
              <div className="rounded-lg border border-[#E5E7EB] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Smartphone className="mt-0.5 h-4 w-4 text-[#4B5563]" />
                    <div>
                      <div className="text-xs font-semibold text-[#111827]">
                        Android Debug Bridge (ADB)
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">
                        {report.adbAvailable
                          ? `${report.adbVersion ?? 'ADB ready'} — ${report.connectedDevices.length} device(s) detected.`
                          : report.adbError || 'ADB is not installed on host PATH.'}
                      </p>
                      {report.connectedDevices.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {report.connectedDevices.map((d) => (
                            <span
                              key={d.serial}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 font-mono text-[11px] text-[#111827]"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  d.state === 'device' ? 'bg-[#1F7A3E]' : 'bg-amber-500'
                                }`}
                              />
                              {d.serial}
                              {d.model ? ` (${d.model})` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {report.adbAvailable ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EBF9F0] px-2.5 py-0.5 text-[11px] font-semibold text-[#1F7A3E]">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                      <XCircle className="h-3 w-3" /> Missing
                    </span>
                  )}
                </div>
                {!report.adbAvailable && report.adbFixCommand && (
                  <CopyCommandBlock command={report.adbFixCommand} />
                )}
              </div>

              {/* Check 4: mitmproxy SSL System Certificate */}
              <div className="rounded-lg border border-[#E5E7EB] bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-[#4B5563]" />
                    <div>
                      <div className="text-xs font-semibold text-[#111827]">
                        HTTPS System CA Certificate (mitmproxy)
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">
                        {report.certReady
                          ? `Android system cert ${report.certFileName} is ready for automatic injection into /system/etc/security/cacerts/.`
                          : 'Generate and convert the mitmproxy CA certificate to <subject_hash_old>.0 for automatic HTTPS decryption.'}
                      </p>
                    </div>
                  </div>
                  {report.certReady ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EBF9F0] px-2.5 py-0.5 text-[11px] font-semibold text-[#1F7A3E]">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle className="h-3 w-3" /> Not Generated
                    </span>
                  )}
                </div>
                {!report.certReady && <CopyCommandBlock command={report.certFixCommand} />}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E5E7EB] bg-white px-5 py-3">
          <span className="text-[11px] text-[#6B7280]">
            Start ws-scrcpy & mitmweb anytime with{' '}
            <code className="rounded bg-[#F3F4F6] px-1 py-0.5 font-mono text-[#111827]">npm run infra:up</code> (auto-uses Kiri)
          </span>
          <button type="button" onClick={onClose} className="studio-btn">
            Continue to Studio
          </button>
        </div>
      </div>
    </div>
  );
}
