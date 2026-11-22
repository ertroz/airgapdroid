# AirgapDroid Landing Page (`@qa-studio/landing`)

Standalone static Vite + React + Tailwind landing page for **AirgapDroid**, isolated from `@qa-studio/web-ui` so desktop builds (`packages/desktop`) remain unaffected.

## Local Development

```bash
npm run dev:landing
# http://localhost:3100
```

## Build Output

```bash
npm run build:landing
# Outputs static bundle to packages/landing/dist/
```

## Deploy to Cloudflare (Landing Page Only)

### Option 1: Cloudflare Pages / Workers Git Integration (Recommended)

Connect this repository in the Cloudflare Dashboard:

- **Framework preset**: `None` (or `Vite`)
- **Build command**: `npm run build:landing`
- **Build output directory**: `packages/landing/dist`
- **Root directory**: `/` (leave empty / repo root so npm workspaces resolve)
- **Node.js version**: Set `NODE_VERSION=22` in Environment Variables
- **Build watch paths** (so only landing changes trigger deploys): `packages/landing/**`

Optional build environment variables (see `.env.example`):
- `VITE_GITHUB_REPO` (e.g. `your-org/airgapdroid`)
- `VITE_RELEASE_VERSION` (e.g. `1.0.0`)
- `VITE_GUMROAD_URL` (your Gumroad Pro checkout URL)
- `VITE_KIRI_REPO` (default `libracoder/kiri`)

### Option 2: 1-Command CLI Deploy with Wrangler

Login once with `npx wrangler login`, then run from the monorepo root:

```bash
# Cloudflare Workers Static Assets (uses packages/landing/wrangler.jsonc)
npm run deploy:landing

# OR Cloudflare Pages
npm run deploy:landing:pages
```

### Option 3: GitHub Actions Auto-Deploy

The workflow `.github/workflows/deploy-landing-cloudflare.yml` triggers **only** when `packages/landing/**` changes on `main` (or via manual `workflow_dispatch`).

Add these repository secrets in **GitHub → Settings → Secrets and variables → Actions**:
- `CLOUDFLARE_API_TOKEN` (Token with `Workers Scripts: Edit` or `Cloudflare Pages: Edit`)
- `CLOUDFLARE_ACCOUNT_ID`
