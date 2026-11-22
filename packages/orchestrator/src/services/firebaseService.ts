import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { config, ensureStudioDirectories } from '../config.js';
import type { FirebaseAuthStatus, FirebaseProfile, FirebaseRelease } from '../types.js';
import {
  decryptJson,
  encryptJson,
  generatePkcePair,
  generateRandomState,
  type EncryptedPayload,
} from '../utils/crypto.js';
import { installApkOnDevice } from './deviceService.js';
import { logcatService } from './logcatService.js';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform.read-only';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface ProfilesStore {
  activeProfileId: string | null;
  profiles: FirebaseProfile[];
}

interface StoredOAuthAuth {
  method: 'oauth-pkce';
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  accountEmail?: string;
}

interface StoredServiceAccountAuth {
  method: 'service-account';
  serviceAccount: {
    client_email: string;
    private_key: string;
    token_uri: string;
    project_id?: string;
  };
  accessToken?: string;
  expiresAt?: number;
}

type StoredAuth = StoredOAuthAuth | StoredServiceAccountAuth;

interface PendingPkceSession {
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  createdAt: number;
}

const pendingPkceSessions = new Map<string, PendingPkceSession>();

// Clean stale PKCE sessions older than 15 minutes
function prunePendingPkce(): void {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [state, sess] of pendingPkceSessions.entries()) {
    if (sess.createdAt < cutoff) {
      pendingPkceSessions.delete(state);
    }
  }
}

