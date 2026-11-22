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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provisioning-title"
    >
      <div className="studio-surface w-full max-w-md rounded-xl p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {state.stage === 'error' ? (
              <XCircle className="h-4 w-4 text-rose-400" />
            ) : state.stage === 'done' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
            )}
            <h2 id="provisioning-title" className="text-sm font-semibold text-zinc-100">
              Launching Virtual Android {state.androidVersion}
            </h2>
          </div>
          {(state.stage === 'error' || state.stage === 'done') && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-zinc-400">{state.message}</p>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-zinc-300">
              <Container className="h-3.5 w-3.5 text-zinc-400" />
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
            <span className="text-zinc-300">{state.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full transition-all duration-300 ${
                state.stage === 'error'
                  ? 'bg-rose-500'
                  : state.stage === 'done'
                    ? 'bg-emerald-500'
                    : 'bg-sky-400'
              }`}
              style={{ width: `${Math.max(4, Math.min(100, state.percent))}%` }}
            />
          </div>
        </div>

        {state.error && (
          <div className="mt-3 rounded-md border border-rose-500/25 bg-rose-500/10 p-2.5 text-[11px] text-rose-200">
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}
