import { ExternalLink } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { SITE_CONFIG } from '../config/site';
import type { CopyDictionary } from '../data/copy';

interface FooterProps {
  t: CopyDictionary['footer'];
  nav: CopyDictionary['nav'];
}

export function Footer({ t, nav }: FooterProps) {
  return (
    <footer className="border-t border-[#E5E7EB] bg-[#F7F8FA] py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <BrandLogo className="h-7 w-7" />
              <span className="text-sm font-bold text-[#111827]">AirgapDroid</span>
              <span className="rounded-full border border-[#E5E7EB] bg-white px-2 py-0.5 font-mono text-[10px] text-[#6B7280]">
                {SITE_CONFIG.releaseTag}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#4B5563]">{t.summary}</p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-[#4B5563]">
            <a href="#kiri-mode" className="hover:text-[#111827]">
              {nav.kiriMode}
            </a>
            <a href="#features" className="hover:text-[#111827]">
              {nav.features}
            </a>
            <a href="#architecture" className="hover:text-[#111827]">
              {nav.workbench}
            </a>
            <a href="#pricing" className="hover:text-[#111827]">
              {nav.pricing}
            </a>
            <a href="#download" className="hover:text-[#111827]">
              {nav.download}
            </a>
            <a
              href={SITE_CONFIG.kiriUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-[#111827]"
            >
              Kiri Runtime <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-col justify-between gap-2 border-t border-[#E5E7EB] pt-6 text-[11px] text-[#6B7280] sm:flex-row sm:items-center">
          <span>{t.builtFor}</span>
          <span>© {new Date().getFullYear()} AirgapDroid · 100% Localhost QA Studio</span>
        </div>
      </div>
    </footer>
  );
}
