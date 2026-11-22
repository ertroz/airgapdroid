import fs from 'node:fs';
import { config, ensureStudioDirectories } from '../config.js';
import type {
  AndroidVersion,
  LicenseFeatures,
  LicenseStatus,
  LicenseTier,
  LicenseValidationSource,
  SubscriptionStatus,
} from '../types.js';
import {
  decryptJson,
  encryptJson,
  getMachineFingerprint,
  type EncryptedPayload,
} from '../utils/crypto.js';

interface PersistedLicense {
  tier: LicenseTier;
  isDemoPreview: boolean;
  licenseKey?: string;
  activatedAt?: string;
  lastVerifiedAt?: string;
  buyerEmail?: string;
  productName?: string;
  saleId?: string;
  uses?: number;
  subscriptionStatus?: SubscriptionStatus;
  machineFingerprint: string;
  validationSource: LicenseValidationSource;
}

interface EncryptedLicenseEnvelope {
  v: 2;
  encrypted: EncryptedPayload;
}

interface GumroadPurchase {
  seller_id?: string;
  product_id?: string;
  product_name?: string;
  permalink?: string;
  email?: string;
  sale_id?: string;
  sale_timestamp?: string;
  refunded?: boolean;
  disputed?: boolean;
  dispute_won?: boolean;
  chargebacked?: boolean;
  subscription_id?: string | null;
  subscription_ended_at?: string | null;
  subscription_cancelled_at?: string | null;
  subscription_failed_at?: string | null;
  test?: boolean;
}

interface GumroadVerifyApiResponse {
  success?: boolean;
  uses?: number;
  purchase?: GumroadPurchase;
  message?: string;
}

interface GumroadVerificationResult {
  ok: boolean;
  networkError: boolean;
  reason?: string;
  uses?: number;
  buyerEmail?: string;
  productName?: string;
  saleId?: string;
  subscriptionStatus?: SubscriptionStatus;
}

const LOCAL_PRO_KEY_REGEX = /^QASTUDIO-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const BACKGROUND_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

let inFlightReverify: Promise<void> | null = null;
let lastBackgroundAttemptMs = 0;

function buildFeatures(isPro: boolean): LicenseFeatures {
  return {
    multiOsSwitcher: isPro,
    networkInspector: true,
    firebaseDistribution: true,
    automatedTesting: isPro,
    reporting: isPro,
    allowedAndroidVersions: isPro ? ['11', '12', '13', '14'] : ['14'],
  };
}

function maskKey(key?: string): string | undefined {
  if (!key) return undefined;
  const parts = key.split('-');
  if (parts.length === 4) {
    if (parts[0] === 'QASTUDIO') {
      return `${parts[0]}-${parts[1]}-****-${parts[3]}`;
    }
    return `${parts[0]}-****-****-${parts[3]}`;
  }
  if (key.length <= 8) return '****';
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}

function isPastTimestamp(iso?: string | null): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms <= Date.now();
}

function readPersistedLicense(): PersistedLicense | null {
  try {
    if (!fs.existsSync(config.paths.licenseFile)) return null;
    const raw = fs.readFileSync(config.paths.licenseFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<EncryptedLicenseEnvelope & PersistedLicense>;

    if (parsed.v === 2 && parsed.encrypted) {
      return decryptJson<PersistedLicense>(parsed.encrypted);
    }

    // Legacy plaintext license.json is never trusted when Gumroad production mode is enabled
    if (config.gumroadEnabled) {
      return null;
    }

    if (parsed.tier && parsed.machineFingerprint && parsed.validationSource) {
      return parsed as PersistedLicense;
    }

    return null;
  } catch {
    // Tampered file, corrupted JSON, or copied from another machine (AES-GCM auth failure)
    return null;
  }
}

function writePersistedLicense(record: PersistedLicense): void {
  ensureStudioDirectories();
  const envelope: EncryptedLicenseEnvelope = {
    v: 2,
    encrypted: encryptJson(record),
  };
  fs.writeFileSync(config.paths.licenseFile, JSON.stringify(envelope, null, 2), {
    mode: 0o600,
  });
}

function buildBaseMeta() {
  return {
    gumroadEnabled: config.gumroadEnabled,
    demoProAllowed: config.allowDemoPro,
    checkoutUrl: config.gumroadCheckoutUrl || undefined,
    maxUses: config.gumroadEnabled && config.gumroadMaxUses > 0 ? config.gumroadMaxUses : undefined,
  };
}

function scheduleBackgroundReverify(): void {
  if (!config.gumroadEnabled) return;
  if (inFlightReverify) return;
  const now = Date.now();
  if (now - lastBackgroundAttemptMs < BACKGROUND_RETRY_COOLDOWN_MS) return;

  lastBackgroundAttemptMs = now;
  inFlightReverify = reverifyLicense()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inFlightReverify = null;
    });
}

