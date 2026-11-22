import { Download, Globe } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { CopyDictionary, Lang } from '../data/copy';

interface NavbarProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  t: CopyDictionary['nav'];
}

export function Navbar({ lang, onLangChange, t }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="#" className="flex items-center gap-2.5">
          <BrandLogo className="h-7 w-7 shrink-0" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold tracking-tight text-[#111827]">AirgapDroid</span>
            <span className="hidden text-[#9CA3AF] sm:inline">/</span>
            <span className="hidden font-medium text-[#6B7280] sm:inline">App Live Workbench</span>
          </div>
        </a>

        <nav className="hidden items-center gap-6 text-xs font-medium text-[#4B5563] md:flex">
          <a href="#kiri-mode" className="transition-colors hover:text-[#111827]">
            {t.kiriMode}
          </a>
          <a href="#features" className="transition-colors hover:text-[#111827]">
            {t.features}
          </a>
          <a href="#architecture" className="transition-colors hover:text-[#111827]">
            {t.workbench}
          </a>
          <a href="#pricing" className="transition-colors hover:text-[#111827]">
            {t.pricing}
          </a>
          <a href="#download" className="transition-colors hover:text-[#111827]">
            {t.download}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center rounded-md border border-[#E5E7EB] bg-[#F3F4F6] p-0.5"
            role="group"
            aria-label="Language switch"
          >
            <Globe className="ml-1.5 mr-1 h-3 w-3 text-[#6B7280]" />
            <button
              type="button"
              onClick={() => onLangChange('en')}
              className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                lang === 'en'
                  ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onLangChange('id')}
              className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                lang === 'id'
                  ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              ID
            </button>
          </div>

          <a href="#download" className="studio-btn-accent px-3 py-1.5">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.cta}</span>
            <span className="sm:hidden">{t.download}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
