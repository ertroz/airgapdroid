import { CheckCircle2, Crown, Download, ExternalLink } from 'lucide-react';
import { SITE_CONFIG } from '../config/site';
import type { CopyDictionary } from '../data/copy';

interface PricingSectionProps {
  t: CopyDictionary['pricing'];
}

export function PricingSection({ t }: PricingSectionProps) {
  return (
    <section id="pricing" className="border-t border-[#E5E7EB] bg-[#F7F8FA] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-[#D1D5DB] bg-white px-3 py-1 font-mono text-[11px] font-semibold text-[#111827]">
            {t.eyebrow}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#111827] sm:text-3xl">
            {t.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#4B5563] sm:text-base">{t.subtitle}</p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          {/* Free Tier */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#111827]">{t.free.name}</h3>
                <span className="rounded-full bg-[#EBF9F0] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#1F7A3E]">
                  LOCAL FREE
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-[#111827]">{t.free.price}</span>
                <span className="text-xs text-[#6B7280]">{t.free.period}</span>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-[#4B5563]">{t.free.description}</p>

              <ul className="mt-6 space-y-2.5 border-t border-[#E5E7EB] pt-5">
                {t.free.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-xs text-[#374151]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a href="#download" className="studio-btn mt-7 w-full py-2.5">
              <Download className="h-3.5 w-3.5" />
              {t.free.cta}
            </a>
          </div>

          {/* Pro Tier */}
          <div className="flex flex-col justify-between rounded-2xl border-2 border-[#111827] bg-white p-7 shadow-md">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-600" />
                  <h3 className="text-lg font-bold text-[#111827]">{t.pro.name}</h3>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                  {t.pro.badge}
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-[#111827]">{t.pro.price}</span>
                <span className="text-xs text-[#6B7280]">{t.pro.period}</span>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-[#4B5563]">{t.pro.description}</p>

              <ul className="mt-6 space-y-2.5 border-t border-[#E5E7EB] pt-5">
                {t.pro.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-xs text-[#374151]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E54D2E]" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-7">
              <a
                href={SITE_CONFIG.gumroadUrl}
                target="_blank"
                rel="noreferrer"
                className="studio-btn-accent w-full py-2.5"
              >
                <Crown className="h-3.5 w-3.5" />
                {t.pro.cta}
                <ExternalLink className="h-3 w-3 opacity-80" />
              </a>
              <p className="mt-2.5 text-center text-[11px] text-[#6B7280]">{t.pro.licenseNote}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
