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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-modal-title"
    >
      <div className="studio-surface flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FileArchive className="h-4 w-4 text-[#4B5563]" />
            <div>
              <h2 id="bug-report-modal-title" className="text-sm font-semibold text-[#111827]">
                Bug & Test Report Ready (Jira / Linear / GitHub)
              </h2>
              <p className="font-mono text-[11px] text-[#6B7280]">{report.zipFileName}</p>
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

        <div className="flex-1 overflow-y-auto bg-[#F9FAFB] p-5">
          <pre className="whitespace-pre-wrap rounded-lg border border-[#E5E7EB] bg-white p-4 font-mono text-[11px] leading-relaxed text-[#111827]">
            {report.markdown}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] bg-white px-5 py-3">
          <span className="text-[11px] text-[#6B7280]">
            Includes Markdown summary, step JSON, screenshots, .mp4 video & Logcat errors.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void handleCopy()} className="studio-btn">
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#1F7A3E]" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[#4B5563]" />
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
