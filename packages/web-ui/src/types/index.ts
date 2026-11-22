export type RuntimeMode = 'docker' | 'direct-adb';
export type ContainerEngine = 'kiri' | 'docker' | 'none';
export type AndroidVersion = '11' | '12' | '13' | '14';
export type LicenseTier = 'free' | 'pro';
export type LicenseValidationSource = 'free' | 'gumroad' | 'local-key' | 'remote-server' | 'demo-preview';
export type SubscriptionStatus = 'one-time' | 'active' | 'cancelled-active' | 'ended' | 'failed';

export interface ContainerRuntimeStatus {
  engine: ContainerEngine;
  binary: string;
  preferredRuntime: 'auto' | 'kiri' | 'docker';
  kiriInstalled: boolean;
  kiriRunning: boolean;
  kiriVersion?: string;
  dockerInstalled: boolean;
  dockerRunning: boolean;
  dockerVersion?: string;
  needsConfig: boolean;
  forkRepo: string;
  forkReleasesUrl: string;
  installCommand: string;
  configCommand: string;
}

export interface AdbDeviceInfo {
  serial: string;
  state: string;
  model?: string;
  product?: string;
  device?: string;
  transportType: 'usb' | 'network' | 'emulator' | 'unknown';
}

export interface KernelModulesStatus {
  applicable: boolean;
  ready: boolean;
  binder: boolean;
  ashmem: boolean;
  checkedInGuestVm?: boolean;
  message: string;
  fixCommands: string[];
}

export interface SystemCheckReport {
  timestamp: string;
  os: string;
  osRelease: string;
  arch: string;
  isWsl: boolean;
  containerRuntime: ContainerRuntimeStatus;
  dockerAvailable: boolean;
  dockerVersion?: string;
  dockerError?: string;
  dockerFixCommand?: string;
  kernelModulesReady: KernelModulesStatus;
  adbAvailable: boolean;
  adbVersion?: string;
  adbError?: string;
  adbFixCommand?: string;
  maestroAvailable: boolean;
  maestroVersion?: string;
  connectedDevices: AdbDeviceInfo[];
  certReady: boolean;
  certFileName?: string;
  certFixCommand: string;
  recommendedMode: RuntimeMode;
  readyForDocker: boolean;
  readyForDirectAdb: boolean;
}

export interface LicenseFeatures {
  multiOsSwitcher: boolean;
  networkInspector: boolean;
  firebaseDistribution: boolean;
  automatedTesting: boolean;
  reporting: boolean;
  allowedAndroidVersions: AndroidVersion[];
}

export interface LicenseStatus {
  tier: LicenseTier;
  isPro: boolean;
  isDemoPreview: boolean;
  licenseKeyMasked?: string;
  activatedAt?: string;
  lastVerifiedAt?: string;
  offlineGraceUntil?: string;
  buyerEmail?: string;
  productName?: string;
  uses?: number;
  maxUses?: number;
  subscriptionStatus?: SubscriptionStatus;
  gumroadEnabled: boolean;
  demoProAllowed: boolean;
  checkoutUrl?: string;
  reverifyRequired?: boolean;
  machineFingerprint: string;
  validationSource: LicenseValidationSource;
  features: LicenseFeatures;
}

export interface SessionAutomationStep {
  step: string;
  status: 'ok' | 'skipped' | 'warning' | 'error';
  detail: string;
}

export interface ActiveSession {
  active: boolean;
  mode: RuntimeMode | null;
  androidVersion?: AndroidVersion;
  containerName?: string;
  deviceSerial: string | null;
  proxyHost?: string;
  proxyPort: number;
  metroPort: number;
  wsScrcpyUrl: string;
  mitmWebUrl: string;
  metroReversed: boolean;
  proxyConfigured: boolean;
  sslCertInjected: boolean;
  startedAt?: string;
  automations: SessionAutomationStep[];
}

export interface FirebaseProfile {
  id: string;
  name: string;
  projectId?: string;
  projectNumber: string;
  packageName?: string;
  appId: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirebaseProfilesStore {
  activeProfileId: string | null;
  profiles: FirebaseProfile[];
}

export interface FirebaseAuthStatus {
  authenticated: boolean;
  method: 'oauth-pkce' | 'service-account' | null;
  accountEmail?: string;
  projectId?: string;
  expiresAt?: string;
  hasRefreshToken?: boolean;
  oauthClientIdConfigured: boolean;
}

export interface FirebaseRelease {
  name: string;
  displayVersion: string;
  buildVersion: string;
  releaseNotes: string;
  createTime: string;
  binaryDownloadUri: string;
  firebaseConsoleUri?: string;
}

export interface LogcatEntry {
  id: string;
  timestamp: string;
  level: 'E' | 'F' | 'W' | 'I' | 'D' | 'V' | 'SYS';
  pid?: string;
  tid?: string;
  tag: string;
  message: string;
  raw: string;
}

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}

export type TestStepAction =
  | 'launch_app'
  | 'tap'
  | 'swipe'
  | 'input_text'
  | 'keyevent'
  | 'wait'
  | 'assert_foreground'
  | 'monkey_stress'
  | 'screenshot';

export interface TestStep {
  id: string;
  action: TestStepAction;
  label?: string;
  packageName?: string;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  durationMs?: number;
  text?: string;
  keycode?: string;
  eventCount?: number;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  packageName?: string;
  steps: TestStep[];
  createdAt: string;
  updatedAt: string;
}

export interface TestStepResult {
  stepId: string;
  action: TestStepAction;
  label: string;
  status: 'passed' | 'failed';
  durationMs: number;
  detail: string;
  screenshotFile?: string;
}

export interface TestReport {
  id: string;
  suiteId: string;
  suiteName: string;
  deviceSerial: string;
  mode: RuntimeMode | null;
  androidVersion?: AndroidVersion;
  status: 'passed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
  stepResults: TestStepResult[];
  errorLogs: string[];
  notes?: string;
}

export interface UiHierarchyNode {
  text: string;
  resourceId: string;
  contentDesc: string;
  className: string;
  bounds: [number, number, number, number];
  clickable: boolean;
}

export type RecordedActionType =
  | 'tap'
  | 'inputText'
  | 'swipe'
  | 'back'
  | 'wait'
  | 'assertVisible'
  | 'launchApp';

export interface RecordedFlowStep {
  id: string;
  action: RecordedActionType;
  selectorType?: 'text' | 'id' | 'coords';
  value?: string;
  fallbackCoords?: [number, number];
  text?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  durationMs?: number;
  appId?: string;
  label?: string;
}

export interface RecordedFlow {
  id: string;
  name: string;
  appId?: string;
  steps: RecordedFlowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface MaestroTemplate {
  id: string;
  name: string;
  description: string;
  yaml: string;
}

export interface FlowStepResult {
  stepId: string;
  index: number;
  action: string;
  label: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  detail: string;
  screenshotFile?: string;
}

export interface FlowRunReport {
  id: string;
  source: 'flow' | 'maestro-yaml';
  flowId?: string;
  flowName: string;
  deviceSerial: string;
  status: 'PASS' | 'FAIL';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passedSteps: number;
  failedSteps: number;
  totalSteps: number;
  stepResults: FlowStepResult[];
  errorLogs: string[];
  videoFile?: string;
  screenshotFiles: string[];
  failedApiRequests: Array<{ method: string; url: string; status: number }>;
}

export interface ExportedBugReport {
  reportId: string;
  runId: string;
  zipFileName: string;
  downloadUrl: string;
  markdown: string;
  createdAt: string;
}
