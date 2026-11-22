import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.tone === 'success'
            ? CheckCircle2
            : toast.tone === 'error'
              ? XCircle
              : toast.tone === 'warning'
                ? AlertTriangle
                : Info;

        const accent =
          toast.tone === 'success'
            ? 'text-[#1F7A3E]'
            : toast.tone === 'error'
              ? 'text-rose-600'
              : toast.tone === 'warning'
                ? 'text-amber-600'
                : 'text-[#111827]';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-[0_10px_25px_-5px_rgba(16,24,40,0.12)]"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${accent}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#111827]">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded p-0.5 text-[#9CA3AF] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
