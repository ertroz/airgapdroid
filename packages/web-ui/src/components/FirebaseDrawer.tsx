import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileJson,
  Flame,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  ActiveSession,
  FirebaseAuthStatus,
  FirebaseProfilesStore,
  FirebaseRelease,
  LicenseStatus,
  RecordedFlow,
} from '../types';

interface FirebaseDrawerProps {
  open: boolean;
  onClose: () => void;
  license: LicenseStatus | null;
  session: ActiveSession;
  onOpenLicense: () => void;
  onEnableDemoPro: () => void;
  onNotify: (tone: 'success' | 'error' | 'info' | 'warning', title: string, description?: string) => void;
}

export function FirebaseDrawer({
  open,
  onClose,
  license,
  session,
  onNotify,
}: FirebaseDrawerProps) {
  const isPro = Boolean(license?.isPro);

  const [authTab, setAuthTab] = useState<'oauth' | 'service-account'>('oauth');
  const [authStatus, setAuthStatus] = useState<FirebaseAuthStatus | null>(null);
  const [oauthClientId, setOauthClientId] = useState('');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [profilesStore, setProfilesStore] = useState<FirebaseProfilesStore>({
    activeProfileId: null,
    profiles: [],
  });
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url');
  const [consoleUrl, setConsoleUrl] = useState('');
  const [manualProjectNumber, setManualProjectNumber] = useState('');
  const [manualAppId, setManualAppId] = useState('');
  const [manualName, setManualName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [releases, setReleases] = useState<FirebaseRelease[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [installingReleaseName, setInstallingReleaseName] = useState<string | null>(null);
  const [savedFlows, setSavedFlows] = useState<RecordedFlow[]>([]);
  const [autoRunFlowId, setAutoRunFlowId] = useState('');

  const loadState = useCallback(async () => {
    try {
      const [auth, store] = await Promise.all([
        api.getFirebaseAuthStatus(),
        api.getFirebaseProfiles(),
      ]);
      setAuthStatus(auth);
      setProfilesStore(store);
      if (isPro) {
        const flowRes = await api.getFlows().catch(() => ({ flows: [] }));
        setSavedFlows(flowRes.flows);
      }
    } catch (err) {
      onNotify('error', 'Failed to load Firebase state', err instanceof Error ? err.message : undefined);
    }
  }, [isPro, onNotify]);

  const loadReleases = useCallback(
    async (profileId?: string) => {
      setLoadingReleases(true);
      setReleasesError(null);
      try {
        const res = await api.getFirebaseReleases(profileId);
        setReleases(res.releases);
      } catch (err) {
        setReleases([]);
        setReleasesError(err instanceof Error ? err.message : 'Failed to fetch releases');
      } finally {
        setLoadingReleases(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    void loadState();
  }, [open, loadState]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'QA_STUDIO_FIREBASE_OAUTH') return;
      if (event.data.ok) {
        onNotify(
          'success',
          'Signed in with Google',
          event.data.email ? `Connected as ${event.data.email}` : 'OAuth PKCE tokens saved locally.'
        );
        void loadState();
      } else {
        onNotify('error', 'Google OAuth Failed', event.data.error || 'Authorization cancelled.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadState, onNotify]);

  useEffect(() => {
    if (open && authStatus?.authenticated && profilesStore.activeProfileId) {
      void loadReleases(profilesStore.activeProfileId);
    }
  }, [open, authStatus?.authenticated, profilesStore.activeProfileId, loadReleases]);

  if (!open) return null;

  const activeProfile = profilesStore.profiles.find((p) => p.id === profilesStore.activeProfileId);

  const handleGoogleOAuth = async () => {
    setAuthBusy(true);
    try {
      const { authUrl } = await api.startGoogleOAuth(oauthClientId.trim() || undefined);
      const popup = window.open(authUrl, 'qa_studio_google_oauth', 'width=540,height=680');
      if (!popup) {
        onNotify('warning', 'Popup Blocked', 'Allow popups for localhost:3000 to complete Google Sign-In.');
      }
    } catch (err) {
      onNotify('error', 'Could not start Google OAuth', err instanceof Error ? err.message : undefined);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleServiceAccountSubmit = async () => {
    if (!serviceAccountJson.trim()) return;
    setAuthBusy(true);
    try {
      const res = await api.submitServiceAccountJson(serviceAccountJson);
      setAuthStatus(res.status);
      setServiceAccountJson('');
      onNotify(
        'success',
        'Service Account Connected',
        res.status.accountEmail ?? 'Credentials encrypted locally.'
      );
    } catch (err) {
      onNotify(
        'error',
        'Service Account Error',
        err instanceof Error ? err.message : 'Invalid JSON credentials.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleServiceAccountFile = async (file: File) => {
    setAuthBusy(true);
    try {
      const res = await api.uploadServiceAccountFile(file);
      setAuthStatus(res.status);
      onNotify(
        'success',
        'Service Account Uploaded',
        res.status.accountEmail ?? file.name
      );
    } catch (err) {
      onNotify('error', 'Upload Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await api.logoutFirebase();
    setAuthStatus({
      authenticated: false,
      method: null,
      oauthClientIdConfigured: Boolean(authStatus?.oauthClientIdConfigured),
    });
    setReleases([]);
    onNotify('info', 'Signed out from Firebase');
  };

  const handleParseAndSave = async () => {
    setSavingProfile(true);
    try {
      const payload =
        inputMode === 'url'
          ? { url: consoleUrl.trim(), name: manualName.trim() || undefined }
          : {
              projectNumber: manualProjectNumber.trim(),
              appId: manualAppId.trim(),
              name: manualName.trim() || undefined,
            };

      const res = await api.parseFirebaseUrl(payload);
      setProfilesStore(res.store);
      setConsoleUrl('');
      setManualProjectNumber('');
      setManualAppId('');
      setManualName('');

      if (res.needsManualIds) {
        onNotify(
          'warning',
          'Profile Saved — Needs App ID',
          'Parsed Console URL. Sign in with Google or add Project Number & Firebase App ID to fetch releases.'
        );
      } else {
        onNotify(
          'success',
          'Firebase Profile Saved',
          `${res.profile.name} (${res.profile.appId})`
        );
      }
    } catch (err) {
      onNotify('error', 'Invalid Firebase Input', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSelectProfile = async (id: string) => {
    try {
      const store = await api.selectFirebaseProfile(id);
      setProfilesStore(store);
    } catch (err) {
      onNotify('error', 'Failed to switch profile', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      const store = await api.deleteFirebaseProfile(id);
      setProfilesStore(store);
      if (store.profiles.length === 0) setReleases([]);
      onNotify('info', 'Profile removed');
    } catch (err) {
      onNotify('error', 'Failed to delete profile', err instanceof Error ? err.message : undefined);
    }
  };

  const handleInstallRelease = async (release: FirebaseRelease) => {
    if (!session.active) {
      onNotify('warning', 'No Active Session', 'Start a Docker or Direct ADB session before installing an APK.');
      return;
    }

    setInstallingReleaseName(release.name || `${release.displayVersion}-${release.buildVersion}`);
    try {
      const res = await api.installFirebaseRelease({
        binaryDownloadUri: release.binaryDownloadUri,
        displayVersion: release.displayVersion,
        buildVersion: release.buildVersion,
        autoRunFlowId: autoRunFlowId || undefined,
      });
      onNotify(
        'success',
        `Installed v${release.displayVersion} (${release.buildVersion})`,
        res.autoRunReport
          ? `Installed & auto-ran flow: ${res.autoRunReport.status} (${res.autoRunReport.passedSteps}/${res.autoRunReport.totalSteps}).`
          : `Installed on ${res.serial} in ${(res.durationMs / 1000).toFixed(1)}s.`
      );
    } catch (err) {
      onNotify(
        'error',
        'Firebase APK Install Failed',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setInstallingReleaseName(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]">
      <div className="studio-surface flex h-full w-full max-w-xl flex-col border-l border-[#E5E7EB] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Flame className="h-4 w-4 text-[#E54D2E]" />
            <div>
              <h2 className="text-sm font-semibold text-[#111827]">
                Firebase App Distribution Switcher
              </h2>
              <p className="text-[11px] text-[#6B7280]">
                Switch apps dynamically, authenticate locally, and 1-click install APK builds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            aria-label="Close Firebase Drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto bg-[#F7F8FA] p-5">
          {/* Section 1: Authentication */}
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                1. Authentication
              </h3>
              {authStatus?.authenticated && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6B7280] transition-colors hover:text-rose-600"
                >
                  <LogOut className="h-3 w-3" /> Sign Out
                </button>
              )}
            </div>

            {authStatus?.authenticated ? (
              <div className="mt-3 flex items-center justify-between rounded-md border border-emerald-200 bg-[#EBF9F0] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1F7A3E]" />
                  <div>
                    <div className="text-xs font-semibold text-[#14532D]">
                      {authStatus.accountEmail || 'Authenticated'}
                    </div>
                    <div className="font-mono text-[10px] text-[#1F7A3E]">
                      {authStatus.method === 'oauth-pkce'
                        ? 'Google OAuth 2.0 PKCE (AES-256 Encrypted)'
                        : 'Service Account JSON (RS256 JWT)'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                {/* Auth Tabs */}
                <div className="grid grid-cols-2 gap-1 rounded-md border border-[#E5E7EB] bg-[#F3F4F6] p-0.5">
                  <button
                    type="button"
                    onClick={() => setAuthTab('oauth')}
                    className={`flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors ${
                      authTab === 'oauth'
                        ? 'bg-white text-[#111827] shadow-sm'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Sign in with Google
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthTab('service-account')}
                    className={`flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-colors ${
                      authTab === 'service-account'
                        ? 'bg-white text-[#111827] shadow-sm'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    Service Account JSON
                  </button>
                </div>

                {authTab === 'oauth' ? (
                  <div className="mt-3 space-y-2.5">
                    <p className="text-[11px] leading-relaxed text-[#6B7280]">
                      Uses Desktop OAuth 2.0 PKCE (S256, no client_secret). Tokens are stored AES-256 encrypted in{' '}
                      <code className="rounded bg-[#F3F4F6] px-1 font-mono text-[#111827]">~/.qa-studio/</code>.
                    </p>
                    {!authStatus?.oauthClientIdConfigured && (
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-[#374151]">
                          Google Desktop OAuth Client ID
                        </label>
                        <input
                          type="text"
                          value={oauthClientId}
                          onChange={(e) => setOauthClientId(e.target.value)}
                          placeholder="1234567890-xxxx.apps.googleusercontent.com"
                          className="studio-input font-mono"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleGoogleOAuth}
                      disabled={authBusy}
                      className="studio-btn-primary w-full py-2"
                    >
                      {authBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="h-3.5 w-3.5" />
                      )}
                      Continue with Google (OAuth PKCE)
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#6B7280]">
                        Paste JSON or upload a key file with Firebase App Distribution Viewer role.
                      </span>
                      <label className="studio-btn shrink-0 cursor-pointer">
                        <FileJson className="h-3.5 w-3.5" />
                        Upload .json
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleServiceAccountFile(file);
                          }}
                        />
                      </label>
                    </div>
                    <textarea
                      rows={4}
                      value={serviceAccountJson}
                      onChange={(e) => setServiceAccountJson(e.target.value)}
                      placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                      className="studio-input font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={handleServiceAccountSubmit}
                      disabled={authBusy || !serviceAccountJson.trim()}
                      className="studio-btn-primary w-full py-2"
                    >
                      {authBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Connect Service Account
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 2: Dynamic App Profile Switcher & URL Parser */}
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                2. App Profiles & Dynamic URL Parser
              </h3>
              <div className="flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-[#F3F4F6] p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`rounded px-2 py-0.5 font-medium ${
                    inputMode === 'url' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280]'
                  }`}
                >
                  Console URL
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('manual')}
                  className={`rounded px-2 py-0.5 font-medium ${
                    inputMode === 'manual' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280]'
                  }`}
                >
                  Manual App ID
                </button>
              </div>
            </div>

            {profilesStore.profiles.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[11px] font-medium text-[#6B7280]">Saved App Profiles</div>
                <div className="flex flex-wrap gap-1.5">
                  {profilesStore.profiles.map((prof) => {
                    const active = prof.id === profilesStore.activeProfileId;
                    return (
                      <div
                        key={prof.id}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? 'border-[#111827] bg-[#111827] text-white'
                            : 'border-[#D1D5DB] bg-[#F9FAFB] text-[#374151] hover:bg-white hover:text-[#111827]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void handleSelectProfile(prof.id)}
                          className="font-medium"
                        >
                          {prof.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProfile(prof.id)}
                          className={active ? 'text-slate-300 hover:text-rose-300' : 'text-[#9CA3AF] hover:text-rose-600'}
                          title="Delete profile"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {inputMode === 'url' ? (
                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] text-[#6B7280]">
                    <Link2 className="h-3 w-3" /> Paste Firebase App Distribution Releases URL
                  </label>
                  <input
                    type="url"
                    value={consoleUrl}
                    onChange={(e) => setConsoleUrl(e.target.value)}
                    placeholder="https://console.firebase.google.com/project/my-proj/appdistribution/app/android:com.app.id/releases"
                    className="studio-input font-mono text-[11px]"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-[#6B7280]">
                      Project Number
                    </label>
                    <input
                      type="text"
                      value={manualProjectNumber}
                      onChange={(e) => setManualProjectNumber(e.target.value)}
                      placeholder="123456789012"
                      className="studio-input font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[#6B7280]">
                      Firebase App ID
                    </label>
                    <input
                      type="text"
                      value={manualAppId}
                      onChange={(e) => setManualAppId(e.target.value)}
                      placeholder="1:123456789012:android:abcdef1234"
                      className="studio-input font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Optional profile label (e.g. Staging Android)"
                  className="studio-input flex-1 text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleParseAndSave}
                  disabled={savingProfile}
                  className="studio-btn shrink-0 px-3 py-2"
                >
                  {savingProfile ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Parse & Save
                </button>
              </div>
            </div>
          </section>

          {/* Section 3: Releases List */}
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  3. Available APK Builds
                </h3>
                {activeProfile && (
                  <p className="mt-0.5 font-mono text-[10px] text-[#6B7280]">
                    {activeProfile.appId || `${activeProfile.projectId} · ${activeProfile.packageName}`}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isPro && savedFlows.length > 0 && (
                  <select
                    value={autoRunFlowId}
                    onChange={(e) => setAutoRunFlowId(e.target.value)}
                    className="studio-select max-w-[200px] text-[11px]"
                    title="Auto-run Test Flow after Install"
                  >
                    <option value="">Auto-run Flow: None</option>
                    {savedFlows.map((f) => (
                      <option key={f.id} value={f.id}>
                        Auto-run: {f.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => void loadReleases(activeProfile?.id)}
                  disabled={loadingReleases || !authStatus?.authenticated || !activeProfile}
                  className="studio-btn"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingReleases ? 'animate-spin' : ''}`} />
                  Fetch Builds
                </button>
              </div>
            </div>

            {releasesError && (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {releasesError}
              </div>
            )}

            {loadingReleases ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#6B7280]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Fetching releases from Firebase App Distribution...
              </div>
            ) : releases.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6B7280]">
                {!authStatus?.authenticated
                  ? 'Authenticate above to fetch builds.'
                  : !activeProfile
                    ? 'Add or select an app profile above.'
                    : 'No releases loaded yet. Click "Fetch Builds" to query Firebase.'}
              </div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {releases.map((rel) => {
                  const releaseKey = rel.name || `${rel.displayVersion}-${rel.buildVersion}`;
                  const isInstalling = installingReleaseName === releaseKey;
                  const createdLabel = new Date(rel.createTime).toLocaleString();

                  return (
                    <div
                      key={releaseKey}
                      className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3.5 transition-colors hover:border-[#D1D5DB] hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[#111827]">
                              v{rel.displayVersion}
                            </span>
                            <span className="rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#4B5563]">
                              build {rel.buildVersion}
                            </span>
                            {rel.firebaseConsoleUri && (
                              <a
                                href={rel.firebaseConsoleUri}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#6B7280] hover:text-[#111827]"
                                title="Open in Firebase Console"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#6B7280]">{createdLabel}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleInstallRelease(rel)}
                          disabled={Boolean(installingReleaseName) || !rel.binaryDownloadUri}
                          className="studio-btn-primary shrink-0"
                          title={
                            session.active
                              ? `Download & install to ${session.deviceSerial}`
                              : 'Start a session first to install'
                          }
                        >
                          {isInstalling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {isInstalling ? 'Installing...' : '1-Click Install'}
                        </button>
                      </div>

                      {rel.releaseNotes && (
                        <pre className="mt-2.5 whitespace-pre-wrap rounded-md border border-[#E5E7EB] bg-white p-2.5 font-sans text-[11px] leading-relaxed text-[#374151]">
                          {rel.releaseNotes}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
