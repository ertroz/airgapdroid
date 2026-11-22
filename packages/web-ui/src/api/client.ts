import type {
  ActiveSession,
  AdbDeviceInfo,
  AndroidVersion,
  ExportedBugReport,
  FirebaseAuthStatus,
  FirebaseProfile,
  FirebaseProfilesStore,
  FirebaseRelease,
  FlowRunReport,
  LicenseStatus,
  MaestroTemplate,
  RecordedFlow,
  RecordedFlowStep,
  RuntimeMode,
  SystemCheckReport,
  TestReport,
  TestStep,
  TestSuite,
  UiHierarchyNode,
} from '../types';

const isViteDev =
  typeof window !== 'undefined' && window.location.port === '3000';
const API_BASE =
  import.meta.env.VITE_API_URL || (isViteDev ? '' : 'http://localhost:4000');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { error?: string; message?: string }).error ||
      (data as { message?: string }).message ||
      `Request failed (${res.status})`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = (data as { code?: string }).code;
    throw err;
  }

  return data as T;
}

export function getLogcatWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (!isViteDev) return 'ws://localhost:4000/ws/logcat';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/logcat`;
}

export function getAutomationWsUrl(): string {
  if (!isViteDev) return 'ws://localhost:4000/ws/automation';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/automation`;
}

