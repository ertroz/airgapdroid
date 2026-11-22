import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import { getLogcatWsUrl } from '../api/client';
import type { LogcatEntry } from '../types';

interface LogcatPanelProps {
  sessionActive: boolean;
  onNotify: (tone: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

export function LogcatPanel({ sessionActive, onNotify }: LogcatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [wsState, setWsState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [streamAttached, setStreamAttached] = useState(false);
  const [entries, setEntries] = useState<LogcatEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      setWsState('connecting');
      const ws = new WebSocket(getLogcatWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setWsState('open');
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type: string;
            connected?: boolean;
            entry?: LogcatEntry;
            entries?: LogcatEntry[];
          };

          if (payload.type === 'status') {
            setStreamAttached(Boolean(payload.connected));
          } else if (payload.type === 'history' && Array.isArray(payload.entries)) {
            setEntries(payload.entries);
          } else if (payload.type === 'log' && payload.entry) {
            setEntries((prev) => {
              const next = [...prev, payload.entry!];
              return next.length > 500 ? next.slice(next.length - 500) : next;
            });
          } else if (payload.type === 'cleared') {
            setEntries([]);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setWsState('closed');
        setStreamAttached(false);
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (item) =>
        item.tag.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q) ||
        item.raw.toLowerCase().includes(q)
    );
  }, [entries, filter]);

  useEffect(() => {
    if (!autoScroll || collapsed || !scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [filteredEntries, autoScroll, collapsed]);

  const handleClear = () => {
    setEntries([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear' }));
    }
  };

  const handleCopyStackTrace = async () => {
    const text = filteredEntries.map((e) => e.raw).join('\n');
    if (!text) {
      onNotify('info', 'No log entries to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      onNotify('success', 'Stack Trace Copied', `${filteredEntries.length} line(s) copied to clipboard.`);
    } catch {
      onNotify('error', 'Clipboard copy failed');
    }
  };

  return (
    <section
      className={`flex shrink-0 flex-col border-t border-[#E5E7EB] bg-white transition-all ${
        collapsed ? 'h-9' : entries.length === 0 ? 'h-24' : 'h-44'
      }`}
      aria-label="Live Error Logcat Terminal"
    >
      {/* Header Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[#E5E7EB] bg-white px-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111827] hover:text-[#E54D2E]"
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#6B7280]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#6B7280]" />
            )}
            <Terminal className="h-3.5 w-3.5 text-[#4B5563]" />
            <span>Live Error Logcat</span>
          </button>

          <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-700">
            *:E
          </span>

          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#6B7280]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                streamAttached && sessionActive
                  ? 'bg-[#1F7A3E]'
                  : wsState === 'open'
                    ? 'bg-[#9CA3AF]'
                    : 'bg-amber-500'
              }`}
            />
            {streamAttached && sessionActive
              ? 'Streaming'
              : wsState === 'open'
                ? 'Idle'
                : 'Reconnecting...'}
          </span>

          {entries.length > 0 && (
            <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-[#374151]">
              {filteredEntries.length}
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {!collapsed && (
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter tag or stack trace..."
                className="h-6 w-52 rounded-md border border-[#D1D5DB] bg-[#F9FAFB] pl-6 pr-2 font-mono text-[11px] text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#111827] focus:bg-white"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setAutoScroll((v) => !v)}
            className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors ${
              autoScroll
                ? 'border-[#111827] bg-[#111827] text-white'
                : 'border-[#D1D5DB] bg-white text-[#6B7280] hover:text-[#111827]'
            }`}
            title="Toggle auto-scroll to newest logs"
          >
            <ArrowDownToLine className="h-3 w-3" />
            <span className="hidden md:inline">Auto-scroll</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-[#D1D5DB] bg-white px-2 text-[11px] font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
            title="Clear logcat buffer"
          >
            <Trash2 className="h-3 w-3" />
            <span className="hidden md:inline">Clear</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyStackTrace()}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-[#D1D5DB] bg-white px-2 text-[11px] font-medium text-[#111827] transition-colors hover:bg-[#F9FAFB]"
            title="Copy filtered error stack trace for QA bug reports"
          >
            {copied ? (
              <Check className="h-3 w-3 text-[#1F7A3E]" />
            ) : (
              <Copy className="h-3 w-3 text-[#4B5563]" />
            )}
            <span>Copy Stack Trace</span>
          </button>
        </div>
      </div>

      {/* Log Stream Body */}
      {!collapsed && (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto bg-[#F9FAFB] px-4 py-2 font-mono text-[11px] leading-5"
        >
          {filteredEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[#6B7280]">
              {entries.length === 0
                ? 'Waiting for Android runtime errors (adb logcat *:E)... Start a session to stream live crashes & exceptions.'
                : 'No log entries match your current filter.'}
            </div>
          ) : (
            <div className="divide-y divide-[#F3F4F6]">
              {filteredEntries.map((entry) => {
                const isSystem = entry.level === 'SYS';
                const isFatal = entry.level === 'F';
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2.5 px-1.5 py-1 hover:bg-white"
                  >
                    <span className="shrink-0 tabular-nums text-[#9CA3AF]">{entry.timestamp}</span>
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                        isSystem
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : isFatal
                            ? 'bg-rose-600 text-white'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {entry.level}
                    </span>
                    <span className="shrink-0 font-semibold text-[#111827]">{entry.tag}:</span>
                    <span
                      className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${
                        isSystem ? 'text-[#4B5563]' : 'text-rose-800'
                      }`}
                    >
                      {entry.message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
