import fs from 'node:fs';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { config, ensureStudioDirectories } from '../config.js';
import type { AndroidVersion, RuntimeMode } from '../types.js';
import { clearAppData, installApkOnDevice } from '../services/deviceService.js';
import {
  clearStoredAuth,
  createGooglePkceStartUrl,
  deleteFirebaseProfile,
  downloadAndInstallFirebaseRelease,
  fetchFirebaseReleases,
  getFirebaseAuthStatus,
  handleGooglePkceCallback,
  listFirebaseProfiles,
  parseAndSaveFirebaseProfile,
  saveServiceAccountAuth,
  selectFirebaseProfile,
} from '../services/firebaseService.js';
import { activateLicense, getLicenseStatus, reverifyLicense } from '../services/licenseService.js';
import {
  getActiveSession,
  resolveRedroidImage,
  startSession,
  stopSession,
} from '../services/sessionService.js';
import {
  configureBinderSupport,
  configureKiriRuntime,
  listAdbDevices,
  runSystemCheck,
} from '../services/systemService.js';
import {
  deleteTestReport,
  deleteTestSuite,
  formatReportHtml,
  formatReportMarkdown,
  getTestReport,
  listTestReports,
  listTestSuites,
  runAutomatedTestSuite,
  saveTestSuite,
} from '../services/automationService.js';
import {
  convertFlowToMaestroYaml,
  deleteFlow,
  dumpUiHierarchy,
  listFlowRunReports,
  listFlows,
  recordCustomStep,
  recordTapAtCoords,
  runRecordedFlow,
  saveFlow,
} from '../services/automationRecorder.js';
import { getMaestroTemplates, runMaestroYaml } from '../services/maestroRunner.js';
import {
  exportBugReportBundle,
  getScreenRecordStatus,
  resolveExportZipPath,
  startScreenRecord,
  stopScreenRecord,
} from '../services/reportExporter.js';
import {
  getMitmproxyStatus,
  getWsScrcpyStatus,
  startContainerRuntime,
  startMitmproxyService,
  startWsScrcpyService,
  streamImagePullProgress,
} from '../services/provisionerService.js';
import { renderScreenViewerHtml } from '../services/screenStreamService.js';

ensureStudioDirectories();

const apkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureStudioDirectories();
    cb(null, config.paths.apkTmpDir);
  },
  filename: (_req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const apkUpload = multer({
  storage: apkStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // up to 500MB APK
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.apk')) {
      cb(null, true);
    } else {
      const err = new Error('Only .apk files are allowed.') as Error & { statusCode?: number };
      err.statusCode = 400;
      cb(err);
    }
  },
});

const serviceAccountUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
});