export const api = {
  // System Check & Provisioning
  health: () => request<{ status: string }>('/api/health'),
  getSystemCheck: () => request<SystemCheckReport>('/api/system/check'),
  getAdbDevices: () => request<{ devices: AdbDeviceInfo[] }>('/api/system/devices'),
  installRuntime: () =>
    request<{ ok: boolean; message: string; installerPath?: string; report: SystemCheckReport }>(
      '/api/system/runtime/install',
      { method: 'POST' }
    ),
  configureRuntime: () =>
    request<{ ok: boolean; message: string; report: SystemCheckReport }>(
      '/api/system/runtime/configure',
      { method: 'POST' }
    ),
  configureBinder: () =>
    request<{ ok: boolean; message: string; report: SystemCheckReport }>(
      '/api/system/binder/configure',
      { method: 'POST' }
    ),
  startContainerRuntime: () =>
    request<{ ok: boolean; provider: string; message: string; report: SystemCheckReport }>(
      '/api/system/start-container-runtime',
      { method: 'POST' }
    ),
  getPullProgressUrl: (version: AndroidVersion) =>
    `${API_BASE}/api/system/pull-progress?version=${encodeURIComponent(version)}`,
  getMitmproxyStatus: () =>
    request<{ running: boolean; url: string; mode: string }>('/api/system/mitmproxy/status'),
  startMitmproxy: () =>
    request<{ ok: boolean; mode: string; message: string }>('/api/system/mitmproxy/start', {
      method: 'POST',
    }),

  // License
  getLicenseStatus: () => request<LicenseStatus>('/api/license/status'),
  activateLicense: (payload: {
    licenseKey?: string;
    demoPreview?: boolean;
    deactivate?: boolean;
  }) =>
    request<{ ok: boolean; message: string; status: LicenseStatus }>('/api/license/activate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  verifyLicense: () =>
    request<{ ok: boolean; message: string; status: LicenseStatus }>('/api/license/verify', {
      method: 'POST',
    }),

  // Session Lifecycle
  getSessionStatus: () => request<ActiveSession>('/api/session/status'),
  startSession: (payload: {
    mode: RuntimeMode;
    androidVersion?: AndroidVersion;
    deviceSerial?: string;
    proxyHost?: string;
  }) =>
    request<ActiveSession>('/api/session/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  stopSession: () =>
    request<{ stopped: boolean; session: ActiveSession }>('/api/session/stop', {
      method: 'POST',
    }),

  // Device Actions
  installApkFile: (file: File, deviceSerial?: string) => {
    const form = new FormData();
    form.append('apk', file);
    if (deviceSerial) form.append('deviceSerial', deviceSerial);
    return request<{
      ok: boolean;
      serial: string;
      fileName: string;
      output: string;
      durationMs: number;
    }>('/api/device/install', {
      method: 'POST',
      body: form,
    });
  },
  clearAppData: (packageName: string, deviceSerial?: string) =>
    request<{ ok: boolean; serial: string; packageName: string; output: string }>(
      '/api/device/clear',
      {
        method: 'POST',
        body: JSON.stringify({ packageName, deviceSerial }),
      }
    ),

  // Firebase Auth
  getFirebaseAuthStatus: () => request<FirebaseAuthStatus>('/api/auth/status'),
  logoutFirebase: () =>
    request<{ ok: boolean; status: FirebaseAuthStatus }>('/api/auth/logout', {
      method: 'POST',
    }),
  startGoogleOAuth: (clientId?: string) => {
    const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
    return request<{ authUrl: string; state: string; redirectUri: string }>(
      `/api/auth/google/start${qs}`
    );
  },
  uploadServiceAccountFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ ok: boolean; status: FirebaseAuthStatus }>('/api/auth/service-account', {
      method: 'POST',
      body: form,
    });
  },
  submitServiceAccountJson: (serviceAccountJson: string) =>
    request<{ ok: boolean; status: FirebaseAuthStatus }>('/api/auth/service-account', {
      method: 'POST',
      body: JSON.stringify({ serviceAccountJson }),
    }),

  // Firebase Profiles & Releases
  getFirebaseProfiles: () => request<FirebaseProfilesStore>('/api/firebase/profiles'),
  parseFirebaseUrl: (payload: {
    url?: string;
    projectNumber?: string;
    appId?: string;
    name?: string;
  }) =>
    request<{
      profile: FirebaseProfile;
      resolvedViaApi: boolean;
      needsManualIds: boolean;
      store: FirebaseProfilesStore;
    }>('/api/firebase/parse-url', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  selectFirebaseProfile: (profileId: string) =>
    request<FirebaseProfilesStore>(`/api/firebase/profiles/${encodeURIComponent(profileId)}/select`, {
      method: 'POST',
    }),
  deleteFirebaseProfile: (profileId: string) =>
    request<FirebaseProfilesStore>(`/api/firebase/profiles/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
    }),
  getFirebaseReleases: (profileId?: string) => {
    const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    return request<{ profile?: FirebaseProfile; releases: FirebaseRelease[] }>(
      `/api/firebase/releases${qs}`
    );
  },
  installFirebaseRelease: (payload: {
    binaryDownloadUri: string;
    displayVersion?: string;
    buildVersion?: string;
    deviceSerial?: string;
    autoRunFlowId?: string;
  }) =>
    request<{
      ok: boolean;
      serial: string;
      fileName: string;
      downloadedBytes: number;
      installOutput: string;
      durationMs: number;
      autoRunReport?: FlowRunReport | null;
    }>('/api/firebase/install', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // No-Code Visual Recorder & Flows (Pro)
  getUiHierarchy: (deviceSerial?: string) => {
    const qs = deviceSerial ? `?deviceSerial=${encodeURIComponent(deviceSerial)}` : '';
    return request<{ nodes: UiHierarchyNode[] }>(`/api/automation/hierarchy${qs}`);
  },
  recordTap: (payload: { x: number; y: number; deviceSerial?: string }) =>
    request<{ step: RecordedFlowStep; nodesCount: number }>('/api/automation/record-tap', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordStep: (payload: {
    action: RecordedFlowStep['action'];
    text?: string;
    value?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
    durationMs?: number;
    appId?: string;
    deviceSerial?: string;
  }) =>
    request<{ step: RecordedFlowStep }>('/api/automation/record-step', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getFlows: () => request<{ flows: RecordedFlow[] }>('/api/automation/flows'),
  saveFlow: (payload: {
    id?: string;
    name: string;
    appId?: string;
    steps: RecordedFlowStep[];
  }) =>
    request<{ ok: boolean; flow: RecordedFlow; flows: RecordedFlow[] }>('/api/automation/flows', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteFlow: (id: string) =>
    request<{ ok: boolean; flows: RecordedFlow[] }>(`/api/automation/flows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  exportFlowToYaml: (payload: { appId?: string; steps: RecordedFlowStep[] }) =>
    request<{ yaml: string }>('/api/automation/export-yaml', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  runFlow: (payload: {
    flowId?: string;
    flow?: { name?: string; appId?: string; steps: RecordedFlowStep[] };
    deviceSerial?: string;
  }) =>
    request<{ ok: boolean; report: FlowRunReport }>('/api/automation/run-flow', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Maestro YAML Studio & Runner (Pro)
  getMaestroTemplates: () => request<{ templates: MaestroTemplate[] }>('/api/automation/templates'),
  runMaestroYaml: (payload: { yaml: string; name?: string; deviceSerial?: string }) =>
    request<{ ok: boolean; engine: 'maestro-cli' | 'adb-fallback'; report: FlowRunReport }>(
      '/api/automation/run-yaml',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  // Screen Recording & Bug Report Exporter (Pro)
  getScreenRecordStatus: () =>
    request<{ recording: boolean; serial?: string; startedAt?: string; lastVideoFile: string | null }>(
      '/api/automation/screenrecord/status'
    ),
  startScreenRecord: (deviceSerial?: string) =>
    request<{ recording: boolean; serial: string; startedAt: string }>(
      '/api/automation/screenrecord/start',
      {
        method: 'POST',
        body: JSON.stringify({ deviceSerial }),
      }
    ),
  stopScreenRecord: () =>
    request<{ stopped: boolean; videoFile: string | null; sizeBytes: number; error?: string }>(
      '/api/automation/screenrecord/stop',
      { method: 'POST' }
    ),
  getFlowRunReports: () => request<{ runs: FlowRunReport[] }>('/api/reports/runs'),
  getScreenshotUrl: (fileName: string) =>
    `${API_BASE}/api/reports/screenshots/${encodeURIComponent(fileName)}`,
  exportBugReport: (payload?: { runId?: string }) =>
    request<ExportedBugReport>('/api/reports/export', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  getBugReportDownloadUrl: (reportId: string) =>
    `${API_BASE}/api/reports/download/${encodeURIComponent(reportId)}`,

  // Automated Testing & QA Reporting (Pro)
  getTestSuites: () => request<{ suites: TestSuite[] }>('/api/automation/suites'),
  saveTestSuite: (payload: {
    id?: string;
    name: string;
    description?: string;
    packageName?: string;
    steps: TestStep[];
  }) =>
    request<{ ok: boolean; suite: TestSuite; suites: TestSuite[] }>('/api/automation/suites', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteTestSuite: (id: string) =>
    request<{ ok: boolean; suites: TestSuite[] }>(`/api/automation/suites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  runTestSuite: (payload: { suiteId?: string; suite?: { name: string; packageName?: string; steps: TestStep[] }; notes?: string }) =>
    request<{ ok: boolean; report: TestReport }>('/api/automation/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTestReports: () => request<{ reports: TestReport[] }>('/api/reports'),
  deleteTestReport: (id: string) =>
    request<{ ok: boolean; reports: TestReport[] }>(`/api/reports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getReportExportUrl: (id: string, format: 'markdown' | 'html' | 'json') =>
    `${API_BASE}/api/reports/${encodeURIComponent(id)}/export?format=${format}`,
};
