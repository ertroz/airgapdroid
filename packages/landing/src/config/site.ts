export type PlatformId = 'macos' | 'windows' | 'linux';

const githubRepo = (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim() || 'airgapdroid/airgapdroid';
const appVersion = (import.meta.env.VITE_RELEASE_VERSION as string | undefined)?.trim() || '1.0.0';
const releaseTag = `v${appVersion}`;
const gumroadUrl = (import.meta.env.VITE_GUMROAD_URL as string | undefined)?.trim() || 'https://gumroad.com';
const kiriRepo = (import.meta.env.VITE_KIRI_REPO as string | undefined)?.trim() || 'libracoder/kiri';

export const SITE_CONFIG = {
  appName: 'AirgapDroid',
  tagline: 'App Live Workbench',
  version: appVersion,
  releaseTag,
  githubRepo,
  githubUrl: `https://github.com/${githubRepo}`,
  releasesBaseUrl: `https://github.com/${githubRepo}/releases/download/${releaseTag}`,
  releasesLatestUrl: `https://github.com/${githubRepo}/releases/latest`,
  kiriUrl: `https://github.com/${kiriRepo}`,
  gumroadUrl,
} as const;

export interface PlatformDownloadSpec {
  id: PlatformId;
  name: string;
  archBadge: string;
  minOs: string;
  primaryFormat: string;
  primaryFileName: string;
  primaryUrl: string;
  secondaryFormat: string;
  secondaryFileName: string;
  secondaryUrl: string;
  bundledSidecars: string[];
  kiriSupportNote: {
    id: string;
    en: string;
  };
}

export const PLATFORM_DOWNLOADS: PlatformDownloadSpec[] = [
  {
    id: 'macos',
    name: 'macOS',
    archBadge: 'Universal (Apple Silicon & Intel)',
    minOs: 'macOS 13.0+ (Ventura / Sonoma / Sequoia)',
    primaryFormat: 'Universal .dmg',
    primaryFileName: `AirgapDroid_${appVersion}_universal.dmg`,
    primaryUrl: `${SITE_CONFIG.releasesBaseUrl}/AirgapDroid_${appVersion}_universal.dmg`,
    secondaryFormat: 'Releases Page',
    secondaryFileName: 'All macOS builds',
    secondaryUrl: SITE_CONFIG.releasesLatestUrl,
    bundledSidecars: ['qa-orchestrator (universal)', 'Google ADB (darwin)', 'qa-screen-agent.jar'],
    kiriSupportNote: {
      id: 'Kiri Mode berjalan via Kiri.app + 1-click KIRI_GUEST_DIR binder kernel (signature Apple tetap utuh). Direct ADB langsung aktif via USB/Wi-Fi.',
      en: 'Kiri Mode runs via Kiri.app + 1-click KIRI_GUEST_DIR binder kernel (keeps Apple signature intact). Direct ADB works immediately over USB/Wi-Fi.',
    },
  },
  {
    id: 'windows',
    name: 'Windows',
    archBadge: '64-bit (x86_64)',
    minOs: 'Windows 10 / 11 (x64)',
    primaryFormat: 'Installer (.exe)',
    primaryFileName: `AirgapDroid_${appVersion}_x64-setup.exe`,
    primaryUrl: `${SITE_CONFIG.releasesBaseUrl}/AirgapDroid_${appVersion}_x64-setup.exe`,
    secondaryFormat: 'MSI Package (.msi)',
    secondaryFileName: `AirgapDroid_${appVersion}_x64_en-US.msi`,
    secondaryUrl: `${SITE_CONFIG.releasesBaseUrl}/AirgapDroid_${appVersion}_x64_en-US.msi`,
    bundledSidecars: ['qa-orchestrator.exe', 'Google ADB (win32)', 'qa-screen-agent.jar'],
    kiriSupportNote: {
      id: 'Kiri Mode berjalan mulus via WSL2 dengan tombol 1-click Auto-Configure Binder (.wslconfig kernel). Direct ADB mendukung HP fisik Windows langsung.',
      en: 'Kiri Mode runs via WSL2 with 1-click Auto-Configure Binder (.wslconfig kernel). Direct ADB works natively on Windows USB devices.',
    },
  },
  {
    id: 'linux',
    name: 'Linux',
    archBadge: '64-bit (x86_64)',
    minOs: 'Ubuntu 22.04+, Debian, Fedora, Arch',
    primaryFormat: 'AppImage (.AppImage)',
    primaryFileName: `AirgapDroid_${appVersion}_amd64.AppImage`,
    primaryUrl: `${SITE_CONFIG.releasesBaseUrl}/AirgapDroid_${appVersion}_amd64.AppImage`,
    secondaryFormat: 'Debian / Ubuntu (.deb)',
    secondaryFileName: `AirgapDroid_${appVersion}_amd64.deb`,
    secondaryUrl: `${SITE_CONFIG.releasesBaseUrl}/AirgapDroid_${appVersion}_amd64.deb`,
    bundledSidecars: ['qa-orchestrator (x64)', 'Google ADB (linux)', 'qa-screen-agent.jar'],
    kiriSupportNote: {
      id: 'Performa native Kiri Mode tercepat dengan modul kernel binder_linux / ashmem_linux. Mendukung fallback Docker Engine tanpa konfigurasi tambahan.',
      en: 'Fastest native Kiri Mode performance with binder_linux / ashmem_linux kernel modules. Automatic Docker Engine fallback supported.',
    },
  },
];

export function detectVisitorPlatform(): PlatformId {
  if (typeof navigator === 'undefined') return 'macos';
  const ua = `${navigator.userAgent} ${(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? ''}`.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux') && !ua.includes('android')) return 'linux';
  return 'macos';
}
