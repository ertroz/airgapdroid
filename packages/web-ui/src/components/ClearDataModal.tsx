import { useEffect, useState } from 'react';
import { Eraser, Loader2, X } from 'lucide-react';
import { api } from '../api/client';
import type { ActiveSession } from '../types';

const RECENT_PACKAGES_KEY = 'qa_studio_recent_packages';

interface ClearDataModalProps {
  open: boolean;
  session: ActiveSession;
  onClose: () => void;
  onNotify: (tone: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

export function ClearDataModal({ open, session, onClose, onNotify }: ClearDataModalProps) {
  const [packageName, setPackageName] = useState('');
  const [recentPackages, setRecentPackages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_PACKAGES_KEY) || '[]') as string[];
      if (Array.isArray(saved)) setRecentPackages(saved);
    } catch {
      // ignore
    }
  }, [open]);

  if (!open) return null;

  const handleClear = async (e: React.FormEvent) => {
    e.preventDefault();
    const pkg = packageName.trim();
    if (!pkg) return;
    if (!session.active) {
      onNotify('warning', 'No Active Session', 'Start a device session before clearing app data.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.clearAppData(pkg, session.deviceSerial ?? undefined);
      const updated = [pkg, ...recentPackages.filter((p) => p !== pkg)].slice(0, 5);
      setRecentPackages(updated);
      localStorage.setItem(RECENT_PACKAGES_KEY, JSON.stringify(updated));
      onNotify('success', 'App Data Cleared', `pm clear ${res.packageName} succeeded on ${res.serial}.`);
      onClose();
    } catch (err) {
      onNotify('error', 'Failed to Clear App Data', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-data-title"
    >
      <div className="studio-surface w-full max-w-md rounded-xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2">
            <Eraser className="h-4 w-4 text-zinc-300" />
            <h2 id="clear-data-title" className="text-sm font-semibold text-zinc-100">
              Clear Android App Data
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleClear(e)} className="p-5">
          <label className="mb-1.5 block text-xs font-medium text-zinc-300">
            Android Application Package Name
          </label>
          <input
            type="text"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="com.company.app.staging"
            className="studio-input font-mono"
            autoFocus
          />
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Executes <code className="font-mono text-zinc-300">adb shell pm clear &lt;packageName&gt;</code> to reset storage, auth tokens, and local cache.
          </p>

          {recentPackages.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Recent Packages
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {recentPackages.map((pkg) => (
                  <button
                    key={pkg}
                    type="button"
                    onClick={() => setPackageName(pkg)}
                    className="rounded border border-white/10 bg-[#151519] px-2 py-0.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
                  >
                    {pkg}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="studio-btn">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!packageName.trim() || busy || !session.active}
              className="studio-btn-danger"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
              Clear App Data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
