import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Crown,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  ActiveSession,
  LicenseStatus,
  TestReport,
  TestStep,
  TestStepAction,
  TestSuite,
} from '../types';

interface AutomationDrawerProps {
  open: boolean;
  onClose: () => void;
  license: LicenseStatus | null;
  session: ActiveSession;
  onOpenLicense: () => void;
  onEnableDemoPro: () => void;
  onNotify: (tone: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

const STEP_ACTIONS: Array<{ value: TestStepAction; label: string }> = [
  { value: 'launch_app', label: 'Launch App (package)' },
  { value: 'tap', label: 'Tap (x, y)' },
  { value: 'swipe', label: 'Swipe (x1,y1 → x2,y2)' },
  { value: 'input_text', label: 'Input Text' },
  { value: 'keyevent', label: 'Key Event (BACK/HOME)' },
  { value: 'wait', label: 'Wait (ms)' },
  { value: 'assert_foreground', label: 'Assert Foreground App' },
  { value: 'monkey_stress', label: 'Monkey Stress Test' },
  { value: 'screenshot', label: 'Capture Screenshot' },
];

export function AutomationDrawer({
  open,
  onClose,
  license,
  session,
  onOpenLicense,
  onEnableDemoPro,
  onNotify,
}: AutomationDrawerProps) {
  const isPro = Boolean(license?.isPro);

  const [tab, setTab] = useState<'suites' | 'reports'>('suites');
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('');
  const [reports, setReports] = useState<TestReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<TestReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [notes, setNotes] = useState('');

  // Quick suite builder state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPkg, setNewPkg] = useState('');
  const [newSteps, setNewSteps] = useState<TestStep[]>([
    { id: 's-1', action: 'launch_app', label: 'Launch App' },
    { id: 's-2', action: 'wait', label: 'Wait 1.5s', durationMs: 1500 },
    { id: 's-3', action: 'assert_foreground', label: 'Assert Foreground' },
    { id: 's-4', action: 'screenshot', label: 'Capture Result' },
  ]);

  const loadData = useCallback(async () => {
    if (!isPro) return;
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([api.getTestSuites(), api.getTestReports()]);
      setSuites(sRes.suites);
      if (sRes.suites.length > 0) {
        setSelectedSuiteId((prev) => prev || sRes.suites[0].id);
      }
      setReports(rRes.reports);
      if (rRes.reports.length > 0) {
        setSelectedReport((prev) => prev ?? rRes.reports[0]);
      }
    } catch (err) {
      onNotify(
        'error',
        'Failed to load automation data',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [isPro, onNotify]);

  useEffect(() => {
    if (open && isPro) {
      void loadData();
    }
  }, [open, isPro, loadData]);

  if (!open) return null;

  const activeSuite = suites.find((s) => s.id === selectedSuiteId) ?? suites[0];

  const handleRunSuite = async () => {
    if (!activeSuite) return;
    if (!session.active) {
      onNotify('warning', 'No Active Session', 'Start Kiri Mode or Direct ADB Mode first.');
      return;
    }

    setRunning(true);
    try {
      const res = await api.runTestSuite({
        suiteId: activeSuite.id,
        notes: notes.trim() || undefined,
      });
      setReports((prev) => [res.report, ...prev]);
      setSelectedReport(res.report);
      setTab('reports');
      setNotes('');
      onNotify(
        res.report.status === 'passed' ? 'success' : 'error',
        `Test Run ${res.report.status.toUpperCase()}`,
        `${res.report.passedSteps}/${res.report.totalSteps} steps passed on ${res.report.deviceSerial}.`
      );
    } catch (err) {
      onNotify('error', 'Automation Run Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setRunning(false);
    }
  };

  const handleSaveNewSuite = async () => {
    if (!newName.trim() || newSteps.length === 0) return;
    try {
      const res = await api.saveTestSuite({
        name: newName.trim(),
        packageName: newPkg.trim() || undefined,
        steps: newSteps,
      });
      setSuites(res.suites);
      setSelectedSuiteId(res.suite.id);
      setCreating(false);
      setNewName('');
      setNewPkg('');
      onNotify('success', 'Test Suite Saved', res.suite.name);
    } catch (err) {
      onNotify('error', 'Could not save suite', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteSuite = async (id: string) => {
    try {
      const res = await api.deleteTestSuite(id);
      setSuites(res.suites);
      if (selectedSuiteId === id) {
        setSelectedSuiteId(res.suites[0]?.id ?? '');
      }
    } catch (err) {
      onNotify('error', 'Failed to delete suite', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteReport = async (id: string) => {
    try {
      const res = await api.deleteTestReport(id);
      setReports(res.reports);
      if (selectedReport?.id === id) {
        setSelectedReport(res.reports[0] ?? null);
      }
    } catch (err) {
      onNotify('error', 'Failed to delete report', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]">
      <div className="studio-surface flex h-full w-full max-w-2xl flex-col border-l border-[#E5E7EB] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-[#4B5563]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#111827]">
                  Automated Testing & QA Reporting
                </h2>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280]">
                Execute automated UI/monkey flows on Android & export Markdown, HTML, or JSON QA reports.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            aria-label="Close Automation Drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Pro Gate */}
        {!isPro ? (
          <div className="flex flex-1 items-center justify-center bg-[#F7F8FA] p-6">
            <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200 bg-amber-50">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-[#111827]">
                Unlock Automated Testing & QA Reporting
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280]">
                Create repeatable Android UI & monkey stress flows, capture screenshots & Logcat errors automatically, and export shareable QA reports in Markdown, HTML, or JSON.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLicense();
                  }}
                  className="studio-btn-primary w-full py-2"
                >
                  <Crown className="h-3.5 w-3.5" />
                  Activate Pro License Key
                </button>
                {license?.checkoutUrl && (
                  <a
                    href={license.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="studio-btn w-full py-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Buy Pro on Gumroad
                  </a>
                )}
                {license?.demoProAllowed && (
                  <button type="button" onClick={onEnableDemoPro} className="studio-btn w-full py-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    Enable Demo Pro Preview
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5">
              <div className="flex h-10 items-center gap-5">
                <button
                  type="button"
                  onClick={() => setTab('suites')}
                  className={`relative inline-flex h-full items-center gap-1.5 text-xs font-medium transition-colors ${
                    tab === 'suites'
                      ? 'font-semibold text-[#111827]'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" />
                  Test Suites ({suites.length})
                  {tab === 'suites' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[#E54D2E]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('reports')}
                  className={`relative inline-flex h-full items-center gap-1.5 text-xs font-medium transition-colors ${
                    tab === 'reports'
                      ? 'font-semibold text-[#111827]'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  QA Reports ({reports.length})
                  {tab === 'reports' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[#E54D2E]" />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="studio-btn py-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 space-y-4 overflow-y-auto bg-[#F7F8FA] p-5">
              {tab === 'suites' ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {suites.map((suite) => (
                        <div
                          key={suite.id}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                            activeSuite?.id === suite.id
                              ? 'border-[#111827] bg-[#111827] text-white'
                              : 'border-[#D1D5DB] bg-white text-[#374151] hover:text-[#111827]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSuiteId(suite.id);
                              setCreating(false);
                            }}
                            className="font-medium"
                          >
                            {suite.name}
                          </button>
                          {suites.length > 1 && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteSuite(suite.id)}
                              className={activeSuite?.id === suite.id ? 'text-slate-300 hover:text-rose-300' : 'text-[#9CA3AF] hover:text-rose-600'}
                              title="Delete suite"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setCreating((v) => !v)}
                      className="studio-btn"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {creating ? 'Cancel' : 'New Suite'}
                    </button>
                  </div>

                  {creating ? (
                    <div className="space-y-3 rounded-lg border border-[#E5E7EB] bg-white p-4">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[#374151]">
                            Suite Name
                          </label>
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Checkout Flow Regression"
                            className="studio-input"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-[#374151]">
                            Target Package Name
                          </label>
                          <input
                            type="text"
                            value={newPkg}
                            onChange={(e) => setNewPkg(e.target.value)}
                            placeholder="com.example.app"
                            className="studio-input font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#111827]">Steps</span>
                          <button
                            type="button"
                            onClick={() =>
                              setNewSteps((prev) => [
                                ...prev,
                                {
                                  id: `s-${Date.now()}`,
                                  action: 'tap',
                                  label: `Step ${prev.length + 1}`,
                                  x: 540,
                                  y: 960,
                                },
                              ])
                            }
                            className="studio-btn px-2 py-1 text-[11px]"
                          >
                            <Plus className="h-3 w-3" /> Add Step
                          </button>
                        </div>

                        {newSteps.map((step, idx) => (
                          <div
                            key={step.id}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] p-2"
                          >
                            <span className="font-mono text-[10px] tabular-nums text-[#6B7280]">#{idx + 1}</span>
                            <select
                              value={step.action}
                              onChange={(e) => {
                                const action = e.target.value as TestStepAction;
                                setNewSteps((prev) =>
                                  prev.map((s) => (s.id === step.id ? { ...s, action } : s))
                                );
                              }}
                              className="studio-select text-[11px]"
                            >
                              {STEP_ACTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>

                            <input
                              type="text"
                              value={step.label ?? ''}
                              onChange={(e) =>
                                setNewSteps((prev) =>
                                  prev.map((s) =>
                                    s.id === step.id ? { ...s, label: e.target.value } : s
                                  )
                                )
                              }
                              placeholder="Step label"
                              className="studio-input w-36 py-1 text-[11px]"
                            />

                            {(step.action === 'tap' || step.action === 'swipe') && (
                              <>
                                <input
                                  type="number"
                                  value={step.x ?? 540}
                                  onChange={(e) =>
                                    setNewSteps((prev) =>
                                      prev.map((s) =>
                                        s.id === step.id ? { ...s, x: Number(e.target.value) } : s
                                      )
                                    )
                                  }
                                  placeholder="x"
                                  className="studio-input w-16 py-1 font-mono text-[11px]"
                                />
                                <input
                                  type="number"
                                  value={step.y ?? 960}
                                  onChange={(e) =>
                                    setNewSteps((prev) =>
                                      prev.map((s) =>
                                        s.id === step.id ? { ...s, y: Number(e.target.value) } : s
                                      )
                                    )
                                  }
                                  placeholder="y"
                                  className="studio-input w-16 py-1 font-mono text-[11px]"
                                />
                              </>
                            )}

                            {step.action === 'input_text' && (
                              <input
                                type="text"
                                value={step.text ?? ''}
                                onChange={(e) =>
                                  setNewSteps((prev) =>
                                    prev.map((s) =>
                                      s.id === step.id ? { ...s, text: e.target.value } : s
                                    )
                                  )
                                }
                                placeholder="Text to type"
                                className="studio-input w-36 py-1 text-[11px]"
                              />
                            )}

                            {step.action === 'wait' && (
                              <input
                                type="number"
                                value={step.durationMs ?? 1000}
                                onChange={(e) =>
                                  setNewSteps((prev) =>
                                    prev.map((s) =>
                                      s.id === step.id
                                        ? { ...s, durationMs: Number(e.target.value) }
                                        : s
                                    )
                                  )
                                }
                                placeholder="ms"
                                className="studio-input w-20 py-1 font-mono text-[11px]"
                              />
                            )}

                            {step.action === 'monkey_stress' && (
                              <input
                                type="number"
                                value={step.eventCount ?? 100}
                                onChange={(e) =>
                                  setNewSteps((prev) =>
                                    prev.map((s) =>
                                      s.id === step.id
                                        ? { ...s, eventCount: Number(e.target.value) }
                                        : s
                                    )
                                  )
                                }
                                placeholder="events"
                                className="studio-input w-20 py-1 font-mono text-[11px]"
                              />
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setNewSteps((prev) => prev.filter((s) => s.id !== step.id))
                              }
                              className="ml-auto text-[#9CA3AF] hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSaveNewSuite()}
                        disabled={!newName.trim() || newSteps.length === 0}
                        className="studio-btn-primary w-full py-2"
                      >
                        Save Test Suite
                      </button>
                    </div>
                  ) : activeSuite ? (
                    <div className="space-y-3 rounded-lg border border-[#E5E7EB] bg-white p-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-[#111827]">{activeSuite.name}</h3>
                          {activeSuite.packageName && (
                            <span className="rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 font-mono text-[10px] text-[#374151]">
                              {activeSuite.packageName}
                            </span>
                          )}
                        </div>
                        {activeSuite.description && (
                          <p className="mt-1 text-[11px] text-[#6B7280]">{activeSuite.description}</p>
                        )}
                      </div>

                      <div className="divide-y divide-[#E5E7EB] rounded-lg border border-[#E5E7EB]">
                        {activeSuite.steps.map((s, idx) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between bg-white px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] tabular-nums text-[#9CA3AF]">
                                {idx + 1}.
                              </span>
                              <span className="font-medium text-[#111827]">
                                {s.label || s.action}
                              </span>
                            </div>
                            <span className="rounded border border-[#E5E7EB] bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[10px] text-[#4B5563]">
                              {s.action}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2 border-t border-[#E5E7EB] pt-3">
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Optional QA notes for this run report (e.g. Build v2.4.1 RC)"
                          className="studio-input"
                        />
                        <button
                          type="button"
                          onClick={() => void handleRunSuite()}
                          disabled={running || !session.active}
                          className="studio-btn-accent w-full py-2"
                        >
                          {running ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 fill-current" />
                          )}
                          {running
                            ? 'Executing Automated Steps on Device...'
                            : session.active
                              ? `Run Automated Suite on ${session.deviceSerial}`
                              : 'Start Device Session First to Run'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                /* Tab 2: QA Reports */
                <div className="space-y-4">
                  {reports.length === 0 ? (
                    <div className="rounded-lg border border-[#E5E7EB] bg-white py-12 text-center text-xs text-[#6B7280]">
                      No QA reports generated yet. Run a test suite to create your first report.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {reports.map((rep) => (
                          <div
                            key={rep.id}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                              selectedReport?.id === rep.id
                                ? 'border-[#111827] bg-[#111827] text-white'
                                : 'border-[#D1D5DB] bg-white text-[#374151] hover:text-[#111827]'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                rep.status === 'passed' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setSelectedReport(rep)}
                              className="font-medium"
                            >
                              {rep.suiteName}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteReport(rep.id)}
                              className={selectedReport?.id === rep.id ? 'text-slate-300 hover:text-rose-300' : 'text-[#9CA3AF] hover:text-rose-600'}
                              title="Delete report"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {selectedReport && (
                        <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E7EB] bg-[#F9FAFB] p-4">
                            <div>
                              <div className="flex items-center gap-2">
                                {selectedReport.status === 'passed' ? (
                                  <CheckCircle2 className="h-4 w-4 text-[#1F7A3E]" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-rose-600" />
                                )}
                                <h3 className="text-xs font-semibold text-[#111827]">
                                  {selectedReport.suiteName}
                                </h3>
                                <span
                                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                                    selectedReport.status === 'passed'
                                      ? 'bg-[#1F7A3E] text-white'
                                      : 'bg-rose-600 text-white'
                                  }`}
                                >
                                  {selectedReport.passedSteps}/{selectedReport.totalSteps} PASSED
                                </span>
                              </div>
                              <p className="mt-1 font-mono text-[10px] tabular-nums text-[#6B7280]">
                                {selectedReport.deviceSerial} ·{' '}
                                {(selectedReport.durationMs / 1000).toFixed(2)}s ·{' '}
                                {new Date(selectedReport.startedAt).toLocaleString()}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <a
                                href={api.getReportExportUrl(selectedReport.id, 'markdown')}
                                className="studio-btn"
                              >
                                <Download className="h-3 w-3" /> .md
                              </a>
                              <a
                                href={api.getReportExportUrl(selectedReport.id, 'html')}
                                className="studio-btn"
                              >
                                <Download className="h-3 w-3" /> .html
                              </a>
                              <a
                                href={api.getReportExportUrl(selectedReport.id, 'json')}
                                className="studio-btn"
                              >
                                <Download className="h-3 w-3" /> .json
                              </a>
                            </div>
                          </div>

                          <div className="divide-y divide-[#E5E7EB]">
                            {selectedReport.stepResults.map((step, i) => (
                              <div
                                key={`${step.stepId}-${i}`}
                                className={`flex items-start justify-between gap-2 px-4 py-2.5 text-xs ${
                                  step.status === 'passed' ? 'bg-[#EBF9F0]/45' : 'bg-rose-50/60'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    {step.status === 'passed' ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#1F7A3E]" />
                                    ) : (
                                      <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                                    )}
                                    <span className="font-semibold text-[#111827]">{step.label}</span>
                                  </div>
                                  <p className="mt-0.5 pl-5 font-mono text-[11px] text-[#4B5563]">
                                    {step.detail}
                                  </p>
                                </div>
                                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#6B7280]">
                                  {step.durationMs}ms
                                </span>
                              </div>
                            ))}
                          </div>

                          {selectedReport.errorLogs.length > 0 && (
                            <div className="m-4 rounded-md border border-rose-200 bg-rose-50 p-3">
                              <div className="mb-1.5 text-[11px] font-semibold text-rose-800">
                                Captured Logcat Errors ({selectedReport.errorLogs.length})
                              </div>
                              <pre className="max-h-36 overflow-auto font-mono text-[10px] leading-relaxed text-rose-900">
                                {selectedReport.errorLogs.join('\n')}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
