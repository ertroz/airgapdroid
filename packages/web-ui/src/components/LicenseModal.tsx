import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Crown,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { LicenseStatus } from '../types';

interface LicenseModalProps {
  open: boolean;
  license: LicenseStatus | null;
  onClose: () => void;
  onLicenseUpdated: (status: LicenseStatus) => void;
  onNotify: (tone: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

function formatSubscriptionLabel(sub?: LicenseStatus['subscriptionStatus']): string | null {
  switch (sub) {
    case 'one-time':
      return 'One-Time License';
    case 'active':
      return 'Active Subscription';
    case 'cancelled-active':
      return 'Cancelled (Active Until Period End)';
    case 'ended':
      return 'Subscription Ended';
    case 'failed':
      return 'Payment Failed';
    default:
      return null;
  }
}

function formatShortTimestamp(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LicenseModal({
  open,
  license,
  onClose,
  onLicenseUpdated,
  onNotify,
}: LicenseModalProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);

  if (!open) return null;

  const isPro = Boolean(license?.isPro);
  const isGumroadActive = license?.validationSource === 'gumroad';
  const showGumroadDetails = isGumroadActive || Boolean(license?.reverifyRequired);
  const demoProAllowed = Boolean(license?.demoProAllowed);
  const gumroadEnabled = Boolean(license?.gumroadEnabled);
  const checkoutUrl = license?.checkoutUrl;
  const subscriptionLabel = formatSubscriptionLabel(license?.subscriptionStatus);
  const lastVerifiedLabel = formatShortTimestamp(license?.lastVerifiedAt);
  const graceUntilLabel = formatShortTimestamp(license?.offlineGraceUntil);

  const syncStatusAfterError = async () => {
    try {
      const latest = await api.getLicenseStatus();
      onLicenseUpdated(latest);
    } catch {
      // ignore fallback fetch error
    }
  };

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;
    setBusy(true);
    try {
      const res = await api.activateLicense({ licenseKey: licenseKey.trim() });
      onLicenseUpdated(res.status);
      setLicenseKey('');
      onNotify('success', 'Pro License Activated', res.message);
    } catch (err) {
      await syncStatusAfterError();
      onNotify('error', 'Activation Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleReverify = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyLicense();
      onLicenseUpdated(res.status);
      onNotify('success', 'License Verified', res.message);
    } catch (err) {
      await syncStatusAfterError();
      onNotify('error', 'Verification Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setVerifying(false);
    }
  };

  const handleToggleDemoPro = async () => {
    setBusy(true);
    try {
      const enable = !license?.isDemoPreview;
      const res = await api.activateLicense({ demoPreview: enable });
      onLicenseUpdated(res.status);
      onNotify(
        enable ? 'success' : 'info',
        enable ? 'Demo Pro Preview Enabled' : 'Returned to Free Tier',
        res.message
      );
    } catch (err) {
      await syncStatusAfterError();
      onNotify('error', 'Failed to toggle Demo Pro', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    setBusy(true);
    try {
      const res = await api.activateLicense({ deactivate: true });
      onLicenseUpdated(res.status);
      onNotify('info', 'License Deactivated', res.message);
    } catch (err) {
      onNotify('error', 'Failed to deactivate license', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="license-modal-title"
    >
      <div className="studio-surface max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Crown className={`h-4 w-4 ${isPro ? 'text-amber-600' : 'text-[#4B5563]'}`} />
            <div>
              <h2 id="license-modal-title" className="text-sm font-semibold text-[#111827]">
                Commercial License & Tier Management
              </h2>
              <p className="text-[11px] text-[#6B7280]">
                Encrypted with AES-256-GCM in <code className="rounded bg-[#F3F4F6] px-1 font-mono text-[#111827]">~/.qa-studio/license.json</code> bound to this machine.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 bg-[#F7F8FA] p-5">
          {/* Offline Grace Expired Warning */}
          {license?.reverifyRequired && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="font-semibold text-amber-950">Offline Grace Window Expired</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                    Reconnect to the internet and re-verify your Gumroad license key to restore Pro access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleReverify()}
                disabled={verifying || busy}
                className="studio-btn shrink-0 border-amber-300 text-[11px] text-amber-900"
              >
                <RefreshCw className={`h-3 w-3 ${verifying ? 'animate-spin' : ''}`} />
                Re-verify
              </button>
            </div>
          )}

          {/* Active Tier Summary */}
          <div className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[#111827]">
                    Current Plan:{' '}
                    <span className={isPro ? 'text-amber-700' : 'text-[#4B5563]'}>
                      {license?.isDemoPreview
                        ? 'Pro (Demo Preview)'
                        : isGumroadActive
                          ? 'Pro Commercial (Gumroad)'
                          : isPro
                            ? 'Pro Commercial'
                            : 'Free Tier'}
                    </span>
                  </span>
                  {subscriptionLabel && showGumroadDetails && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF9F0] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#1F7A3E]">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      {subscriptionLabel}
                    </span>
                  )}
                </div>

                {license?.licenseKeyMasked && (
                  <div className="mt-1 font-mono text-[11px] text-[#4B5563]">
                    Key: {license.licenseKeyMasked}
                  </div>
                )}

                {showGumroadDetails && (
                  <div className="mt-2 space-y-0.5 text-[11px] text-[#6B7280]">
                    {license?.buyerEmail && (
                      <div>
                        Licensed to: <span className="font-medium text-[#111827]">{license.buyerEmail}</span>
                        {license.productName ? ` · ${license.productName}` : ''}
                      </div>
                    )}
                    {typeof license?.uses === 'number' && (
                      <div>
                        Seat activations:{' '}
                        <span className="font-mono font-medium tabular-nums text-[#111827]">
                          {license.maxUses
                            ? `${license.uses} / ${license.maxUses} devices`
                            : `${license.uses} device(s)`}
                        </span>
                      </div>
                    )}
                    {(lastVerifiedLabel || graceUntilLabel) && (
                      <div className="text-[10px] text-[#6B7280]">
                        {lastVerifiedLabel ? `Last verified: ${lastVerifiedLabel}` : ''}
                        {lastVerifiedLabel && graceUntilLabel ? ' · ' : ''}
                        {graceUntilLabel ? `Offline grace until: ${graceUntilLabel}` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {showGumroadDetails && (
                  <button
                    type="button"
                    onClick={() => void handleReverify()}
                    disabled={verifying || busy}
                    className="studio-btn text-[11px]"
                    title="Re-verify license status online with Gumroad"
                  >
                    <RefreshCw className={`h-3 w-3 ${verifying ? 'animate-spin' : ''}`} />
                    {verifying ? 'Verifying...' : 'Re-verify'}
                  </button>
                )}
                {isPro && (
                  <button
                    type="button"
                    onClick={() => void handleDeactivate()}
                    disabled={busy || verifying}
                    className="studio-btn text-[11px]"
                  >
                    Revert to Free
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tier Feature Matrix */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-3.5">
              <div className="text-xs font-semibold text-[#111827]">Free Tier</div>
              <ul className="mt-2 space-y-1.5 text-[11px] text-[#4B5563]">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 shrink-0 text-[#1F7A3E]" /> Android 14 (Kiri/Docker) & Direct ADB
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 shrink-0 text-[#1F7A3E]" /> Live HTTPS Inspector & XHR Filters
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 shrink-0 text-[#1F7A3E]" /> Dynamic Firebase App Distribution
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 shrink-0 text-[#1F7A3E]" /> Local APK Install & Live Logcat
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#111827]">Pro Tier</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-800">
                  ALL FEATURES
                </span>
              </div>
              <ul className="mt-2 space-y-1.5 text-[11px] text-[#374151]">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-600" /> Multi-OS Switcher (Android 11, 12, 13)
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-600" /> No-Code Visual Recorder & Maestro YAML
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-600" /> Screen Record (.mp4) & Bug Report (.zip)
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-600" /> Auto Failure Screenshots & Error Logs
                </li>
              </ul>
            </div>
          </div>

          {/* License Key Activation Form */}
          <form onSubmit={(e) => void handleActivateKey(e)} className="space-y-2 rounded-lg border border-[#E5E7EB] bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-[#111827]">
                {gumroadEnabled ? 'Activate Gumroad License Key' : 'Activate Commercial License Key'}
              </label>
              {!isPro && checkoutUrl && (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E54D2E] transition-colors hover:text-[#CE3E21]"
                >
                  Buy Pro on Gumroad
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder={
                  gumroadEnabled
                    ? 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX'
                    : 'QASTUDIO-PRO-XXXX-XXXX'
                }
                className="studio-input flex-1 font-mono uppercase tracking-wider"
              />
              <button
                type="submit"
                disabled={busy || verifying || !licenseKey.trim()}
                className="studio-btn-primary shrink-0"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Activate
              </button>
            </div>
            {gumroadEnabled && (
              <p className="text-[10px] text-[#6B7280]">
                Verified via Gumroad License API v2
                {license?.maxUses ? ` · Up to ${license.maxUses} device activations per key` : ''}
                {' · '}Supports offline grace period after activation.
              </p>
            )}
          </form>

          {/* Buy Pro CTA Card when Gumroad checkout URL is configured and user is on Free tier */}
          {!isPro && checkoutUrl && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2.5">
              <div>
                <div className="text-xs font-semibold text-[#111827]">Need a Pro License Key?</div>
                <div className="text-[11px] text-[#6B7280]">
                  Instant delivery via Gumroad — paste your key above right after checkout.
                </div>
              </div>
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="studio-btn-accent shrink-0"
              >
                Buy Pro
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Developer Demo Pro Preview Toggle (hidden automatically in Gumroad production mode) */}
          {demoProAllowed && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="text-xs font-semibold text-[#111827]">Demo Pro Preview Mode</div>
                  <div className="text-[11px] text-[#6B7280]">
                    Instantly test all Pro workflows during local development & evaluation.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleToggleDemoPro()}
                disabled={busy}
                className="studio-btn shrink-0"
              >
                {license?.isDemoPreview ? 'Disable Preview' : 'Enable Preview'}
              </button>
            </div>
          )}

          {/* Machine Fingerprint */}
          {license?.machineFingerprint && (
            <div className="flex items-center gap-2 px-1 text-[10px] text-[#6B7280]">
              <Fingerprint className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-mono">
                Machine Fingerprint: {license.machineFingerprint}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