function readProfilesStore(): ProfilesStore {
  try {
    if (!fs.existsSync(config.paths.firebaseProfilesFile)) {
      return { activeProfileId: null, profiles: [] };
    }
    const raw = fs.readFileSync(config.paths.firebaseProfilesFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProfilesStore>;
    return {
      activeProfileId: parsed.activeProfileId ?? null,
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    };
  } catch {
    return { activeProfileId: null, profiles: [] };
  }
}

function writeProfilesStore(store: ProfilesStore): void {
  ensureStudioDirectories();
  fs.writeFileSync(config.paths.firebaseProfilesFile, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

function readStoredAuth(): StoredAuth | null {
  try {
    if (!fs.existsSync(config.paths.firebaseAuthFile)) return null;
    const raw = fs.readFileSync(config.paths.firebaseAuthFile, 'utf8');
    const encrypted = JSON.parse(raw) as EncryptedPayload;
    return decryptJson<StoredAuth>(encrypted);
  } catch {
    return null;
  }
}

function writeStoredAuth(auth: StoredAuth): void {
  ensureStudioDirectories();
  const encrypted = encryptJson(auth);
  fs.writeFileSync(config.paths.firebaseAuthFile, JSON.stringify(encrypted, null, 2), {
    mode: 0o600,
  });
}

export function clearStoredAuth(): void {
  if (fs.existsSync(config.paths.firebaseAuthFile)) {
    fs.unlinkSync(config.paths.firebaseAuthFile);
  }
}

export function getFirebaseAuthStatus(): FirebaseAuthStatus {
  const stored = readStoredAuth();
  if (!stored) {
    return {
      authenticated: false,
      method: null,
      oauthClientIdConfigured: Boolean(config.googleOAuthClientId),
    };
  }

  if (stored.method === 'oauth-pkce') {
    return {
      authenticated: true,
      method: 'oauth-pkce',
      accountEmail: stored.accountEmail,
      expiresAt: new Date(stored.expiresAt).toISOString(),
      hasRefreshToken: Boolean(stored.refreshToken),
      oauthClientIdConfigured: true,
    };
  }

  return {
    authenticated: true,
    method: 'service-account',
    accountEmail: stored.serviceAccount.client_email,
    projectId: stored.serviceAccount.project_id,
    expiresAt: stored.expiresAt ? new Date(stored.expiresAt).toISOString() : undefined,
    oauthClientIdConfigured: Boolean(config.googleOAuthClientId),
  };
}

// ============================================================================
// Method 1: Google OAuth 2.0 PKCE Flow (Desktop OAuth Client, no client_secret)
// ============================================================================
export function createGooglePkceStartUrl(options: {
  clientId?: string;
  redirectUri: string;
}): { authUrl: string; state: string } {
  prunePendingPkce();
  const clientId = options.clientId?.trim() || config.googleOAuthClientId;

  if (!clientId) {
    const err = new Error(
      'Google OAuth Desktop Client ID is required. Provide it in the UI or set GOOGLE_OAUTH_CLIENT_ID in .env.'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateRandomState();

  pendingPkceSessions.set(state, {
    codeVerifier,
    clientId,
    redirectUri: options.redirectUri,
    createdAt: Date.now(),
  });

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', `${GOOGLE_SCOPE} email`);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return { authUrl: url.toString(), state };
}

export async function handleGooglePkceCallback(params: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<{ ok: boolean; email?: string; error?: string }> {
  if (params.error) {
    return { ok: false, error: `Google OAuth denied: ${params.error}` };
  }
  if (!params.code || !params.state) {
    return { ok: false, error: 'Missing OAuth authorization code or state parameter.' };
  }

  const pending = pendingPkceSessions.get(params.state);
  if (!pending) {
    return { ok: false, error: 'OAuth PKCE session expired or state mismatch. Please retry.' };
  }
  pendingPkceSessions.delete(params.state);

  const form = new URLSearchParams({
    client_id: pending.clientId,
    code: params.code,
    code_verifier: pending.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: pending.redirectUri,
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenJson.access_token) {
    return {
      ok: false,
      error: tokenJson.error_description || tokenJson.error || 'OAuth token exchange failed.',
    };
  }

  // Fetch account email from Google tokeninfo (best-effort)
  let accountEmail: string | undefined;
  try {
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(tokenJson.access_token)}`
    );
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { email?: string };
      accountEmail = info.email;
    }
  } catch {
    // Non-fatal
  }

  const expiresInMs = (tokenJson.expires_in ?? 3600) * 1000;
  writeStoredAuth({
    method: 'oauth-pkce',
    clientId: pending.clientId,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt: Date.now() + expiresInMs - 60_000,
    accountEmail,
  });

  return { ok: true, email: accountEmail };
}

// ============================================================================
// Method 2: Service Account JSON Authentication (RS256 JWT Assertion)
// ============================================================================
function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

async function fetchServiceAccountAccessToken(sa: StoredServiceAccountAuth['serviceAccount']): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: GOOGLE_SCOPE,
    aud: sa.token_uri,
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(sa.private_key).toString('base64url');
  const assertion = `${signingInput}.${signature}`;

  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(
      `Service Account token exchange failed: ${json.error_description || json.error || res.statusText}`
    );
  }

  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  };
}

export async function saveServiceAccountAuth(rawJson: string | Record<string, unknown>): Promise<FirebaseAuthStatus> {
  let parsed: Record<string, unknown>;
  try {
    parsed = typeof rawJson === 'string' ? (JSON.parse(rawJson) as Record<string, unknown>) : rawJson;
  } catch {
    const err = new Error('Invalid JSON format for Service Account credentials.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  if (
    parsed.type !== 'service_account' ||
    typeof parsed.client_email !== 'string' ||
    typeof parsed.private_key !== 'string'
  ) {
    const err = new Error(
      'Service Account JSON must include "type": "service_account", "client_email", and "private_key".'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const serviceAccount = {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri:
      typeof parsed.token_uri === 'string' && parsed.token_uri
        ? parsed.token_uri
        : GOOGLE_TOKEN_ENDPOINT,
    project_id: typeof parsed.project_id === 'string' ? parsed.project_id : undefined,
  };

  // Validate key immediately by signing and fetching an access token (or verify PEM format if offline)
  let accessToken: string | undefined;
  let expiresAt: number | undefined;
  try {
    const token = await fetchServiceAccountAccessToken(serviceAccount);
    accessToken = token.accessToken;
    expiresAt = token.expiresAt;
  } catch (err) {
    // Verify private key is at least a valid RSA key so bad pastes fail fast
    try {
      crypto.createPrivateKey(serviceAccount.private_key);
    } catch {
      throw new Error('Invalid RSA private_key inside Service Account JSON.');
    }
    throw err;
  }

  writeStoredAuth({
    method: 'service-account',
    serviceAccount,
    accessToken,
    expiresAt,
  });

  return getFirebaseAuthStatus();
}

async function getValidAccessToken(): Promise<string> {
  const stored = readStoredAuth();
  if (!stored) {
    const err = new Error(
      'Not authenticated with Firebase. Sign in with Google OAuth or upload a Service Account JSON first.'
    ) as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }

  if (stored.method === 'oauth-pkce') {
    if (Date.now() < stored.expiresAt && stored.accessToken) {
      return stored.accessToken;
    }

    if (!stored.refreshToken) {
      const err = new Error(
        'Google OAuth access token expired and no refresh token is available. Please sign in again.'
      ) as Error & { statusCode?: number };
      err.statusCode = 401;
      throw err;
    }

    const form = new URLSearchParams({
      client_id: stored.clientId,
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    });

    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !json.access_token) {
      throw new Error(
        `Failed to refresh Google OAuth token: ${json.error_description || json.error || res.statusText}`
      );
    }

    const updated: StoredOAuthAuth = {
      ...stored,
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
    };
    writeStoredAuth(updated);
    return updated.accessToken;
  }

  // Service Account token with automatic refresh
  if (stored.accessToken && stored.expiresAt && Date.now() < stored.expiresAt) {
    return stored.accessToken;
  }

  const fresh = await fetchServiceAccountAccessToken(stored.serviceAccount);
  writeStoredAuth({
    ...stored,
    accessToken: fresh.accessToken,
    expiresAt: fresh.expiresAt,
  });
  return fresh.accessToken;
}

// ============================================================================
// Dynamic URL & App ID Parser + Profile Management
// ============================================================================
const FIREBASE_CONSOLE_URL_REGEX =
  /console\.firebase\.google\.com\/(?:u\/\d+\/)?project\/([^/?#]+)\/appdistribution\/app\/android:([^/?#]+)/i;
const FIREBASE_APP_ID_REGEX = /^1:(\d+):android:([a-fA-F0-9]+)$/;

async function tryResolveIdsFromFirebaseManagementApi(
  projectId: string,
  packageName: string
): Promise<{ projectNumber?: string; appId?: string; displayName?: string }> {
  try {
    const token = await getValidAccessToken();
    const projectRes = await fetch(
      `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    if (!projectRes.ok) return {};
    const projectJson = (await projectRes.json()) as { projectNumber?: string; displayName?: string };

    const appsRes = await fetch(
      `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/androidApps`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    let appId: string | undefined;
    let displayName = projectJson.displayName;
    if (appsRes.ok) {
      const appsJson = (await appsRes.json()) as {
        apps?: Array<{ appId?: string; packageName?: string; displayName?: string }>;
      };
      const match = appsJson.apps?.find((a) => a.packageName === packageName);
      if (match?.appId) {
        appId = match.appId;
        displayName = match.displayName || displayName;
      }
    }

    return { projectNumber: projectJson.projectNumber, appId, displayName };
  } catch {
    return {};
  }
}

export function listFirebaseProfiles(): ProfilesStore {
  return readProfilesStore();
}

export function selectFirebaseProfile(profileId: string): ProfilesStore {
  const store = readProfilesStore();
  if (!store.profiles.some((p) => p.id === profileId)) {
    const err = new Error('Firebase profile not found.') as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  store.activeProfileId = profileId;
  writeProfilesStore(store);
  return store;
}

export function deleteFirebaseProfile(profileId: string): ProfilesStore {
  const store = readProfilesStore();
  store.profiles = store.profiles.filter((p) => p.id !== profileId);
  if (store.activeProfileId === profileId) {
    store.activeProfileId = store.profiles[0]?.id ?? null;
  }
  writeProfilesStore(store);
  return store;
}

export async function parseAndSaveFirebaseProfile(input: {
  url?: string;
  projectNumber?: string;
  appId?: string;
  projectId?: string;
  packageName?: string;
  name?: string;
}): Promise<{
  profile: FirebaseProfile;
  resolvedViaApi: boolean;
  needsManualIds: boolean;
  store: ProfilesStore;
}> {
  let projectId = input.projectId?.trim() || undefined;
  let packageName = input.packageName?.trim() || undefined;
  let projectNumber = input.projectNumber?.trim() || '';
  let appId = input.appId?.trim() || '';
  let displayName = input.name?.trim() || '';
  const sourceUrl = input.url?.trim() || undefined;
  let resolvedViaApi = false;

  if (sourceUrl) {
    const match = sourceUrl.match(FIREBASE_CONSOLE_URL_REGEX);
    if (!match) {
      const err = new Error(
        'Could not parse Firebase Console URL. Expected format: https://console.firebase.google.com/project/<projectId>/appdistribution/app/android:<packageName>/releases'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    projectId = decodeURIComponent(match[1]);
    packageName = decodeURIComponent(match[2]);
  }

  // Extract projectNumber automatically from Firebase App ID (1:<projectNumber>:android:<hash>)
  if (appId) {
    const appIdMatch = appId.match(FIREBASE_APP_ID_REGEX);
    if (!appIdMatch) {
      const err = new Error(
        'Invalid Firebase App ID format. Expected 1:<projectNumber>:android:<hexHash>.'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    if (!projectNumber) {
      projectNumber = appIdMatch[1];
    }
  }

  // If Console URL was given without manual projectNumber/appId, try resolving via Firebase Management API
  if (projectId && packageName && (!projectNumber || !appId)) {
    const resolved = await tryResolveIdsFromFirebaseManagementApi(projectId, packageName);
    if (resolved.projectNumber) projectNumber = resolved.projectNumber;
    if (resolved.appId) appId = resolved.appId;
    if (resolved.displayName && !displayName) displayName = resolved.displayName;
    resolvedViaApi = Boolean(resolved.projectNumber && resolved.appId);
  }

  if (!projectId && (!projectNumber || !appId)) {
    const err = new Error(
      'Provide either a Firebase Console Releases URL or both Project Number and Firebase App ID.'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const store = readProfilesStore();

  // Check if profile already exists for this appId or (projectId + packageName)
  const existingIdx = store.profiles.findIndex(
    (p) =>
      (appId && p.appId && p.appId === appId) ||
      (projectId && packageName && p.projectId === projectId && p.packageName === packageName)
  );

  const profileName =
    displayName ||
    (packageName ? `${packageName}` : projectId ? `${projectId}` : `Android App (${projectNumber})`);

  let savedProfile: FirebaseProfile;
  if (existingIdx >= 0) {
    const existing = store.profiles[existingIdx];
    savedProfile = {
      ...existing,
      name: displayName || existing.name,
      projectId: projectId ?? existing.projectId,
      projectNumber: projectNumber || existing.projectNumber,
      packageName: packageName ?? existing.packageName,
      appId: appId || existing.appId,
      sourceUrl: sourceUrl ?? existing.sourceUrl,
      updatedAt: now,
    };
    store.profiles[existingIdx] = savedProfile;
  } else {
    savedProfile = {
      id: crypto.randomUUID(),
      name: profileName,
      projectId,
      projectNumber,
      packageName,
      appId,
      sourceUrl,
      createdAt: now,
      updatedAt: now,
    };
    store.profiles.unshift(savedProfile);
  }

  store.activeProfileId = savedProfile.id;
  writeProfilesStore(store);

  return {
    profile: savedProfile,
    resolvedViaApi,
    needsManualIds: !savedProfile.projectNumber || !savedProfile.appId,
    store,
  };
}

// ============================================================================
// Fetch Releases & 1-Click APK Download + ADB Install
// ============================================================================
export async function fetchFirebaseReleases(params?: {
  profileId?: string;
  projectNumber?: string;
  appId?: string;
}): Promise<{ profile?: FirebaseProfile; releases: FirebaseRelease[] }> {
  const store = readProfilesStore();
  let projectNumber = params?.projectNumber?.trim() || '';
  let appId = params?.appId?.trim() || '';
  let profile: FirebaseProfile | undefined;

  if (!projectNumber || !appId) {
    const targetId = params?.profileId || store.activeProfileId;
    profile = store.profiles.find((p) => p.id === targetId);
    if (!profile) {
      const err = new Error(
        'No active Firebase app profile selected. Parse a Firebase URL or enter Project Number + App ID first.'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    projectNumber = profile.projectNumber;
    appId = profile.appId;

    // Last-chance resolution if profile was saved from Console URL before authentication
    if ((!projectNumber || !appId) && profile.projectId && profile.packageName) {
      const resolved = await tryResolveIdsFromFirebaseManagementApi(
        profile.projectId,
        profile.packageName
      );
      if (resolved.projectNumber && resolved.appId) {
        profile.projectNumber = resolved.projectNumber;
        profile.appId = resolved.appId;
        profile.updatedAt = new Date().toISOString();
        writeProfilesStore(store);
        projectNumber = resolved.projectNumber;
        appId = resolved.appId;
      }
    }
  }

  if (!projectNumber || !appId) {
    const err = new Error(
      'This profile is missing Project Number or Firebase App ID (1:<projectNumber>:android:<hash>). Update the profile manually or ensure your Google account has Firebase Viewer access.'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const token = await getValidAccessToken();
  const endpoint = `https://firebaseappdistribution.googleapis.com/v1/projects/${encodeURIComponent(
    projectNumber
  )}/apps/${encodeURIComponent(appId)}/releases?pageSize=25`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    let message = `Firebase App Distribution API returned HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(errText) as { error?: { message?: string } };
      if (errJson.error?.message) message = errJson.error.message;
    } catch {
      if (errText) message = `${message}: ${errText.slice(0, 200)}`;
    }
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = response.status === 401 || response.status === 403 ? response.status : 502;
    throw err;
  }

  const data = (await response.json()) as {
    releases?: Array<{
      name?: string;
      displayVersion?: string;
      buildVersion?: string;
      releaseNotes?: { text?: string };
      createTime?: string;
      binaryDownloadUri?: string;
      firebaseConsoleUri?: string;
    }>;
  };

  const releases: FirebaseRelease[] = (data.releases ?? []).map((r) => ({
    name: r.name ?? '',
    displayVersion: r.displayVersion ?? '0.0.0',
    buildVersion: r.buildVersion ?? '0',
    releaseNotes: r.releaseNotes?.text ?? '',
    createTime: r.createTime ?? new Date().toISOString(),
    binaryDownloadUri: r.binaryDownloadUri ?? '',
    firebaseConsoleUri: r.firebaseConsoleUri,
  }));

  return { profile, releases };
}

export async function downloadAndInstallFirebaseRelease(params: {
  binaryDownloadUri: string;
  displayVersion?: string;
  buildVersion?: string;
  deviceSerial?: string;
}): Promise<{
  ok: boolean;
  serial: string;
  fileName: string;
  downloadedBytes: number;
  installOutput: string;
  durationMs: number;
}> {
  const { binaryDownloadUri } = params;
  if (!binaryDownloadUri || !/^https:\/\//i.test(binaryDownloadUri)) {
    const err = new Error('A valid HTTPS binaryDownloadUri is required.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  ensureStudioDirectories();
  const token = await getValidAccessToken();

  const safeVersion = `${params.displayVersion ?? 'release'}-${params.buildVersion ?? Date.now()}`
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `firebase-${safeVersion}-${Date.now()}.apk`;
  const targetPath = path.join(config.paths.apkTmpDir, fileName);

  logcatService.emitSystem(`Downloading Firebase release APK (${safeVersion})...`);

  // Firebase binaryDownloadUri may be a signed GCS URL or require Bearer auth; try with Bearer first, fallback without Authorization if GCS rejects dual auth
  let res = await fetch(binaryDownloadUri, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
    signal: AbortSignal.timeout(180_000),
  });

  if (res.status === 400 || res.status === 401) {
    res = await fetch(binaryDownloadUri, {
      redirect: 'follow',
      signal: AbortSignal.timeout(180_000),
    });
  }

  if (!res.ok || !res.body) {
    throw new Error(`Failed to download APK from Firebase (HTTP ${res.status}).`);
  }

  const nodeStream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, fs.createWriteStream(targetPath));

  const stats = fs.statSync(targetPath);
  if (stats.size < 1024) {
    throw new Error('Downloaded file is unexpectedly small and does not appear to be a valid APK.');
  }

  const installRes = await installApkOnDevice(targetPath, params.deviceSerial);

  return {
    ok: true,
    serial: installRes.serial,
    fileName,
    downloadedBytes: stats.size,
    installOutput: installRes.output,
    durationMs: installRes.durationMs,
  };
}