export function getLicenseStatus(): LicenseStatus {
  const currentFingerprint = getMachineFingerprint();
  const saved = readPersistedLicense();
  const meta = buildBaseMeta();

  if (saved && saved.tier === 'pro') {
    const fingerprintMatches = saved.machineFingerprint === currentFingerprint;

    if (saved.validationSource === 'gumroad') {
      if (fingerprintMatches && saved.licenseKey) {
        const lastVerifiedMs = Date.parse(saved.lastVerifiedAt || saved.activatedAt || '');
        const graceMs = config.gumroadOfflineGraceDays * 24 * 60 * 60 * 1000;
        const reverifyMs = config.gumroadReverifyHours * 60 * 60 * 1000;
        const graceUntilIso = Number.isFinite(lastVerifiedMs)
          ? new Date(lastVerifiedMs + graceMs).toISOString()
          : undefined;
        const elapsedMs = Number.isFinite(lastVerifiedMs) ? Date.now() - lastVerifiedMs : Number.POSITIVE_INFINITY;

        if (elapsedMs > graceMs) {
          scheduleBackgroundReverify();
          return {
            tier: 'free',
            isPro: false,
            isDemoPreview: false,
            licenseKeyMasked: maskKey(saved.licenseKey),
            activatedAt: saved.activatedAt,
            lastVerifiedAt: saved.lastVerifiedAt,
            offlineGraceUntil: graceUntilIso,
            buyerEmail: saved.buyerEmail,
            productName: saved.productName,
            uses: saved.uses,
            subscriptionStatus: saved.subscriptionStatus,
            reverifyRequired: true,
            machineFingerprint: currentFingerprint,
            validationSource: 'free',
            features: buildFeatures(false),
            ...meta,
          };
        }

        if (elapsedMs > reverifyMs) {
          scheduleBackgroundReverify();
        }

        return {
          tier: 'pro',
          isPro: true,
          isDemoPreview: false,
          licenseKeyMasked: maskKey(saved.licenseKey),
          activatedAt: saved.activatedAt,
          lastVerifiedAt: saved.lastVerifiedAt,
          offlineGraceUntil: graceUntilIso,
          buyerEmail: saved.buyerEmail,
          productName: saved.productName,
          uses: saved.uses,
          subscriptionStatus: saved.subscriptionStatus,
          reverifyRequired: false,
          machineFingerprint: currentFingerprint,
          validationSource: 'gumroad',
          features: buildFeatures(true),
          ...meta,
        };
      }
    } else if (saved.isDemoPreview) {
      if (config.allowDemoPro) {
        return {
          tier: 'pro',
          isPro: true,
          isDemoPreview: true,
          activatedAt: saved.activatedAt,
          machineFingerprint: currentFingerprint,
          validationSource: 'demo-preview',
          features: buildFeatures(true),
          ...meta,
        };
      }
    } else if (saved.validationSource === 'remote-server') {
      if (fingerprintMatches) {
        return {
          tier: 'pro',
          isPro: true,
          isDemoPreview: false,
          licenseKeyMasked: maskKey(saved.licenseKey),
          activatedAt: saved.activatedAt,
          machineFingerprint: currentFingerprint,
          validationSource: 'remote-server',
          features: buildFeatures(true),
          ...meta,
        };
      }
    } else if (saved.validationSource === 'local-key') {
      // Offline local keys are disabled once Gumroad production mode is configured
      if (!config.gumroadEnabled && fingerprintMatches) {
        return {
          tier: 'pro',
          isPro: true,
          isDemoPreview: false,
          licenseKeyMasked: maskKey(saved.licenseKey),
          activatedAt: saved.activatedAt,
          machineFingerprint: currentFingerprint,
          validationSource: 'local-key',
          features: buildFeatures(true),
          ...meta,
        };
      }
    }
  }

  if (config.demoProDefault && config.allowDemoPro) {
    return {
      tier: 'pro',
      isPro: true,
      isDemoPreview: true,
      activatedAt: new Date().toISOString(),
      machineFingerprint: currentFingerprint,
      validationSource: 'demo-preview',
      features: buildFeatures(true),
      ...meta,
    };
  }

  return {
    tier: 'free',
    isPro: false,
    isDemoPreview: false,
    machineFingerprint: currentFingerprint,
    validationSource: 'free',
    features: buildFeatures(false),
    ...meta,
  };
}

