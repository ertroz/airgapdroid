import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Monitor,
  Package,
  Terminal,
} from 'lucide-react';
import {
  PLATFORM_DOWNLOADS,
  SITE_CONFIG,
  type PlatformId,
} from '../config/site';
import type { CopyDictionary, Lang } from '../data/copy';

interface DownloadSectionProps {
  t: CopyDictionary['download'];
  lang: Lang;
  detectedOs: PlatformId;
}

const CLI_SNIPPET = `git clone ${SITE_CONFIG.githubUrl}.git
cd local-web-qa-studio
npm install
npm run runtime:install   # Install / start Kiri runtime
npm run certs:setup       # Generate mitmproxy CA (<hash>.0)
npm run infra:up          # Start ws-scrcpy (:8000) & mitmweb (:8082)
npm run dev               # Start Orchestrator (:4000) & Web UI (:3000)`;

function PlatformGlyph({ id }: { id: PlatformId }) {
  if (id === 'macos') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.33c.64-.78 1.08-1.86.96-2.94-.93.04-2.06.62-2.72 1.4-.58.68-1.1 1.79-.96 2.84 1.04.08 2.08-.52 2.72-1.3Z" />
      </svg>
    );
  }
  if (id === 'windows') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M3 5.45 10.94 4.3v7.15H3V5.45Zm8.86-1.29L21 2.8v8.65h-9.14V4.16ZM3 12.45h7.94v7.25L3 18.55v-6.1Zm8.86 0H21v8.75l-9.14-1.35v-7.4Z" />
      </svg>
    );
  }
  return <Terminal className="h-5 w-5" />;
}

export function DownloadSection({ t, lang, detectedOs }: DownloadSectionProps) {
  const [tab, setTab] = useState<'desktop' | 'cli'>('desktop');
  const [copied, setCopied] = useState(false);

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(CLI_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <section id="download" className="border-t border-[#E5E7EB] bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E54D2E]/25 bg-[#E54D2E]/5 px-3 py-1 font-mono text-[11px] font-semibold text-[#E54D2E]">
            <Package className="h-3.5 w-3.5" />
            {t.eyebrow}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#111827] sm:text-3xl">
            {t.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#4B5563] sm:text-base">{t.subtitle}</p>

          {/* Mode Toggle: Desktop App vs Developer CLI */}
          <div className="mt-7 inline-flex rounded-lg border border-[#E5E7EB] bg-[#F3F4F6] p-1">
            <button
              type="button"
              onClick={() => setTab('desktop')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === 'desktop'
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              {t.desktopTab}
            </button>
            <button
              type="button"
              onClick={() => setTab('cli')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === 'cli'
                  ? 'bg-white text-[#111827] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              {t.selfHostTab}
            </button>
          </div>
        </div>

        {tab === 'desktop' ? (
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {PLATFORM_DOWNLOADS.map((platform) => {
              const isDetected = platform.id === detectedOs;
              return (
                <div
                  key={platform.id}
                  className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-shadow ${
                    isDetected
                      ? 'border-2 border-[#E54D2E] bg-white shadow-[0_16px_40px_-18px_rgba(229,77,46,0.3)]'
                      : 'border-[#E5E7EB] bg-[#F9FAFB]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                            isDetected
                              ? 'bg-[#111827] text-white'
                              : 'border border-[#E5E7EB] bg-white text-[#111827]'
                          }`}
                        >
                          <PlatformGlyph id={platform.id} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-[#111827]">{platform.name}</h3>
                          <p className="font-mono text-[11px] text-[#6B7280]">
                            {platform.archBadge}
                          </p>
                        </div>
                      </div>

                      {isDetected && (
                        <span className="rounded-full bg-[#E54D2E] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                          {t.recommendedBadge}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-1.5 text-xs text-[#4B5563]">
                      <Monitor className="h-3.5 w-3.5 text-[#6B7280]" />
                      <span>{platform.minOs}</span>
                    </div>

                    <p className="mt-3 rounded-lg border border-[#E5E7EB] bg-white p-3 text-xs leading-relaxed text-[#4B5563]">
                      {platform.kiriSupportNote[lang]}
                    </p>

                    <div className="mt-4">
                      <div className="text-[11px] font-semibold text-[#374151]">
                        {t.bundledLabel}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {platform.bundledSidecars.map((sidecar) => (
                          <span
                            key={sidecar}
                            className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-white px-2 py-0.5 font-mono text-[10px] text-[#374151]"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5 text-[#1F7A3E]" />
                            {sidecar}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-2 border-t border-[#E5E7EB] pt-5">
                    <a
                      href={platform.primaryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={
                        isDetected ? 'studio-btn-accent w-full py-2.5' : 'studio-btn-primary w-full py-2.5'
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t.downloadBtn} {platform.primaryFormat}
                    </a>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-mono text-[#6B7280]">
                        {platform.primaryFileName}
                      </span>
                      <a
                        href={platform.secondaryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 font-medium text-[#111827] underline decoration-[#D1D5DB] underline-offset-2 hover:text-[#E54D2E]"
                      >
                        {platform.secondaryFormat}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#111827]">{t.selfHostTitle}</h3>
                <p className="mt-1 text-xs text-[#6B7280]">{t.selfHostSubtitle}</p>
              </div>
              <button type="button" onClick={handleCopyCli} className="studio-btn py-1.5">
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-[#1F7A3E]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copied!' : 'Copy Commands'}
              </button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-[#1F2937] bg-[#111827] p-4 font-mono text-xs leading-relaxed text-slate-100">
              {CLI_SNIPPET}
            </pre>
          </div>
        )}

        {/* Footer Release Bar */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-5 py-4 text-xs text-[#4B5563]">
          <span>{t.releaseNote}</span>
          <a
            href={SITE_CONFIG.releasesLatestUrl}
            target="_blank"
            rel="noreferrer"
            className="studio-btn"
          >
            {t.allReleasesBtn}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
