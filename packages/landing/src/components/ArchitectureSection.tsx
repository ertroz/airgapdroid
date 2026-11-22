import { Network } from 'lucide-react';
import type { CopyDictionary } from '../data/copy';

interface ArchitectureSectionProps {
  t: CopyDictionary['architecture'];
}

export function ArchitectureSection({ t }: ArchitectureSectionProps) {
  return (
    <section id="architecture" className="border-t border-[#E5E7EB] bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D1D5DB] bg-[#F9FAFB] px-3 py-1 font-mono text-[11px] font-semibold text-[#111827]">
            <Network className="h-3.5 w-3.5 text-[#E54D2E]" />
            {t.eyebrow}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#111827] sm:text-3xl">
            {t.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#4B5563] sm:text-base">{t.subtitle}</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.ports.map((item) => {
            const isMetroOrMitm = item.port === ':8081' || item.port === ':8082';
            return (
              <div
                key={item.port}
                className={`rounded-xl border p-5 ${
                  isMetroOrMitm
                    ? 'border-[#1F7A3E]/35 bg-[#EBF9F0]/40'
                    : 'border-[#E5E7EB] bg-[#F9FAFB]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-[#111827] px-2.5 py-1 font-mono text-xs font-bold text-white">
                    localhost{item.port}
                  </span>
                  {isMetroOrMitm && (
                    <span className="rounded-full bg-[#EBF9F0] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#1F7A3E]">
                      Zero Conflict
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-bold text-[#111827]">{item.service}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#4B5563]">{item.role}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
