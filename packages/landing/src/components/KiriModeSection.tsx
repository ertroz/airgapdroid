import {
  ArrowRight,
  CheckCircle2,
  Container,
  Cpu,
  Layers,
  ShieldCheck,
  Smartphone,
  Zap,
} from 'lucide-react';
import type { CopyDictionary } from '../data/copy';

interface KiriModeSectionProps {
  t: CopyDictionary['kiri'];
}

export function KiriModeSection({ t }: KiriModeSectionProps) {
  return (
    <section id="kiri-mode" className="border-t border-[#E5E7EB] bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E54D2E]/25 bg-[#E54D2E]/5 px-3 py-1 font-mono text-[11px] font-semibold text-[#E54D2E]">
            <Container className="h-3.5 w-3.5" />
            {t.eyebrow}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#111827] sm:text-3xl">
            {t.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#4B5563] sm:text-base">{t.subtitle}</p>
        </div>

        {/* What is Kiri Mode + Benchmark Comparison */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-6 lg:col-span-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111827] text-white">
              <Zap className="h-5 w-5 text-[#E54D2E]" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#111827]">{t.whatIsTitle}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-[#4B5563]">{t.whatIsBody}</p>
            <div className="mt-5 flex flex-wrap gap-2 font-mono text-[11px]">
              <span className="rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1 text-[#111827]">
                Daemon: ~15 MB RAM
              </span>
              <span className="rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1 text-[#111827]">
                OS: Redroid 11–14
              </span>
              <span className="rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1 text-[#1F7A3E]">
                Root CA Ready
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 lg:col-span-7">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#111827]">{t.whyNotAvdTitle}</h3>
              <span className="font-mono text-[11px] text-[#6B7280]">Local Benchmark</span>
            </div>
            <div className="mt-4 space-y-3">
              {t.benchmarks.map((row) => (
                <div
                  key={row.engine}
                  className={`rounded-xl border p-4 transition-colors ${
                    row.highlight
                      ? 'border-[#1F7A3E]/40 bg-[#EBF9F0]/60'
                      : 'border-[#E5E7EB] bg-[#F9FAFB]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#111827]">{row.engine}</span>
                      {row.highlight && (
                        <span className="rounded-full bg-[#1F7A3E] px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
                          KIRI-FIRST
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span
                        className={`rounded px-2 py-0.5 font-semibold ${
                          row.highlight
                            ? 'bg-white text-[#1F7A3E]'
                            : 'bg-white text-[#374151]'
                        }`}
                      >
                        {row.ram}
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 text-[#6B7280]">
                        Boot: {row.boot}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#4B5563]">{row.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 6-Stage Start/Stop Automation Pipeline */}
        <div className="mt-12 rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-6 sm:p-8">
          <div className="max-w-2xl">
            <h3 className="text-lg font-bold text-[#111827] sm:text-xl">{t.pipelineTitle}</h3>
            <p className="mt-1.5 text-sm text-[#4B5563]">{t.pipelineSubtitle}</p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {t.pipelineSteps.map((step) => (
              <div
                key={step.step}
                className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-6 items-center rounded-md bg-[#111827] px-2 font-mono text-[11px] font-bold text-white">
                      STEP {step.step}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
                  </div>
                  <h4 className="mt-3 text-sm font-bold text-[#111827]">{step.title}</h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563]">{step.detail}</p>
                </div>
                {step.code && (
                  <div className="mt-3 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1.5 font-mono text-[10px] text-[#374151]">
                    {step.code}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Kiri Mode vs Direct ADB Comparison */}
        <div className="mt-12">
          <h3 className="text-lg font-bold text-[#111827] sm:text-xl">{t.comparisonTitle}</h3>
          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Kiri Mode Card */}
            <div className="rounded-2xl border-2 border-[#111827] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#111827] px-2.5 py-1 font-mono text-[10px] font-semibold text-white">
                  <Container className="h-3 w-3 text-[#E54D2E]" />
                  {t.kiriCard.badge}
                </span>
              </div>
              <h4 className="mt-4 text-lg font-bold text-[#111827]">{t.kiriCard.title}</h4>
              <p className="mt-1 text-xs text-[#6B7280]">{t.kiriCard.subtitle}</p>
              <ul className="mt-4 space-y-2.5">
                {t.kiriCard.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-xs text-[#374151]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-2.5 text-xs font-medium text-[#111827]">
                {t.kiriCard.bestFor}
              </div>
            </div>

            {/* Direct ADB Card */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-1 font-mono text-[10px] font-semibold text-[#374151]">
                  <Smartphone className="h-3 w-3 text-[#4B5563]" />
                  {t.directAdbCard.badge}
                </span>
              </div>
              <h4 className="mt-4 text-lg font-bold text-[#111827]">{t.directAdbCard.title}</h4>
              <p className="mt-1 text-xs text-[#6B7280]">{t.directAdbCard.subtitle}</p>
              <ul className="mt-4 space-y-2.5">
                {t.directAdbCard.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-xs text-[#374151]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-2.5 text-xs font-medium text-[#111827]">
                {t.directAdbCard.bestFor}
              </div>
            </div>
          </div>
        </div>

        {/* OS-Specific Kernel Integration Notes */}
        <div className="mt-10 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-6">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[#111827]" />
            <h3 className="text-sm font-bold text-[#111827]">{t.osNotesTitle}</h3>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {t.osNotes.map((item) => (
              <div key={item.os} className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#111827]">{item.os}</span>
                  <ShieldCheck className="h-3.5 w-3.5 text-[#1F7A3E]" />
                </div>
                <div className="mt-1 inline-flex items-center gap-1 rounded bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#374151]">
                  <Layers className="h-2.5 w-2.5" />
                  {item.mechanism}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#4B5563]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