export function isAndroidVersionAllowed(version: AndroidVersion): boolean {
  const status = getLicenseStatus();
  return status.features.allowedAndroidVersions.includes(version);
}

async function verifyWithGumroad(
  licenseKey: string,
  incrementUsesCount: boolean
): Promise<GumroadVerificationResult> {
  if (!config.gumroadEnabled) {
    return {
      ok: false,
      networkError: false,
      reason: 'Gumroad product is not configured (set GUMROAD_PRODUCT_ID in .env).',
    };
  }

  const form = new URLSearchParams();
  if (config.gumroadProductId) {
    form.set('product_id', config.gumroadProductId);
  } else if (config.gumroadProductPermalink) {
    form.set('product_permalink', config.gumroadProductPermalink);
  }
  form.set('license_key', licenseKey);
  form.set('increment_uses_count', incrementUsesCount ? 'true' : 'false');

  try {
    const response = await fetch(`${config.gumroadApiBaseUrl}/v2/licenses/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12_000),
    });

    const data = (await response.json().catch(() => ({}))) as GumroadVerifyApiResponse;

    if (response.status >= 500 || response.status === 429) {
      return {
        ok: false,
        networkError: true,
        reason: `Gumroad service temporarily unavailable (HTTP ${response.status}).`,
      };
    }

    if (!response.ok || !data.success || !data.purchase) {
      return {
        ok: false,
        networkError: false,
        reason: data.message || 'Invalid Gumroad license key for this product.',
      };
    }

    const purchase = data.purchase;

    if (purchase.refunded) {
      return {
        ok: false,
        networkError: false,
        reason: 'This Gumroad license key has been refunded and is no longer valid.',
      };
    }

    if (purchase.chargebacked) {
      return {
        ok: false,
        networkError: false,
        reason: 'This Gumroad license key was revoked due to a chargeback.',
      };
    }

    if (purchase.disputed && !purchase.dispute_won) {
      return {
        ok: false,
        networkError: false,
        reason: 'This Gumroad license key is currently under payment dispute.',
      };
    }

    let subscriptionStatus: SubscriptionStatus = 'one-time';
    if (purchase.subscription_id) {
      if (isPastTimestamp(purchase.subscription_ended_at)) {
        return {
          ok: false,
          networkError: false,
          subscriptionStatus: 'ended',
          reason: 'Your Gumroad Pro subscription has ended. Renew on Gumroad to continue using Pro features.',
        };
      }
      if (isPastTimestamp(purchase.subscription_failed_at)) {
        return {
          ok: false,
          networkError: false,
          subscriptionStatus: 'failed',
          reason: 'Your Gumroad Pro subscription payment failed. Update your billing method on Gumroad.',
        };
      }
      subscriptionStatus = purchase.subscription_cancelled_at ? 'cancelled-active' : 'active';
    }

    return {
      ok: true,
      networkError: false,
      uses: typeof data.uses === 'number' ? data.uses : 1,
      buyerEmail: purchase.email,
      productName: purchase.product_name,
      saleId: purchase.sale_id,
      subscriptionStatus,
    };
  } catch (err) {
    return {
      ok: false,
      networkError: true,
      reason: `Could not reach Gumroad license server: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function validateWithExternalEndpoint(
  licenseKey: string,
  machineFingerprint: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!config.licenseValidationUrl) {
    return { valid: false, reason: 'External license validation URL is not configured.' };
  }

  try {
    const response = await fetch(config.licenseValidationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, machineFingerprint, product: 'local-web-qa-studio' }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        valid: false,
        reason: `License server rejected key with HTTP ${response.status}.`,
      };
    }

    const data = (await response.json()) as { valid?: boolean; active?: boolean; message?: string };
    const valid = Boolean(data.valid ?? data.active);
    return { valid, reason: data.message };
  } catch (err) {
    return {
      valid: false,
      reason: `Could not reach external license server: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function reverifyLicense(): Promise<{
  ok: boolean;
  message: string;
  status: LicenseStatus;
}> {
  const currentFingerprint = getMachineFingerprint();
  const saved = readPersistedLicense();

  if (!saved || saved.validationSource !== 'gumroad' || !saved.licenseKey) {
    return {
      ok: false,
      message: 'No Gumroad license is currently activated on this machine.',
      status: getLicenseStatus(),
    };
  }

  if (saved.machineFingerprint !== currentFingerprint) {
    return {
      ok: false,
      message: 'Stored license is bound to a different workstation fingerprint.',
      status: getLicenseStatus(),
    };
  }

  const check = await verifyWithGumroad(saved.licenseKey, false);

  if (check.ok) {
    if (config.gumroadMaxUses > 0 && typeof check.uses === 'number' && check.uses > config.gumroadMaxUses) {
      writePersistedLicense({
        tier: 'free',
        isDemoPreview: false,
        machineFingerprint: currentFingerprint,
        validationSource: 'free',
      });
      return {
        ok: false,
        message: `Activation limit exceeded (${check.uses}/${config.gumroadMaxUses} devices). License deactivated.`,
        status: getLicenseStatus(),
      };
    }

    writePersistedLicense({
      ...saved,
      tier: 'pro',
      isDemoPreview: false,
      lastVerifiedAt: new Date().toISOString(),
      buyerEmail: check.buyerEmail ?? saved.buyerEmail,
      productName: check.productName ?? saved.productName,
      saleId: check.saleId ?? saved.saleId,
      uses: check.uses ?? saved.uses,
      subscriptionStatus: check.subscriptionStatus ?? saved.subscriptionStatus,
      machineFingerprint: currentFingerprint,
      validationSource: 'gumroad',
    });

    return {
      ok: true,
      message: 'License verified with Gumroad. Offline grace window refreshed.',
      status: getLicenseStatus(),
    };
  }

  if (!check.networkError) {
    // Definitive revocation from Gumroad (refund, chargeback, ended subscription, invalid key)
    writePersistedLicense({
      tier: 'free',
      isDemoPreview: false,
      machineFingerprint: currentFingerprint,
      validationSource: 'free',
    });
    return {
      ok: false,
      message: check.reason || 'Gumroad license is no longer valid and has been reverted to Free Tier.',
      status: getLicenseStatus(),
    };
  }

  // Transient network outage — keep local grace status intact
  return {
    ok: false,
    message: check.reason || 'Could not reach Gumroad right now. Try again when online.',
    status: getLicenseStatus(),
  };
}

export async function activateLicense(input: {
  licenseKey?: string;
  demoPreview?: boolean;
  deactivate?: boolean;
}): Promise<{ ok: boolean; statusCode?: number; message: string; status: LicenseStatus }> {
  const machineFingerprint = getMachineFingerprint();

  if (input.deactivate) {
    writePersistedLicense({
      tier: 'free',
      isDemoPreview: false,
      machineFingerprint,
      validationSource: 'free',
    });
    return {
      ok: true,
      message: 'Reverted to Free Tier.',
      status: getLicenseStatus(),
    };
  }

  if (typeof input.demoPreview === 'boolean') {
    if (input.demoPreview) {
      if (!config.allowDemoPro) {
        return {
          ok: false,
          statusCode: 403,
          message: 'Demo Pro Preview is disabled in Gumroad commercial license mode.',
          status: getLicenseStatus(),
        };
      }
      writePersistedLicense({
        tier: 'pro',
        isDemoPreview: true,
        activatedAt: new Date().toISOString(),
        machineFingerprint,
        validationSource: 'demo-preview',
      });
      return {
        ok: true,
        message: 'Demo Pro Preview enabled. All Pro features are unlocked for local testing.',
        status: getLicenseStatus(),
      };
    } else {
      writePersistedLicense({
        tier: 'free',
        isDemoPreview: false,
        machineFingerprint,
        validationSource: 'free',
      });
      return {
        ok: true,
        message: 'Demo Pro Preview disabled. Back to Free Tier.',
        status: getLicenseStatus(),
      };
    }
  }

  const normalizedKey = (input.licenseKey ?? '').trim().toUpperCase();
  if (!normalizedKey) {
    return {
      ok: false,
      message: config.gumroadEnabled
        ? 'Gumroad license key is required.'
        : 'License key is required (expected format: QASTUDIO-PRO-XXXX-XXXX).',
      status: getLicenseStatus(),
    };
  }

  // 1. Gumroad License API v2 (Production)
  if (config.gumroadEnabled) {
    const existing = readPersistedLicense();
    const sameKeyOnThisMachine = Boolean(
      existing &&
        existing.validationSource === 'gumroad' &&
        existing.machineFingerprint === machineFingerprint &&
        existing.licenseKey === normalizedKey
    );

    // Pre-verify without incrementing uses so invalid/refunded/over-limit keys never burn a seat
    const peek = await verifyWithGumroad(normalizedKey, false);
    if (!peek.ok) {
      return {
        ok: false,
        message: peek.reason || 'Gumroad license verification failed.',
        status: getLicenseStatus(),
      };
    }

    const currentUses = peek.uses ?? 0;
    if (config.gumroadMaxUses > 0) {
      if (!sameKeyOnThisMachine && currentUses >= config.gumroadMaxUses) {
        return {
          ok: false,
          message: `Activation limit reached (${currentUses}/${config.gumroadMaxUses} devices already activated for this license key).`,
          status: getLicenseStatus(),
        };
      }
      if (sameKeyOnThisMachine && currentUses > config.gumroadMaxUses) {
        return {
          ok: false,
          message: `Activation limit exceeded (${currentUses}/${config.gumroadMaxUses} devices).`,
          status: getLicenseStatus(),
        };
      }
    }

    let finalResult = peek;
    if (!sameKeyOnThisMachine) {
      const claim = await verifyWithGumroad(normalizedKey, true);
      if (!claim.ok) {
        return {
          ok: false,
          message: claim.reason || 'Failed to record device activation with Gumroad.',
          status: getLicenseStatus(),
        };
      }
      if (config.gumroadMaxUses > 0 && typeof claim.uses === 'number' && claim.uses > config.gumroadMaxUses) {
        return {
          ok: false,
          message: `Activation limit reached (${claim.uses}/${config.gumroadMaxUses} devices).`,
          status: getLicenseStatus(),
        };
      }
      finalResult = claim;
    }

    const nowIso = new Date().toISOString();
    writePersistedLicense({
      tier: 'pro',
      isDemoPreview: false,
      licenseKey: normalizedKey,
      activatedAt: sameKeyOnThisMachine && existing?.activatedAt ? existing.activatedAt : nowIso,
      lastVerifiedAt: nowIso,
      buyerEmail: finalResult.buyerEmail,
      productName: finalResult.productName,
      saleId: finalResult.saleId,
      uses: finalResult.uses,
      subscriptionStatus: finalResult.subscriptionStatus,
      machineFingerprint,
      validationSource: 'gumroad',
    });

    const seatSummary =
      config.gumroadMaxUses > 0 && typeof finalResult.uses === 'number'
        ? ` (${finalResult.uses}/${config.gumroadMaxUses} devices used)`
        : '';

    return {
      ok: true,
      message: `Gumroad Pro license activated and bound to this workstation${seatSummary}.`,
      status: getLicenseStatus(),
    };
  }

  // 2. Custom external validation server (optional)
  if (config.licenseValidationUrl) {
    const remoteResult = await validateWithExternalEndpoint(normalizedKey, machineFingerprint);
    if (remoteResult.valid) {
      writePersistedLicense({
        tier: 'pro',
        isDemoPreview: false,
        licenseKey: normalizedKey,
        activatedAt: new Date().toISOString(),
        machineFingerprint,
        validationSource: 'remote-server',
      });
      return {
        ok: true,
        message: 'Pro license activated via remote validation server.',
        status: getLicenseStatus(),
      };
    }
    return {
      ok: false,
      message: remoteResult.reason || 'License key validation failed.',
      status: getLicenseStatus(),
    };
  }

  // 3. Local offline dev key format validation (only when neither Gumroad nor external server is configured)
  if (!LOCAL_PRO_KEY_REGEX.test(normalizedKey)) {
    return {
      ok: false,
      message:
        'Invalid license key format. Expected QASTUDIO-PRO-XXXX-XXXX (or configure GUMROAD_PRODUCT_ID in .env for Gumroad keys).',
      status: getLicenseStatus(),
    };
  }

  writePersistedLicense({
    tier: 'pro',
    isDemoPreview: false,
    licenseKey: normalizedKey,
    activatedAt: new Date().toISOString(),
    machineFingerprint,
    validationSource: 'local-key',
  });

  return {
    ok: true,
    message: 'Pro license activated and bound to this workstation.',
    status: getLicenseStatus(),
  };
}
