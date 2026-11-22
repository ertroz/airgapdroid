import { useState } from 'react';
import { Check, Copy, Download, FileArchive, X } from 'lucide-react';
import { api } from '../api/client';
import type { ExportedBugReport } from '../types';

interface BugReportModalProps {
  open: boolean;
  report: ExportedBugReport | null;
  onClose: () => void;
}

export function BugReportModal({ open, report, onClose }: BugReportModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open || !report) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-modal-title"
    >
      <div className="studio-surface flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-amber-400" />
            <div>
              <h2 id="bug-report-modal-title" className="text-sm font-semibold text-zinc-100">
                Bug & Test Report Ready (Jira / Linear / GitHub)
              </h2>
              <p className="font-mono text-[11px] text-zinc-400">{report.zipFileName}</p>
            </div>
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

        <div className="flex-1 overflow-y-auto p-5">
          <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-[#09090b] p-4 font-mono text-[11px] leading-relaxed text-zinc-200">
            {report.markdown}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#0e0e11] px-5 py-3">
          <span className="text-[11px] text-zinc-500">
            Includes Markdown summary, step JSON, screenshots, .mp4 video & Logcat errors.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void handleCopy()} className="studio-btn">
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied Markdown' : 'Copy Markdown'}
            </button>
            <a
              href={api.getBugReportDownloadUrl(report.reportId)}
              className="studio-btn-primary"
            >
              <Download className="h-3.5 w-3.5" />
              Download .zip
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
