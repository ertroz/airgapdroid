import { useRef, useState } from 'react';
import { CheckCircle2, FileArchive, Loader2, Upload, X } from 'lucide-react';
import { api } from '../api/client';
import type { ActiveSession } from '../types';

interface UploadApkModalProps {
  open: boolean;
  session: ActiveSession;
  onClose: () => void;
  onNotify: (tone: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

export function UploadApkModal({ open, session, onClose, onNotify }: UploadApkModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleSelectFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk')) {
      onNotify('error', 'Invalid File', 'Only Android .apk files are supported.');
      return;
    }
    setSelectedFile(file);
    setInstallResult(null);
  };

  const handleInstall = async () => {
    if (!selectedFile) return;
    if (!session.active) {
      onNotify('warning', 'No Active Session', 'Start a Docker or Direct ADB session first.');
      return;
    }

    setInstalling(true);
    setInstallResult(null);
    try {
      const res = await api.installApkFile(selectedFile, session.deviceSerial ?? undefined);
      setInstallResult(
        `Installed ${res.fileName} onto ${res.serial} in ${(res.durationMs / 1000).toFixed(1)}s.`
      );
      onNotify('success', 'APK Installed', `${res.fileName} installed on ${res.serial}.`);
    } catch (err) {
      onNotify('error', 'APK Installation Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-apk-title"
    >
      <div className="studio-surface w-full max-w-md rounded-xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-zinc-300" />
            <h2 id="upload-apk-title" className="text-sm font-semibold text-zinc-100">
              Upload & Install Local APK
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

        <div className="p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleSelectFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
              dragActive
                ? 'border-zinc-300 bg-white/[0.05]'
                : 'border-white/15 bg-[#0d0d10] hover:border-white/30'
            }`}
          >
            <FileArchive className="h-7 w-7 text-zinc-400" />
            <p className="mt-3 text-xs font-medium text-zinc-200">
              {selectedFile ? selectedFile.name : 'Drag & drop an .apk file here'}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {selectedFile
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to install via adb install -r -d`
                : 'or click to browse from your workstation (up to 500 MB)'}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".apk"
              className="hidden"
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />
          </div>

          {!session.active && (
            <p className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              No active device session. Start Docker Mode or Direct ADB Mode before installing.
            </p>
          )}

          {installResult && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{installResult}</span>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="studio-btn">
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={!selectedFile || installing || !session.active}
              className="studio-btn-primary"
            >
              {installing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {installing ? 'Installing APK...' : 'Install to Device'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
