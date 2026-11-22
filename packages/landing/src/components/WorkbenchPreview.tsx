import { useState } from 'react';
import {
  Activity,
  Bot,
  Camera,
  CheckCircle2,
  CircleDot,
  Container,
  Copy,
  Crown,
  Eraser,
  ExternalLink,
  FileArchive,
  FileText,
  Filter,
  Flame,
  Globe,
  Info,
  Play,
  RefreshCw,
  Search,
  Smartphone,
  Square,
  Terminal,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { CopyDictionary, HotspotItem, Lang } from '../data/copy';

interface WorkbenchPreviewProps {
  t: CopyDictionary['hero'];
  lang: Lang;
}

const SAMPLE_FLOWS = [
  {
    id: 1,
    method: 'POST',
    host: 'https://api.example.com',
    path: '/v2/auth/login',
    type: 'application/json',
    status: 200,
    size: '1.8 KB',
    time: '84 ms',
  },
  {
    id: 2,
    method: 'GET',
    host: 'https://api.example.com',
    path: '/v2/user/profile?include=roles',
    type: 'application/json',
    status: 200,
    size: '4.2 KB',
    time: '46 ms',
  },
  {
    id: 3,
    method: 'POST',
    host: 'https://api.example.com',
    path: '/v2/checkout/confirm',
    type: 'application/json',
    status: 422,
    size: '612 B',
    time: '112 ms',
  },
];

export function WorkbenchPreview({ t, lang }: WorkbenchPreviewProps) {
  const [previewMode, setPreviewMode] = useState<'kiri' | 'adb'>('kiri');
  const [androidVer, setAndroidVer] = useState<'14' | '13' | '12' | '11'>('14');
  const [leftTab, setLeftTab] = useState<'automation' | 'network' | 'reports'>('network');
  const [filterId, setFilterId] = useState<'all' | 'xhr' | 'json' | 'mutations' | 'errors'>('all');
  const [showHotspots, setShowHotspots] = useState(true);
  const [activeHotspotId, setActiveHotspotId] = useState<string>('kiri-mode');

  const activeHotspot: HotspotItem =
    t.hotspots.find((h) => h.id === activeHotspotId) ?? t.hotspots[0];

  const filteredRequests = SAMPLE_FLOWS.filter((item) => {
    if (filterId === 'mutations') return item.method === 'POST';
    if (filterId === 'errors') return item.status >= 400;
    return true;
  });

  const targetSerial = previewMode === 'kiri' ? '127.0.0.1:5555' : 'R5CR90X82LP (USB)';

  return (
    <div className="mt-10">
      {/* Preview control bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[#6B7280]">
          <Info className="h-3.5 w-3.5 text-[#E54D2E]" />
          <span>{t.previewHint}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowHotspots((v) => !v)}
          className={`studio-btn py-1 text-[11px] ${
            showHotspots ? 'border-[#E54D2E]/50 bg-[#E54D2E]/5 text-[#E54D2E]' : ''
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-[#E54D2E]" />
          {showHotspots ? t.inspectHotspotsOn : t.inspectHotspotsOff}
        </button>
      </div>

      {/* Main Window Shell matching App Live Workbench */}
      <div className="relative overflow-hidden rounded-2xl border border-[#D1D5DB] bg-[#F7F8FA] shadow-[0_24px_64px_-20px_rgba(17,24,39,0.2)]">
        {/* 1. Top Toolbar */}
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-white px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-1">
              <BrandLogo className="h-6 w-6" />
              <div className="flex items-center gap-1 text-[11px]">
                <span className="font-semibold text-[#111827]">AirgapDroid</span>
                <span className="text-[#9CA3AF]">/</span>
                <span className="hidden font-medium text-[#6B7280] sm:inline">App Live Workbench</span>
              </div>
            </div>

            <div className="hidden h-4 w-px bg-[#E5E7EB] sm:block" />

            {/* Kiri Mode vs Direct ADB Switcher */}
            <div className="relative inline-flex rounded-md border border-[#E5E7EB] bg-[#F3F4F6] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setPreviewMode('kiri');
                  setActiveHotspotId('kiri-mode');
                }}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  previewMode === 'kiri'
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                <Container className="h-3 w-3" />
                Kiri Mode
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewMode('adb');
                  setActiveHotspotId('kiri-mode');
                }}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  previewMode === 'adb'
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                <Smartphone className="h-3 w-3" />
                Direct ADB
              </button>

              {showHotspots && (
                <button
                  type="button"
                  onClick={() => setActiveHotspotId('kiri-mode')}
                  className={`absolute -right-2 -top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
                    activeHotspotId === 'kiri-mode' ? 'bg-[#E54D2E] scale-110' : 'bg-[#111827]'
                  }`}
                  title="Hotspot 1: Kiri Mode vs Direct ADB"
                >
                  1
                </button>
              )}
            </div>

            {previewMode === 'kiri' ? (
              <select
                aria-label="Preview Android Version"
                value={androidVer}
                onChange={(e) => setAndroidVer(e.target.value as '14' | '13' | '12' | '11')}
                className="rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-[11px] font-medium text-[#111827]"
              >
                <option value="14">Android 14</option>
                <option value="13">Android 13 (Pro)</option>
                <option value="12">Android 12 (Pro)</option>
                <option value="11">Android 11 (Pro)</option>
              </select>
            ) : (
              <span className="rounded-md border border-[#D1D5DB] bg-white px-2 py-1 font-mono text-[10px] text-[#374151]">
                R5CR90X82LP · Pixel 7 (device)
              </span>
            )}

            <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
              <Square className="h-2.5 w-2.5 fill-current" />
              Stop
            </span>
          </div>

          {/* Right Toolbar */}
          <div className="relative hidden flex-wrap items-center gap-1 lg:flex">
            {[
              { icon: Flame, label: 'Firebase Builds' },
              { icon: Bot, label: 'Auto Test & Report' },
              { icon: Upload, label: 'Upload APK' },
              { icon: Eraser, label: 'Clear App Data' },
            ].map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1 rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-[11px] font-medium text-[#374151]"
              >
                <item.icon className="h-3 w-3 text-[#6B7280]" />
                {item.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
              <Crown className="h-3 w-3 text-amber-600" />
              Pro
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-[11px] font-medium text-[#374151]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1F7A3E]" />
              <Activity className="h-3 w-3 text-[#6B7280]" />
              System
            </span>

            {showHotspots && (
              <button
                type="button"
                onClick={() => setActiveHotspotId('toolbar-tools')}
                className={`absolute -left-2 -top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
                  activeHotspotId === 'toolbar-tools' ? 'bg-[#E54D2E] scale-110' : 'bg-[#111827]'
                }`}
                title="Hotspot 2: Developer Utilities"
              >
                2
              </button>
            )}
          </div>
        </div>

        {/* 2. Status Strip */}
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F7F8FA] px-3.5 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1F7A3E] px-2 py-0.5 text-[10px] font-semibold text-white">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </span>
            <span className="font-semibold text-[#111827]">
              {previewMode === 'kiri' ? `Android ${androidVer}` : 'Pixel 7 (Physical)'}
            </span>
            <span className="text-[#9CA3AF]">·</span>
            <span className="text-[#6B7280]">
              {previewMode === 'kiri' ? 'Kiri (Redroid)' : 'Direct ADB USB'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[#374151]">
            <span className="rounded border border-[#E5E7EB] bg-white px-2 py-0.5">
              Viewport: <strong>1080×1920</strong>
            </span>
            <span className="rounded border border-[#E5E7EB] bg-white px-2 py-0.5">
              Metro :8081 <strong className="text-[#1F7A3E]">Reversed</strong>
            </span>
            <span className="hidden rounded border border-[#E5E7EB] bg-white px-2 py-0.5 sm:inline-block">
              Proxy <strong>198.19.248.254:8080</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-white px-2 py-0.5 font-semibold text-[#1F7A3E]">
              <CheckCircle2 className="h-3 w-3" />
              HTTPS CA Injected
            </span>
          </div>

          {showHotspots && (
            <button
              type="button"
              onClick={() => setActiveHotspotId('status-strip')}
              className={`absolute right-3 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
                activeHotspotId === 'status-strip' ? 'bg-[#E54D2E] scale-110' : 'bg-[#111827]'
              }`}
              title="Hotspot 3: Auto-Configured Session Strip"
            >
              3
            </button>
          )}
        </div>

        {/* 3. Main Split Workspace */}
        <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-12">
          {/* Left Panel (58% -> 7 cols) */}
          <div className="relative flex flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white lg:col-span-7">
            {/* Tab Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-3.5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setLeftTab('automation')}
                  className={`relative inline-flex items-center gap-1.5 py-2.5 text-[11px] font-medium ${
                    leftTab === 'automation' ? 'font-semibold text-[#111827]' : 'text-[#6B7280]'
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" />
                  Automation Studio
                  {leftTab === 'automation' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#E54D2E]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('network')}
                  className={`relative inline-flex items-center gap-1.5 py-2.5 text-[11px] font-medium ${
                    leftTab === 'network' ? 'font-semibold text-[#111827]' : 'text-[#6B7280]'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Network Inspector
                  {leftTab === 'network' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#E54D2E]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('reports')}
                  className={`relative inline-flex items-center gap-1.5 py-2.5 text-[11px] font-medium ${
                    leftTab === 'reports' ? 'font-semibold text-[#111827]' : 'text-[#6B7280]'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Test Reports
                  <span className="rounded-full bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[9px] text-[#4B5563]">
                    2
                  </span>
                  {leftTab === 'reports' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#E54D2E]" />
                  )}
                </button>
              </div>

              {leftTab === 'network' && (
                <div className="hidden items-center gap-1 sm:flex">
                  <span className="inline-flex items-center gap-1 rounded border border-[#D1D5DB] bg-white px-2 py-0.5 text-[10px] font-medium text-[#111827]">
                    <Play className="h-2.5 w-2.5 text-[#1F7A3E]" />
                    Start mitmweb
                  </span>
                  <RefreshCw className="h-3 w-3 text-[#6B7280]" />
                  <ExternalLink className="h-3 w-3 text-[#6B7280]" />
                </div>
              )}
            </div>

            {/* Tab Content */}
            {leftTab === 'network' && (
              <div className="flex flex-1 flex-col">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6B7280]">
                      <Filter className="h-2.5 w-2.5" /> Filter:
                    </span>
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'xhr', label: 'XHR / API' },
                      { id: 'json', label: 'JSON' },
                      { id: 'mutations', label: 'POST / PUT' },
                      { id: 'errors', label: 'Errors' },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setFilterId(preset.id as 'all' | 'xhr' | 'json' | 'mutations' | 'errors')
                        }
                        className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          filterId === preset.id
                            ? preset.id === 'errors'
                              ? 'border-rose-600 bg-rose-600 text-white'
                              : 'border-[#111827] bg-[#111827] text-white'
                            : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:text-[#111827]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <span className="rounded border border-[#D1D5DB] bg-white px-2 py-0.5 font-mono text-[10px] text-[#9CA3AF]">
                    Domain (e.g. api.example.com)
                  </span>
                </div>

                {/* mitmweb inner chrome */}
                <div className="border-b border-[#E5E7EB] bg-white px-3 pt-1.5 text-[10px]">
                  <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-1">
                    <span className="rounded-t bg-[#2B6CB0] px-2 py-0.5 font-semibold text-white">
                      File
                    </span>
                    <span className="text-[#4B5563]">Capture</span>
                    <span className="font-semibold text-[#111827]">Flow List</span>
                    <span className="text-[#4B5563]">Options</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 py-1.5">
                    <div className="flex items-center gap-1.5 rounded border border-[#D1D5DB] px-2 py-1 text-[#9CA3AF]">
                      <Search className="h-3 w-3" /> Search
                    </div>
                    <div className="flex items-center gap-1.5 rounded border border-[#D1D5DB] px-2 py-1 text-[#9CA3AF]">
                      <span className="font-mono text-[#6B7280]">||</span> Intercept
                    </div>
                  </div>
                </div>

                {/* Sample HTTP Flows */}
                <div className="flex-1 divide-y divide-[#F3F4F6] text-left font-mono text-[11px]">
                  {filteredRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-[#F9FAFB]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            req.method === 'POST'
                              ? 'bg-sky-50 text-sky-700'
                              : 'bg-[#F3F4F6] text-[#374151]'
                          }`}
                        >
                          {req.method}
                        </span>
                        <span className="truncate text-[#111827]">
                          {req.host}
                          <span className="text-[#6B7280]">{req.path}</span>
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-[10px]">
                        <span
                          className={`font-semibold ${
                            req.status >= 400 ? 'text-rose-600' : 'text-[#1F7A3E]'
                          }`}
                        >
                          {req.status}
                        </span>
                        <span className="hidden text-[#6B7280] sm:inline">{req.size}</span>
                        <span className="text-[#6B7280]">{req.time}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1 font-mono text-[9px]">
                  <span className="text-[#6B7280]">TLS Decrypted via System CA</span>
                  <div className="flex items-center gap-1">
                    <span className="rounded bg-sky-500 px-1.5 py-0.5 font-semibold text-white">
                      0.0.0.0:8080
                    </span>
                    <span className="rounded bg-[#374151] px-1.5 py-0.5 font-semibold text-white">
                      mitmproxy 12.3.1
                    </span>
                  </div>
                </div>
              </div>
            )}

            {leftTab === 'automation' && (
              <div className="flex flex-1 flex-col justify-between p-4 text-left">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#111827]">
                      Visual No-Code Recorder & Maestro YAML
                    </span>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-800">
                      PRO STUDIO
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[
                      '1. tapOn: resource-id "btn_login_submit"',
                      '2. inputText: "qa.tester@airgapdroid.dev"',
                      '3. assertVisible: "Dashboard Active"',
                    ].map((step) => (
                      <div
                        key={step}
                        className="flex items-center justify-between rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 font-mono text-[11px] text-[#111827]"
                      >
                        <span>{step}</span>
                        <span className="text-[10px] font-semibold text-[#1F7A3E]">Smart Selector</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-[11px] text-[#6B7280]">
                  <span>1-Click Export → Maestro YAML</span>
                  <span className="rounded bg-[#111827] px-2.5 py-1 font-semibold text-white">
                    Run Flow
                  </span>
                </div>
              </div>
            )}

            {leftTab === 'reports' && (
              <div className="flex flex-1 flex-col gap-2 p-4 text-left">
                {[
                  { name: 'Checkout Auth Flow', status: 'PASS', steps: '6/6 steps', time: '4.12s' },
                  { name: 'Payment 3DS Verification', status: 'FAIL', steps: '3/4 steps', time: '6.85s' },
                ].map((rep) => (
                  <div
                    key={rep.name}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs ${
                      rep.status === 'PASS'
                        ? 'border-[#1F7A3E]/25 bg-[#EBF9F0]/50'
                        : 'border-rose-200 bg-rose-50/70'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-[#111827]">{rep.name}</div>
                      <div className="font-mono text-[10px] text-[#6B7280]">
                        {rep.steps} · {rep.time}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                        rep.status === 'PASS'
                          ? 'bg-[#EBF9F0] text-[#1F7A3E]'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {rep.status}
                    </span>
                  </div>
                ))}
                <div className="mt-auto flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-[11px] text-[#6B7280]">
                  <span>Includes Markdown + Screenshots + .mp4 + Logcat</span>
                  <span className="rounded bg-[#111827] px-2.5 py-1 font-semibold text-white">
                    Export .zip & Markdown
                  </span>
                </div>
              </div>
            )}

            {showHotspots && (
              <button
                type="button"
                onClick={() => setActiveHotspotId('left-workbench')}
                className={`absolute left-3 top-12 z-20 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
                  activeHotspotId === 'left-workbench' ? 'bg-[#E54D2E] scale-110' : 'bg-[#111827]'
                }`}
                title="Hotspot 4: Left Workbench Panel"
              >
                4
              </button>
            )}
          </div>

          {/* Right Panel (42% -> 5 cols) */}
          <div className="relative flex flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white lg:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-[#4B5563]" />
                <span className="text-[11px] font-semibold text-[#111827]">Android Screen</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EBF9F0] px-2 py-0.5 font-mono text-[9px] font-semibold text-[#1F7A3E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1F7A3E]" />
                  {targetSerial}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-medium">
                <span className="inline-flex items-center gap-1 rounded border border-[#D1D5DB] bg-white px-1.5 py-0.5 text-[#111827]">
                  <CircleDot className="h-2.5 w-2.5 text-rose-600" /> Record Flow
                </span>
                <span className="hidden items-center gap-1 rounded border border-[#D1D5DB] bg-white px-1.5 py-0.5 text-[#111827] sm:inline-flex">
                  <Video className="h-2.5 w-2.5 text-[#4B5563]" /> .mp4
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-[#D1D5DB] bg-white px-1.5 py-0.5 text-[#111827]">
                  <FileArchive className="h-2.5 w-2.5 text-[#4B5563]" /> Bug Report
                </span>
              </div>
            </div>

            <div className="studio-stage-grid flex flex-1 flex-col items-center justify-center p-4">
              {/* Realistic Phone Mockup */}
              <div className="w-[186px] rounded-[24px] border-[3px] border-[#1F2937] bg-[#111827] p-2 shadow-xl">
                <div className="mb-1.5 flex items-center justify-center gap-1.5">
                  <div className="h-1 w-8 rounded-full bg-slate-700" />
                  <div className="h-1 w-1 rounded-full bg-slate-700" />
                </div>
                <div className="relative h-[228px] overflow-hidden rounded-[14px] border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 p-2.5 text-white">
                  <div className="flex items-center justify-between text-[8px] text-slate-300">
                    <span>4:58</span>
                    <div className="flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[7px]">
                      <span>◀</span>
                      <span>●</span>
                      <span>■</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-medium text-slate-600 shadow">
                    <Search className="h-2.5 w-2.5 text-sky-600" />
                    <span>Google</span>
                  </div>
                  <div className="mt-20 grid grid-cols-3 gap-2 text-center text-[7px] text-slate-300">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
                        <Camera className="h-3.5 w-3.5" />
                      </div>
                      <span>Gallery</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                        <Smartphone className="h-3.5 w-3.5" />
                      </div>
                      <span>QA App</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                        <Globe className="h-3.5 w-3.5" />
                      </div>
                      <span>Browser</span>
                    </div>
                  </div>
                  <div className="absolute bottom-1.5 left-0 right-0 flex justify-around text-[8px] text-slate-400">
                    <span>◀</span>
                    <span>●</span>
                    <span>■</span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between px-2 font-mono text-[8px] text-slate-400">
                  <span>{previewMode === 'kiri' ? `Redroid · Android ${androidVer}` : 'Direct ADB'}</span>
                  <span>1080×1920</span>
                </div>
              </div>

              <div className="mt-2.5 flex w-full max-w-[230px] items-center justify-between rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1 font-mono text-[9px] text-[#374151] shadow-sm">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1F7A3E]" />
                  <strong>LIVE</strong> | {targetSerial}
                </span>
                <RefreshCw className="h-2.5 w-2.5 text-[#6B7280]" />
              </div>
            </div>

            {showHotspots && (
              <button
                type="button"
                onClick={() => setActiveHotspotId('right-device')}
                className={`absolute right-3 top-12 z-20 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
                  activeHotspotId === 'right-device' ? 'bg-[#E54D2E] scale-110' : 'bg-[#111827]'
                }`}
                title="Hotspot 5: Live Android Screen Stage"
              >
                5
              </button>
            )}
          </div>
        </div>

        {/* 4. Bottom Panel: Live Error Logcat */}
        <div className="relative mx-3 mb-3 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5 text-[10px]">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[#4B5563]" />
              <span className="font-semibold text-[#111827]">Live Error Logcat</span>
              <span className="rounded bg-rose-50 px-1.5 py-0.5 font-mono font-semibold text-rose-700">
                *:E
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[#1F7A3E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1F7A3E]" />
                Streaming
              </span>
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
              <span className="rounded border border-[#D1D5DB] bg-white px-2 py-0.5 text-[#9CA3AF]">
                Filter tag or stack trace...
              </span>
              <span className="rounded bg-[#111827] px-2 py-0.5 font-medium text-white">
                Auto-scroll
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-[#D1D5DB] bg-white px-2 py-0.5 text-[#374151]">
                <Trash2 className="h-2.5 w-2.5" /> Clear
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-[#D1D5DB] bg-white px-2 py-0.5 text-[#374151]">
                <Copy className="h-2.5 w-2.5" /> Copy Stack Trace
              </span>
            </div>
          </div>
          <div className="space-y-1 px-3 py-2 text-left font-mono text-[10px]">
            <div className="flex items-center gap-2 text-rose-700">
              <span className="text-[#9CA3AF]">11-22 16:53:33.871</span>
              <span className="rounded bg-rose-100 px-1 font-bold text-rose-700">E</span>
              <span className="font-semibold text-[#111827]">lowmemorykiller:</span>
              <span>epoll_wait failed (errno=22)</span>
            </div>
            <div className="flex items-center gap-2 text-rose-700">
              <span className="text-[#9CA3AF]">11-22 16:53:34.104</span>
              <span className="rounded bg-rose-100 px-1 font-bold text-rose-700">E</span>
              <span className="font-semibold text-[#111827]">ReactNativeJS:</span>
              <span>TypeError: Cannot read property &apos;token&apos; of undefined</span>
            </div>
          </div>

          {showHotspots && (
            <button
              type="button"
              onClick={() => setActiveHotspotId('bottom-logcat')}
              className={`absolute bottom-2 right-3 z-20 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white transition-transform hover:scale-110 ${
                activeHotspotId === 'bottom-logcat' ? 'bg-[#E54D2E] scale-110' : 'bg-[#111827]'
              }`}
              title="Hotspot 6: Live Error Logcat"
            >
              6
            </button>
          )}
        </div>
      </div>

      {/* Interactive Hotspot Inspector Card */}
      {showHotspots && (
        <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E5E7EB] pb-3">
            {t.hotspots.map((spot) => (
              <button
                key={spot.id}
                type="button"
                onClick={() => setActiveHotspotId(spot.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  activeHotspotId === spot.id
                    ? 'border-[#E54D2E] bg-[#E54D2E] text-white'
                    : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563] hover:border-[#D1D5DB] hover:text-[#111827]'
                }`}
              >
                <span className="font-mono font-bold">{spot.number}</span>
                <span>{spot.title.split(':')[0]}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E54D2E] font-mono text-[10px] font-bold text-white">
                  {activeHotspot.number}
                </span>
                <h3 className="text-sm font-bold text-[#111827]">{activeHotspot.title}</h3>
                <span className="rounded bg-[#EBF9F0] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#1F7A3E]">
                  {activeHotspot.badge}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563]">
                {activeHotspot.description}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-[#9CA3AF]">
              {lang === 'id' ? 'Klik nomor 1–6 pada mockup' : 'Click pins 1–6 on mockup'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
