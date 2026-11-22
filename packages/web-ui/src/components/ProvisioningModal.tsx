import { CheckCircle2, Container, Loader2, X, XCircle } from 'lucide-react';
import type { AndroidVersion } from '../types';

export interface ProvisioningState {
  open: boolean;
  androidVersion: AndroidVersion;
  stage: 'starting-runtime' | 'pulling' | 'booting' | 'done' | 'error';
  percent: number;
  message: string;
  error?: string;
}

interface ProvisioningModalProps {
  state: ProvisioningState;
  onClose: () => void;
}

export function ProvisioningModal({ state, onClose }: ProvisioningModalProps) {
  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provisioning-title"
    >
      <div className="studio-surface w-full max-w-md rounded-xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {state.stage === 'error' ? (
              <XCircle className="h-4 w-4 text-rose-600" />
            ) : state.stage === 'done' ? (
              <CheckCircle2 className="h-4 w-4 text-[#1F7A3E]" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-[#E54D2E]" />
            )}
            <h2 id="provisioning-title" className="text-sm font-semibold text-[#111827]">
              Launching Virtual Android {state.androidVersion}
            </h2>
          </div>
          {(state.stage === 'error' || state.stage === 'done') && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-[#6B7280]">{state.message}</p>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-[#374151]">
              <Container className="h-3.5 w-3.5 text-[#6B7280]" />
              {state.stage === 'starting-runtime'
                ? 'Starting Container Engine...'
                : state.stage === 'pulling'
                  ? `Downloading Android ${state.androidVersion} Image...`
                  : state.stage === 'booting'
                    ? 'Booting Android & Injecting Proxy/CA...'
                    : state.stage === 'done'
                      ? 'Ready'
                      : 'Failed'}
            </span>
            <span className="tabular-nums text-[#111827] font-semibold">{state.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className={`h-full transition-all duration-300 ${
                state.stage === 'error'
                  ? 'bg-rose-600'
                  : state.stage === 'done'
                    ? 'bg-[#1F7A3E]'
                    : 'bg-[#E54D2E]'
              }`}
              style={{ width: `${Math.max(4, Math.min(100, state.percent))}%` }}
            />
          </div>
        </div>

        {state.error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}