function requirePro(featureLabel: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const status = getLicenseStatus();
    if (!status.isPro) {
      const actionHint = status.reverifyRequired
        ? 'Your offline license grace window expired. Reconnect to the internet and re-verify your Gumroad license.'
        : status.demoProAllowed
          ? 'Activate a Pro license key or enable Demo Pro Preview.'
          : 'Activate a valid Gumroad Pro license key to unlock this feature.';
      res.status(403).json({
        error: `${featureLabel} is a Pro feature. ${actionHint}`,
        code: status.reverifyRequired ? 'PRO_LICENSE_REVERIFY_REQUIRED' : 'PRO_LICENSE_REQUIRED',
      });
      return;
    }
    next();
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeInlineScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function createApiRouter(): Router {
  const router = Router();

  // ==========================================================================
  // Health & System Check Wizard
  // ==========================================================================
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'local-web-qa-studio-orchestrator',
      port: config.port,
      mitmWebPort: config.mitmWebPort,
      wsScrcpyPort: config.wsScrcpyPort,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/system/check', async (_req, res, next) => {
    try {
      const report = await runSystemCheck();
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  router.get('/system/devices', async (_req, res, next) => {
    try {
      const devices = await listAdbDevices();
      res.json({ devices });
    } catch (err) {
      next(err);
    }
  });

  router.post('/system/runtime/configure', async (_req, res, next) => {
    try {
      const result = await configureKiriRuntime();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/system/binder/configure', async (_req, res, next) => {
    try {
      const result = await configureBinderSupport();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/system/start-container-runtime', async (_req, res, next) => {
    try {
      const result = await startContainerRuntime();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/system/pull-progress', async (req, res) => {
    const version = (typeof req.query.version === 'string' ? req.query.version : '14') as AndroidVersion;
    const image =
      typeof req.query.image === 'string' && req.query.image.trim()
        ? req.query.image.trim()
        : resolveRedroidImage(version);
    await streamImagePullProgress(image, res);
  });

  router.get('/system/mitmproxy/status', async (_req, res) => {
    res.json(await getMitmproxyStatus());
  });

  router.post('/system/mitmproxy/start', async (_req, res, next) => {
    try {
      const result = await startMitmproxyService();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/screen/viewer', (req, res) => {
    const serial = typeof req.query.serial === 'string' ? req.query.serial : getActiveSession().deviceSerial ?? undefined;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderScreenViewerHtml(serial));
  });

  router.get('/system/ws-scrcpy/status', async (_req, res) => {
    res.json(await getWsScrcpyStatus());
  });

  router.post('/system/ws-scrcpy/start', async (_req, res, next) => {
    try {
      const session = getActiveSession();
      const result = await startWsScrcpyService({
        mode: session.mode ?? undefined,
        containerName: session.containerName,
        serial: session.deviceSerial ?? undefined,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Commercial License Gate (Gumroad API v2 + Optional Local Dev Fallback)
  // ==========================================================================
  router.get('/license/status', (_req, res) => {
    res.json(getLicenseStatus());
  });

  router.post('/license/activate', async (req, res, next) => {
    try {
      const { licenseKey, demoPreview, deactivate } = req.body as {
        licenseKey?: string;
        demoPreview?: boolean;
        deactivate?: boolean;
      };
      const result = await activateLicense({ licenseKey, demoPreview, deactivate });
      res.status(result.statusCode ?? (result.ok ? 200 : 400)).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/license/verify', async (_req, res, next) => {
    try {
      const result = await reverifyLicense();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Session Lifecycle (Docker Redroid / Direct ADB)
  // ==========================================================================
  router.get('/session/status', (_req, res) => {
    res.json(getActiveSession());
  });

  router.post('/session/start', async (req, res, next) => {
    try {
      const { mode, androidVersion, deviceSerial, proxyHost } = req.body as {
        mode: RuntimeMode;
        androidVersion?: AndroidVersion;
        deviceSerial?: string;
        proxyHost?: string;
      };
      const session = await startSession({ mode, androidVersion, deviceSerial, proxyHost });
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  router.post('/session/stop', async (_req, res, next) => {
    try {
      const result = await stopSession();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Device Actions (Manual APK Install & Clear App Data)
  // ==========================================================================
  router.post('/device/install', apkUpload.single('apk'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No .apk file uploaded (form field name must be "apk").' });
        return;
      }
      const serial = typeof req.body?.deviceSerial === 'string' ? req.body.deviceSerial : undefined;
      const result = await installApkOnDevice(req.file.path, serial);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/device/clear', async (req, res, next) => {
    try {
      const { packageName, deviceSerial } = req.body as {
        packageName?: string;
        deviceSerial?: string;
      };
      if (!packageName) {
        res.status(400).json({ error: 'packageName is required.' });
        return;
      }
      const result = await clearAppData(packageName, deviceSerial);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Firebase Dual Authentication (Google OAuth PKCE & Service Account JSON)
  // ==========================================================================
  router.get('/auth/status', (_req, res) => {
    res.json(getFirebaseAuthStatus());
  });

  router.post('/auth/logout', (_req, res) => {
    clearStoredAuth();
    res.json({ ok: true, status: getFirebaseAuthStatus() });
  });

  router.get('/auth/google/start', (req, res, next) => {
    try {
      const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
      const redirectUri = `http://localhost:${config.port}/api/auth/google/callback`;
      const { authUrl, state } = createGooglePkceStartUrl({ clientId, redirectUri });

      if (req.query.redirect === 'true') {
        res.redirect(authUrl);
        return;
      }

      res.json({ authUrl, state, redirectUri });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/google/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;

    const result = await handleGooglePkceCallback({ code, state, error });
    const messagePayload = escapeInlineScriptJson({
      type: 'QA_STUDIO_FIREBASE_OAUTH',
      ok: result.ok,
      email: result.email ?? null,
      error: result.error ?? null,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>AirgapDroid — Google Authentication</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #141418; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 28px 32px; max-width: 420px; text-align: center; }
    h1 { font-size: 16px; margin: 0 0 8px; }
    p { font-size: 13px; color: #a1a1aa; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${result.ok ? 'Connected to Google' : 'Authentication Failed'}</h1>
    <p>${escapeHtml(
      result.ok
        ? `Signed in${result.email ? ` as ${result.email}` : ''}. You can close this window.`
        : result.error || 'Unknown error'
    )}</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage(${messagePayload}, '*');
    }
    setTimeout(() => window.close(), 1200);
  </script>
</body>
</html>`);
  });

  router.post(
    '/auth/service-account',
    serviceAccountUpload.single('file'),
    async (req, res, next) => {
      try {
        let rawCredential: string | Record<string, unknown> | undefined;
        if (req.file) {
          rawCredential = req.file.buffer.toString('utf8');
        } else if (req.body?.serviceAccountJson) {
          rawCredential = req.body.serviceAccountJson as string | Record<string, unknown>;
        } else if (req.body && typeof req.body === 'object' && req.body.type === 'service_account') {
          rawCredential = req.body as Record<string, unknown>;
        }

        if (!rawCredential) {
          res.status(400).json({
            error: 'Provide a Service Account JSON file or paste JSON into serviceAccountJson.',
          });
          return;
        }

        const status = await saveServiceAccountAuth(rawCredential);
        res.json({ ok: true, status });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // Dynamic Firebase App Distribution Switcher (Free Tier)
  // ==========================================================================
  router.get('/firebase/profiles', (_req, res) => {
    res.json(listFirebaseProfiles());
  });

  router.post('/firebase/parse-url', async (req, res, next) => {
    try {
      const result = await parseAndSaveFirebaseProfile(req.body ?? {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/firebase/profiles/:id/select', (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const store = selectFirebaseProfile(id);
      res.json(store);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/firebase/profiles/:id', (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const store = deleteFirebaseProfile(id);
      res.json(store);
    } catch (err) {
      next(err);
    }
  });

  router.get('/firebase/releases', async (req, res, next) => {
    try {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
      const projectNumber =
        typeof req.query.projectNumber === 'string' ? req.query.projectNumber : undefined;
      const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;

      const data = await fetchFirebaseReleases({ profileId, projectNumber, appId });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/firebase/install', async (req, res, next) => {
    try {
      const { binaryDownloadUri, displayVersion, buildVersion, deviceSerial, autoRunFlowId } =
        req.body as {
          binaryDownloadUri?: string;
          displayVersion?: string;
          buildVersion?: string;
          deviceSerial?: string;
          autoRunFlowId?: string;
        };

      if (!binaryDownloadUri) {
        res.status(400).json({ error: 'binaryDownloadUri is required.' });
        return;
      }

      const result = await downloadAndInstallFirebaseRelease({
        binaryDownloadUri,
        displayVersion,
        buildVersion,
        deviceSerial,
      });

      let autoRunReport = null;
      if (autoRunFlowId?.trim() && getLicenseStatus().isPro) {
        autoRunReport = await runRecordedFlow({
          flowId: autoRunFlowId.trim(),
          deviceSerial: result.serial,
        });
      }

      res.json({ ...result, autoRunReport });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Automated Testing: No-Code Visual Recorder & Replay (Pro Feature)
  // ==========================================================================
  router.get('/automation/hierarchy', requirePro('Visual Test Recorder'), async (req, res, next) => {
    try {
      const serial = typeof req.query.deviceSerial === 'string' ? req.query.deviceSerial : undefined;
      const nodes = await dumpUiHierarchy(serial);
      res.json({ nodes });
    } catch (err) {
      next(err);
    }
  });

  router.post('/automation/record-tap', requirePro('Visual Test Recorder'), async (req, res, next) => {
    try {
      const { x, y, deviceSerial } = req.body as {
        x?: number;
        y?: number;
        deviceSerial?: string;
      };
      if (typeof x !== 'number' || typeof y !== 'number') {
        res.status(400).json({ error: 'Numeric x and y coordinates are required.' });
        return;
      }
      const result = await recordTapAtCoords({ x, y, deviceSerial });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/automation/record-step', requirePro('Visual Test Recorder'), async (req, res, next) => {
    try {
      const step = await recordCustomStep(req.body ?? {});
      res.json({ step });
    } catch (err) {
      next(err);
    }
  });

  router.get('/automation/flows', requirePro('Automated Testing'), (_req, res) => {
    res.json({ flows: listFlows() });
  });

  router.post('/automation/flows', requirePro('Automated Testing'), (req, res, next) => {
    try {
      const flow = saveFlow(req.body ?? {});
      res.json({ ok: true, flow, flows: listFlows() });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/automation/flows/:id', requirePro('Automated Testing'), (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({ ok: true, flows: deleteFlow(id) });
  });

  router.post('/automation/export-yaml', requirePro('Automated Testing'), (req, res) => {
    const { appId, steps } = req.body as { appId?: string; steps?: never[] };
    const yaml = convertFlowToMaestroYaml({ appId, steps: steps ?? [] });
    res.json({ yaml });
  });

  router.post('/automation/run-flow', requirePro('Automated Testing'), async (req, res, next) => {
    try {
      const report = await runRecordedFlow(req.body ?? {});
      res.json({ ok: true, report });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Maestro YAML Studio & Runner (Pro Feature)
  // ==========================================================================
  router.get('/automation/templates', requirePro('Maestro YAML Studio'), (_req, res) => {
    res.json({ templates: getMaestroTemplates() });
  });

  router.post('/automation/run-yaml', requirePro('Maestro YAML Studio'), async (req, res, next) => {
    try {
      const result = await runMaestroYaml(req.body ?? {});
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Screen Recording (.mp4) & Automated Bug Report Exporter (Pro Feature)
  // ==========================================================================
  router.get('/automation/screenrecord/status', requirePro('Screen Recording'), (_req, res) => {
    res.json(getScreenRecordStatus());
  });

  router.post('/automation/screenrecord/start', requirePro('Screen Recording'), async (req, res, next) => {
    try {
      const serial = typeof req.body?.deviceSerial === 'string' ? req.body.deviceSerial : undefined;
      const result = await startScreenRecord(serial);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/automation/screenrecord/stop', requirePro('Screen Recording'), async (_req, res, next) => {
    try {
      const result = await stopScreenRecord();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports/runs', requirePro('QA Reporting'), (_req, res) => {
    res.json({ runs: listFlowRunReports() });
  });

  router.get('/reports/screenshots/:fileName', requirePro('QA Reporting'), (req, res) => {
    const raw = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
    const safe = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '');
    const target = path.join(config.paths.reportsDir, 'screenshots', safe);
    if (!fs.existsSync(target)) {
      res.status(404).json({ error: 'Screenshot not found.' });
      return;
    }
    res.sendFile(target);
  });

  router.post('/reports/export', requirePro('QA Reporting'), async (req, res, next) => {
    try {
      const exported = await exportBugReportBundle(req.body ?? {});
      res.json(exported);
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports/download/:reportId', requirePro('QA Reporting'), (req, res) => {
    const raw = Array.isArray(req.params.reportId) ? req.params.reportId[0] : req.params.reportId;
    const zipPath = resolveExportZipPath(raw);
    if (!zipPath) {
      res.status(404).json({ error: 'Bug report archive not found.' });
      return;
    }
    res.download(zipPath, path.basename(zipPath));
  });

  // Legacy suites/reports endpoints preserved for compatibility
  router.get('/automation/suites', requirePro('Automated Testing'), (_req, res) => {
    res.json({ suites: listTestSuites() });
  });

  router.post('/automation/suites', requirePro('Automated Testing'), (req, res, next) => {
    try {
      const saved = saveTestSuite(req.body ?? {});
      res.json({ ok: true, suite: saved, suites: listTestSuites() });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/automation/suites/:id', requirePro('Automated Testing'), (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({ ok: true, suites: deleteTestSuite(id) });
  });

  router.post('/automation/run', requirePro('Automated Testing'), async (req, res, next) => {
    try {
      const report = await runAutomatedTestSuite(req.body ?? {});
      res.json({ ok: true, report });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports', requirePro('QA Reporting'), (_req, res) => {
    res.json({ reports: listTestReports() });
  });

  router.get('/reports/:id/export', requirePro('QA Reporting'), (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const format = typeof req.query.format === 'string' ? req.query.format : 'markdown';
    const report = getTestReport(id);
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${report.id}.json"`);
      res.json(report);
      return;
    }

    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.id}.html"`);
      res.send(formatReportHtml(report));
      return;
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.id}.md"`);
    res.send(formatReportMarkdown(report));
  });

  router.delete('/reports/:id', requirePro('QA Reporting'), (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({ ok: deleteTestReport(id), reports: listTestReports() });
  });

  return router;
}
