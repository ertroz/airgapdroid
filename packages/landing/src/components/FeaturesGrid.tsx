import { Bot, FileText, Flame, Globe, Smartphone, Terminal } from 'lucide-react';
import type { CopyDictionary } from '../data/copy';

interface FeaturesGridProps {
  t: CopyDictionary['workbench'];
}

const GROUP_ICONS = [Globe, Smartphone, Terminal];
const ITEM_ICONS = [
  [Globe, Bot, FileText],
  [Smartphone, Bot, FileText],
  [Flame, Smartphone, Terminal],
];

export function FeaturesGrid({ t }: FeaturesGridProps) {
  return (
    <section id="features" className="border-t border-[#E5E7EB] bg-[#F7F8FA] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full border border-[#D1D5DB] bg-white px-3 py-1 font-mono text-[11px] font-semibold text-[#111827]">
            {t.eyebrow}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#111827] sm:text-3xl">
            {t.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#4B5563] sm:text-base">{t.subtitle}</p>
        </div>

        <div className="mt-10 space-y-6">
          {t.groups.map((group, gIdx) => {
            const GroupIcon = GROUP_ICONS[gIdx] ?? Globe;
            return (
              <div
                key={group.area}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#F9FAFB]">
                      <GroupIcon className="h-4 w-4 text-[#111827]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#E54D2E]">
                          {group.area}
                        </span>
                        <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 font-mono text-[10px] font-medium text-[#4B5563]">
                          {group.badge}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#111827]">{group.title}</h3>
                    </div>
                  </div>
                  <p className="max-w-md text-xs text-[#6B7280]">{group.description}</p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {group.items.map((item, iIdx) => {
                    const ItemIcon = ITEM_ICONS[gIdx]?.[iIdx] ?? Globe;
                    const isPro = item.tag.toLowerCase().includes('pro');
                    return (
                      <div
                        key={item.name}
                        className="flex flex-col rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E7EB] bg-white">
                            <ItemIcon className="h-4 w-4 text-[#111827]" />
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                              isPro
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-[#EBF9F0] text-[#1F7A3E]'
                            }`}
                          >
                            {item.tag}
                          </span>
                        </div>
                        <h4 className="mt-3 text-sm font-bold text-[#111827]">{item.name}</h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563]">
                          {item.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
