import { useMemo, useState } from 'react';
import { ArrowDownRight, Container, Download } from 'lucide-react';
import { ArchitectureSection } from './components/ArchitectureSection';
import { DownloadSection } from './components/DownloadSection';
import { FeaturesGrid } from './components/FeaturesGrid';
import { Footer } from './components/Footer';
import { KiriModeSection } from './components/KiriModeSection';
import { Navbar } from './components/Navbar';
import { PricingSection } from './components/PricingSection';
import { WorkbenchPreview } from './components/WorkbenchPreview';
import { detectVisitorPlatform } from './config/site';
import { COPY, type Lang } from './data/copy';

const OS_LABELS = {
  macos: 'macOS (.dmg)',
  windows: 'Windows (.exe)',
  linux: 'Linux (.AppImage)',
} as const;

export function App() {
  const [lang, setLang] = useState<Lang>('en');
  const detectedOs = useMemo(() => detectVisitorPlatform(), []);
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#111827]">
      <Navbar lang={lang} onLangChange={setLang} t={t.nav} />

      <main>
        {/* Hero + Interactive Workbench Preview */}
        <section className="studio-stage-grid relative overflow-hidden pb-16 pt-12 sm:pt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-1 text-[11px] font-medium text-[#374151] shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#1F7A3E]" />
                <span>{t.hero.eyebrow}</span>
              </div>

              <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-5xl sm:leading-[1.12]">
                {t.hero.titleLine1}{' '}
                <span className="text-[#E54D2E]">{t.hero.titleAccent}</span>
              </h1>

              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#4B5563] sm:text-base">
                {t.hero.subtitle}
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <a href="#download" className="studio-btn-accent px-5 py-3 text-xs sm:text-sm">
                  <Download className="h-4 w-4" />
                  {t.hero.primaryCta} {OS_LABELS[detectedOs]}
                </a>
                <a href="#kiri-mode" className="studio-btn px-5 py-3 text-xs sm:text-sm">
                  <Container className="h-4 w-4 text-[#111827]" />
                  {t.hero.secondaryCta}
                  <ArrowDownRight className="h-3.5 w-3.5 text-[#6B7280]" />
                </a>
              </div>

              {/* Key Metrics Strip */}
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {t.hero.metrics.map((metric) => (
                  <div
                    key={metric.value}
                    className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
                  >
                    <div className="font-mono text-sm font-bold text-[#111827] sm:text-base">
                      {metric.value}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-[#6B7280]">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Workbench Showcase (mirrors the live screenshot) */}
            <WorkbenchPreview t={t.hero} lang={lang} />
          </div>
        </section>

        {/* Deep-Dive: Kiri Mode vs Direct ADB */}
        <KiriModeSection t={t.kiri} />

        {/* Complete Workbench Feature Breakdown */}
        <FeaturesGrid t={t.workbench} />

        {/* Zero-Conflict Port Architecture */}
        <ArchitectureSection t={t.architecture} />

        {/* Free vs Pro */}
        <PricingSection t={t.pricing} />

        {/* Platform Download Center */}
        <DownloadSection t={t.download} lang={lang} detectedOs={detectedOs} />
      </main>

      <Footer t={t.footer} nav={t.nav} />
    </div>
  );
}
export default App;
