export type Lang = 'id' | 'en';

export interface HotspotItem {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
}

export interface CopyDictionary {
  nav: {
    features: string;
    kiriMode: string;
    workbench: string;
    pricing: string;
    download: string;
    cta: string;
  };
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleAccent: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    metrics: Array<{ value: string; label: string }>;
    previewHint: string;
    inspectHotspotsOn: string;
    inspectHotspotsOff: string;
    hotspots: HotspotItem[];
  };
  kiri: {
    eyebrow: string;
    title: string;
    subtitle: string;
    whatIsTitle: string;
    whatIsBody: string;
    whyNotAvdTitle: string;
    benchmarks: Array<{
      engine: string;
      ram: string;
      boot: string;
      note: string;
      highlight?: boolean;
    }>;
    pipelineTitle: string;
    pipelineSubtitle: string;
    pipelineSteps: Array<{
      step: string;
      title: string;
      detail: string;
      code?: string;
    }>;
    comparisonTitle: string;
    kiriCard: {
      badge: string;
      title: string;
      subtitle: string;
      points: string[];
      bestFor: string;
    };
    directAdbCard: {
      badge: string;
      title: string;
      subtitle: string;
      points: string[];
      bestFor: string;
    };
    osNotesTitle: string;
    osNotes: Array<{
      os: string;
      mechanism: string;
      detail: string;
    }>;
  };
  workbench: {
    eyebrow: string;
    title: string;
    subtitle: string;
    groups: Array<{
      area: string;
      badge: string;
      title: string;
      description: string;
      items: Array<{
        name: string;
        tag: string;
        detail: string;
      }>;
    }>;
  };
  architecture: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ports: Array<{
      port: string;
      service: string;
      role: string;
    }>;
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    free: {
      name: string;
      price: string;
      period: string;
      description: string;
      cta: string;
      features: string[];
    };
    pro: {
      name: string;
      badge: string;
      price: string;
      period: string;
      description: string;
      cta: string;
      features: string[];
      licenseNote: string;
    };
  };
  download: {
    eyebrow: string;
    title: string;
    subtitle: string;
    recommendedBadge: string;
    downloadBtn: string;
    bundledLabel: string;
    selfHostTab: string;
    desktopTab: string;
    selfHostTitle: string;
    selfHostSubtitle: string;
    releaseNote: string;
    allReleasesBtn: string;
  };
  footer: {
    summary: string;
    builtFor: string;
  };
}

export const COPY: Record<Lang, CopyDictionary> = {
  id: {
    nav: {
      features: 'Fitur Workbench',
      kiriMode: 'Kiri Mode',
      workbench: 'Arsitektur',
      pricing: 'Free vs Pro',
      download: 'Download',
      cta: 'Unduh Desktop App',
    },
    hero: {
      eyebrow: '100% Lokal · Tanpa Cloud · Pengganti Android Studio AVD & BrowserStack',
      titleLine1: 'Studio QA Android Lokal.',
      titleAccent: 'Kiri Mode ~15 MB RAM.',
      subtitle:
        'Jalankan container Android 11–14 (Redroid) via Kiri Mode atau attach HP fisik lewat Direct ADB dalam satu workbench modern: Live Screen Stream, HTTPS Network Inspector, Firebase Builds Switcher, Automation Studio, dan Real-Time Error Logcat.',
      primaryCta: 'Unduh untuk',
      secondaryCta: 'Pelajari Kiri Mode',
      metrics: [
        { value: '~15 MB', label: 'RAM daemon Kiri Mode (vs 4–8 GB AVD)' },
        { value: 'Android 11–14', label: 'Redroid container + Direct ADB' },
        { value: ':8082', label: 'mitmweb anti-bentrok Metro :8081' },
        { value: '100% Local', label: 'Traffic & APK tidak keluar localhost' },
      ],
      previewHint:
        'Preview interaktif — klik tab Kiri Mode / Direct ADB, pindah tab panel kiri, atau aktifkan Pin Penjelasan.',
      inspectHotspotsOn: 'Sembunyikan Pin Penjelasan',
      inspectHotspotsOff: 'Lihat Penjelasan Tiap Bagian',
      hotspots: [
        {
          id: 'kiri-mode',
          number: 1,
          title: 'Kiri Mode vs Direct ADB Switcher',
          subtitle: 'Top-Left Runtime Selector',
          badge: 'Kiri-First Engine',
          description:
            'Kiri Mode menjalankan virtual Android (Redroid) di atas daemon Kiri (~15 MB RAM) lengkap dengan akses root & auto-inject sertifikat HTTPS. Jika ingin menguji di HP fisik USB/Wi-Fi, cukup geser ke Direct ADB — otomatis fallback ke Docker bila Kiri belum terpasang.',
        },
        {
          id: 'toolbar-tools',
          number: 2,
          title: 'Firebase Builds, Auto Test, Upload APK & System',
          subtitle: 'Top-Right Developer Utilities',
          badge: '1-Click QA Tools',
          description:
            'Tarik APK langsung dari Firebase App Distribution (OAuth PKCE / Service Account), jalankan suite Automation Testing, drag-and-drop APK lokal, reset data aplikasi (pm clear), kelola lisensi Pro, dan cek kesehatan kernel/ADB di System Check Wizard.',
        },
        {
          id: 'status-strip',
          number: 3,
          title: 'Auto-Configured Network & Metro Strip',
          subtitle: 'Live Session Telemetry',
          badge: 'Zero Manual ADB',
          description:
            'Saat Start ditekan, AirgapDroid otomatis menjalankan adb reverse tcp:8081 (React Native Fast Refresh), mengatur global HTTP proxy ke :8080, dan menyuntikkan sertifikat CA mitmproxy ke /system/etc/security/cacerts.',
        },
        {
          id: 'left-workbench',
          number: 4,
          title: 'Panel Kiri: Automation, Network Inspector & Reports',
          subtitle: 'Multi-Tab Workbench (58% Split)',
          badge: 'mitmweb :8082 + Maestro',
          description:
            'Tab Automation Studio untuk No-Code Visual Recorder & Maestro YAML; Tab Network Inspector (mitmweb port 8082 dengan quick filter All, XHR/API, JSON, POST/PUT, Errors & Domain); Tab Test Reports untuk riwayat PASS/FAIL dan export bug.',
        },
        {
          id: 'right-device',
          number: 5,
          title: 'Panel Kanan: Android Screen & Bug Exporter',
          subtitle: 'Live ws-scrcpy Stage (1080×1920)',
          badge: 'Record + Export .zip',
          description:
            'Streaming layar Android latensi rendah langsung di studio. Dilengkapi tombol Record Flow (klik layar jadi Smart Selector), Screen Record (.mp4), dan Export Bug Report (.zip + Markdown siap paste ke Jira/GitHub).',
        },
        {
          id: 'bottom-logcat',
          number: 6,
          title: 'Panel Bawah: Live Error Logcat (*:E)',
          subtitle: 'WebSocket Streaming Log',
          badge: 'ws://localhost:4000',
          description:
            'Menangkap adb logcat *:E secara real-time via WebSocket. Dilengkapi filter tag/stack trace, Auto-scroll, Clear, dan Copy Stack Trace 1-klik untuk debugging crash Android secara instan.',
        },
      ],
    },
    kiri: {
      eyebrow: 'Fokus Utama: Kiri Mode',
      title: 'Apa itu Kiri Mode? Kenapa Jauh Lebih Ringan dari AVD & Docker Desktop?',
      subtitle:
        'Di kiri atas toolbar terdapat tombol Kiri Mode — jantung dari AirgapDroid. Mode ini menjalankan OS Android penuh (Redroid) di dalam Linux container ultra-ringan menggunakan runtime Kiri.',
      whatIsTitle: 'Bagaimana Kiri Mode Bekerja?',
      whatIsBody:
        'Alih-alih membooting emulator QEMU berat seperti Android Studio AVD (4–8 GB RAM) atau VM Docker Desktop yang rakus memori, Kiri Mode memanfaatkan daemon Kiri (libracoder/kiri) yang hanya memakan ~15 MB RAM untuk menjalankan container Redroid Android 11, 12, 13, atau 14 pada 1080×1920 @ 420 DPI. Karena berjalan terisolasi dan memiliki akses root bawaan, AirgapDroid dapat menyuntikkan sertifikat CA HTTPS sistem secara otomatis tanpa root manual.',
      whyNotAvdTitle: 'Perbandingan Resource Runtime Lokal',
      benchmarks: [
        {
          engine: 'Kiri Mode (Redroid)',
          ram: '~15 MB daemon',
          boot: 'Hitungan detik',
          note: 'Ringan, root CA injection otomatis, cleanup total saat Stop.',
          highlight: true,
        },
        {
          engine: 'Docker Desktop + Redroid',
          ram: '1.5 – 2.5 GB idle VM',
          boot: '15 – 30 detik',
          note: 'Didukung sebagai fallback otomatis jika Kiri belum terinstall.',
        },
        {
          engine: 'Android Studio AVD',
          ram: '4 – 8 GB RAM',
          boot: '45 – 90+ detik',
          note: 'Berat di CPU/baterai, tidak ada built-in HTTPS inspector & bug exporter.',
        },
      ],
      pipelineTitle: 'Otomasi 6-Tahap Saat Klik "Start" di Kiri Mode',
      pipelineSubtitle:
        'Tidak perlu lagi mengetik perintah adb berulang kali. Orchestrator AirgapDroid mengorkestrasi seluruh pipeline ini secara otomatis:',
      pipelineSteps: [
        {
          step: '01',
          title: 'System Check & Auto-Binder Kernel',
          detail:
            'Memeriksa daemon Kiri dan dukungan kernel CONFIG_ANDROID_BINDERFS=y (binderfs & ashmem). Jika belum siap, System Check Wizard menyediakan perbaikan 1-klik sesuai OS.',
          code: 'kiri info · /dev/binderfs check',
        },
        {
          step: '02',
          title: 'Boot Container Redroid (Android 11–14)',
          detail:
            'Menjalankan image redroid/redroid dengan gpu_mode=guest, 1080×1920, 420 DPI (otomatis memilih varian 64only pada Apple Silicon M-series agar 100% kompatibel).',
          code: 'redroid/redroid:14.0.0_64only-latest',
        },
        {
          step: '03',
          title: 'Auto ADB Reverse untuk Metro (:8081)',
          detail:
            'Otomatis memetakan port React Native Metro Bundler sehingga Fast Refresh & Hot Reload langsung terhubung ke aplikasi.',
          code: 'adb reverse tcp:8081 tcp:8081',
        },
        {
          step: '04',
          title: 'Auto Global HTTP Proxy (:8080)',
          detail:
            'Mendeteksi IP host gateway Kiri/docker0 secara otomatis lalu mengatur global http_proxy ke mitmproxy (:8080).',
          code: 'settings put global http_proxy <host>:8080',
        },
        {
          step: '05',
          title: 'Auto System HTTPS CA Injection',
          detail:
            'Mengonversi sertifikat CA mitmproxy menjadi <subject_hash_old>.0 dan menyalinnya ke trust store sistem Android dengan permission 644.',
          code: '/system/etc/security/cacerts/<hash>.0 (644)',
        },
        {
          step: '06',
          title: 'Clean Teardown Saat Klik "Stop"',
          detail:
            'Mereset global HTTP proxy ke :0, memutus koneksi ADB, menghapus container Redroid, dan membebaskan RAM kembali bersih.',
          code: 'http_proxy :0 · container rm -f',
        },
      ],
      comparisonTitle: 'Pilih Mode Sesuai Kebutuhan: Kiri Mode vs Direct ADB',
      kiriCard: {
        badge: 'Virtual Container · Default Linux/macOS/WSL2',
        title: 'Kiri Mode (Redroid OS)',
        subtitle: 'Menjalankan emulator Android terisolasi tanpa butuh HP fisik.',
        points: [
          'Mendukung Android 14 (Free) & Multi-OS Android 11, 12, 13, 14 (Pro)',
          'Akses root bawaan → HTTPS CA Injection 100% otomatis untuk inspect SSL traffic',
          'Lingkungan selalu bersih & terisolasi per sesi QA (auto-cleanup saat Stop)',
          'Otomatis fallback ke Docker Mode jika Docker lebih dulu tersedia',
        ],
        bestFor: 'Cocok untuk: Regression QA lintas versi OS, debugging API HTTPS terenkripsi, dan CI/testing lokal tanpa kabel.',
      },
      directAdbCard: {
        badge: 'Real Device · USB / Wireless ADB',
        title: 'Direct ADB Mode',
        subtitle: 'Attach langsung ke HP Android fisik atau emulator yang sudah berjalan.',
        points: [
          'Deteksi instan seluruh perangkat di daftar ADB lengkap dengan serial & model',
          'Tetap mendapat Live Screen Mirroring (ws-scrcpy), Auto Metro :8081 & Proxy :8080',
          'Install APK dari Firebase Builds atau Upload APK lokal langsung ke HP fisik',
          'Auto-reset global proxy ke :0 saat sesi dihentikan agar koneksi HP kembali normal',
        ],
        bestFor: 'Cocok untuk: Pengujian hardware spesifik (kamera, GPS, biometrik, performa GPU nyata) di device fisik.',
      },
      osNotesTitle: 'Cara Kerja Kiri Mode di Setiap Sistem Operasi',
      osNotes: [
        {
          os: 'macOS (Apple Silicon & Intel)',
          mechanism: 'Kiri.app + KIRI_GUEST_DIR',
          detail:
            'AirgapDroid memasang binder-enabled Linux guest kernel di ~/.qa-studio/kiri-guest dan menyetel KIRI_GUEST_DIR lewat launchctl/PlistBuddy tanpa memodifikasi bundle Kiri.app, sehingga Apple Code Signature tetap valid.',
        },
        {
          os: 'Windows 10 / 11 (WSL2)',
          mechanism: 'Auto-Configure .wslconfig Kernel',
          detail:
            'Kiri berjalan di dalam WSL2. Tombol 1-Click Auto-Configure Binder otomatis mengunduh bzImage kernel dengan CONFIG_ANDROID_BINDERFS=y dan memperbarui %UserProfile%\\.wslconfig.',
        },
        {
          os: 'Linux Native',
          mechanism: 'binder_linux & ashmem_linux',
          detail:
            'Berjalan langsung di kernel host tanpa VM tambahan — performa I/O, boot container, dan FPS screen streaming paling cepat.',
        },
      ],
    },
    workbench: {
      eyebrow: 'Bedah Lengkap Setiap Bagian UI',
      title: 'Semua Panel & Tombol di Workbench Dijelaskan Secara Detail',
      subtitle:
        'Sesuai tampilan pada gambar sample App Live Workbench, seluruh tools QA dipadukan dalam satu layar terstruktur agar developer dan QA tidak perlu berpindah-pindah terminal.',
      groups: [
        {
          area: 'Panel Kiri (58%)',
          badge: '3 Tab Utama',
          title: 'Automation, Network Inspector & Test Reports',
          description: 'Pusat kontrol inspeksi jaringan, perekaman test otomatis, dan laporan eksekusi.',
          items: [
            {
              name: 'Network Inspector (mitmweb :8082)',
              tag: 'Free Tier',
              detail:
                'Menangkap seluruh request HTTP/HTTPS dari aplikasi. Dilengkapi toolbar filter cepat (All, XHR / API, JSON, POST / PUT, Errors), input filter Domain (misal api.example.com), tab mitmweb (File, Capture, Flow List, Options), Search, Highlight, dan Intercept/Resume All untuk memodifikasi payload live.',
            },
            {
              name: 'Automation Studio — No-Code & Maestro YAML',
              tag: 'Pro Tier',
              detail:
                'Dua mode sekaligus: Visual Recorder (klik layar Android untuk menghasilkan Smart Selector otomatis + input teks, assert visible, swipe, back) dan Maestro YAML Studio dengan template siap pakai, konversi 1-klik dari flow visual, serta live console streaming (Maestro CLI atau ADB Fallback).',
            },
            {
              name: 'Test Reports & Export .zip / Markdown',
              tag: 'Pro Tier',
              detail:
                'Menyimpan riwayat seluruh eksekusi Automation Flow lengkap dengan status PASS/FAIL per langkah, durasi milidetik, screenshot saat gagal, dan tombol Export .zip & Markdown.',
            },
          ],
        },
        {
          area: 'Panel Kanan (42%)',
          badge: 'Live Screen Stage',
          title: 'Android Screen Stream & Bug Capture',
          description: 'Tampilan interaktif perangkat Android 1080×1920 di atas stage canvas yang bersih.',
          items: [
            {
              name: 'Interactive Screen (ws-scrcpy :8000)',
              tag: 'Free Tier',
              detail:
                'Kontrol sentuh, klik, ketik keyboard, dan tombol navigasi Android (Back, Home, Recent, Power, Rotate) langsung dari desktop dengan indikator LIVE & serial target (misal 127.0.0.1:5555).',
            },
            {
              name: 'Record Flow & Screen Record (.mp4)',
              tag: 'Pro Tier',
              detail:
                'Record Flow mengaktifkan crosshair overlay untuk merekam langkah uji langsung dari layar. Screen Record (.mp4) merekam aktivitas sesi QA menjadi file video siap lampir.',
            },
            {
              name: '1-Click Export Bug Report',
              tag: 'Pro Tier',
              detail:
                'Membundel ringkasan bug dalam format Markdown (siap copy-paste ke Jira/Linear/GitHub), JSON langkah uji, screenshot, video .mp4, dan log error terakhir ke dalam satu arsip .zip.',
            },
          ],
        },
        {
          area: 'Toolbar Atas & Panel Bawah',
          badge: 'Utilities & Logcat',
          title: 'Distribusi Build, Reset Data & Real-Time Logcat',
          description: 'Alat bantu harian mobile engineer agar siklus install-debug-reset berjalan dalam hitungan detik.',
          items: [
            {
              name: 'Firebase Builds Switcher',
              tag: 'Free Tier',
              detail:
                'Dual Auth: Google OAuth 2.0 PKCE (token terenkripsi AES-256-GCM tanpa client_secret) atau Service Account JSON. Tempel URL rilis Firebase Console untuk parsing otomatis Project Number & App ID, simpan multi-profil, lalu 1-klik download & adb install -r -d.',
            },
            {
              name: 'Upload APK & Clear App Data',
              tag: 'Free Tier',
              detail:
                'Drag-and-drop file .apk lokal untuk instalasi instan, serta tombol Clear App Data (pm clear) untuk mengosongkan cache/login aplikasi tanpa uninstall.',
            },
            {
              name: 'Live Error Logcat (*:E) & System Check Wizard',
              tag: 'Free Tier',
              detail:
                'Drawer bawah men-stream error Logcat real-time via WebSocket dengan filter tag/stack trace, Auto-scroll, Clear, dan Copy Stack Trace. Tombol System memverifikasi status OS, Kiri/Docker, kernel binder, ADB, Maestro, dan sertifikat CA.',
            },
          ],
        },
      ],
    },
    architecture: {
      eyebrow: 'Arsitektur Port Zero-Conflict',
      title: 'Dirancang Khusus untuk React Native, Flutter & Native Android Developer',
      subtitle:
        'Setiap layanan berjalan pada port terisolasi di localhost. mitmweb sengaja ditempatkan di :8082 agar tidak pernah bentrok dengan React Native Metro Bundler (:8081).',
      ports: [
        { port: ':3000', service: 'Web UI / Desktop App', role: 'Antarmuka App Live Workbench (React + Tailwind / Tauri v2)' },
        { port: ':4000', service: 'QA Orchestrator API & WS', role: 'Mengelola sesi Kiri/Redroid, ADB, Logcat WS, Automation & Firebase' },
        { port: ':8000', service: 'ws-scrcpy Streamer', role: 'Video streaming layar Android & input touch interaktif via WebSocket' },
        { port: ':8080', service: 'mitmproxy HTTP/HTTPS', role: 'Proxy lalu lintas jaringan perangkat + injeksi sertifikat CA sistem' },
        { port: ':8081', service: 'Metro Bundler (Reversed)', role: 'Port khusus React Native Fast Refresh via adb reverse tcp:8081' },
        { port: ':8082', service: 'mitmweb Network UI', role: 'UI Network Inspector embedded di Panel Kiri (bebas bentrok :8081)' },
      ],
    },
    pricing: {
      eyebrow: 'Lisensi Transparan',
      title: 'Mulai Gratis Selamanya, Upgrade ke Pro Saat Butuh Otomasi',
      subtitle:
        'Fitur inti debugging harian (Android 14, Direct ADB, Network Inspector, Firebase Builds, dan Logcat) tersedia gratis tanpa batas waktu.',
      free: {
        name: 'Free Tier',
        price: '$0',
        period: 'Gratis selamanya · Lokal',
        description: 'Untuk developer & QA yang butuh emulator Android 14 ringan, inspeksi HTTPS, dan distribusi Firebase APK.',
        cta: 'Unduh Versi Gratis',
        features: [
          'Kiri Mode / Docker Mode — Android 14 (Redroid 1080×1920)',
          'Direct ADB Mode tanpa batas untuk semua HP fisik USB/Wi-Fi',
          'Live HTTPS Network Inspector (mitmweb :8082 + Quick Filters)',
          'Auto Metro :8081 Reverse, Global Proxy :8080 & System CA Injection',
          'Firebase App Distribution Switcher (OAuth PKCE & Service Account)',
          'Upload APK drag-and-drop, Clear App Data & Live Error Logcat (*:E)',
        ],
      },
      pro: {
        name: 'AirgapDroid Pro',
        badge: 'Commercial License',
        price: 'Pro Key',
        period: 'Gumroad License · Hingga 3 Perangkat',
        description: 'Untuk tim QA & engineer yang butuh pengujian multi-versi Android, test automation, dan bug report instan.',
        cta: 'Dapatkan Lisensi Pro',
        features: [
          'Semua fitur di Free Tier',
          'Multi-OS Switcher: Android 11, 12, 13, dan 14 di Kiri Mode',
          'Automation Studio: Visual No-Code Flow Recorder (Smart Selector)',
          'Maestro YAML Studio + konversi 1-klik & live execution console',
          'Screen Record (.mp4) & Test Reports dengan riwayat screenshot',
          '1-Click Export Bug Report (.zip + Markdown siap Jira/GitHub)',
        ],
        licenseNote: 'Mendukung offline grace period 7 hari dan aktivasi terenkripsi lokal (AES-256-GCM).',
      },
    },
    download: {
      eyebrow: 'Unduh AirgapDroid v1.0.0',
      title: 'Tersedia untuk macOS, Windows & Linux',
      subtitle:
        'Aplikasi desktop native (Tauri v2) sudah mempaketkan sidecar Orchestrator, Google ADB resmi, dan Screen Agent — tinggal install dan jalankan tanpa setup Node.js manual.',
      recommendedBadge: 'Direkomendasikan untuk OS Anda',
      downloadBtn: 'Unduh',
      bundledLabel: 'Sidecar Sudah Termasuk:',
      desktopTab: 'Native Desktop App (.dmg / .exe / .AppImage)',
      selfHostTab: 'Developer CLI / Self-Host (Monorepo)',
      selfHostTitle: 'Jalankan Langsung dari Source Code (Node.js ≥ 20)',
      selfHostSubtitle:
        'Cocok untuk kontributor atau tim yang ingin menjalankan Orchestrator & Web UI langsung di terminal lokal.',
      releaseNote: 'Semua installer resmi dikompilasi otomatis melalui GitHub Actions release matrix.',
      allReleasesBtn: 'Lihat Semua Rilis di GitHub',
    },
    footer: {
      summary:
        'AirgapDroid — Studio QA & emulator Android lokal yang ringan, cepat, dan menjaga seluruh traffic debugging tetap berada di localhost.',
      builtFor: 'Dibangun dengan Tauri v2, React, Node.js, Redroid & Kiri Runtime.',
    },
  },
  en: {
    nav: {
      features: 'Workbench',
      kiriMode: 'Kiri Mode',
      workbench: 'Architecture',
      pricing: 'Free vs Pro',
      download: 'Download',
      cta: 'Download App',
    },
    hero: {
      eyebrow: '100% Local · Zero Cloud · Lightweight Alternative to Android Studio AVD & BrowserStack',
      titleLine1: 'Local Android QA Studio.',
      titleAccent: 'Kiri Mode ~15 MB RAM.',
      subtitle:
        'Boot Android 11–14 containers (Redroid) with Kiri Mode or attach physical phones via Direct ADB inside one unified workbench: Live Screen Stream, HTTPS Network Inspector, Firebase Builds Switcher, Automation Studio, and Real-Time Error Logcat.',
      primaryCta: 'Download for',
      secondaryCta: 'Explore Kiri Mode',
      metrics: [
        { value: '~15 MB', label: 'Kiri Mode daemon RAM (vs 4–8 GB AVD)' },
        { value: 'Android 11–14', label: 'Redroid container + Direct ADB' },
        { value: ':8082', label: 'mitmweb isolated from Metro :8081' },
        { value: '100% Local', label: 'Traffic & APKs never leave localhost' },
      ],
      previewHint:
        'Interactive preview — switch between Kiri Mode / Direct ADB, explore left workbench tabs, or toggle Callout Pins.',
      inspectHotspotsOn: 'Hide Callout Pins',
      inspectHotspotsOff: 'Inspect UI Callouts',
      hotspots: [
        {
          id: 'kiri-mode',
          number: 1,
          title: 'Kiri Mode vs Direct ADB Switcher',
          subtitle: 'Top-Left Runtime Selector',
          badge: 'Kiri-First Engine',
          description:
            'Kiri Mode boots virtual Android (Redroid) on top of the ~15 MB Kiri daemon with built-in root access and automatic HTTPS CA injection. Switch to Direct ADB anytime to attach a physical USB/Wi-Fi phone — with automatic Docker fallback if Kiri is absent.',
        },
        {
          id: 'toolbar-tools',
          number: 2,
          title: 'Firebase Builds, Auto Test, Upload APK & System',
          subtitle: 'Top-Right Developer Utilities',
          badge: '1-Click QA Tools',
          description:
            'Pull builds directly from Firebase App Distribution (OAuth PKCE / Service Account), open automated test suites, drag-and-drop local APKs, wipe app data (pm clear), manage Pro license, and inspect host kernel/ADB health via System Check Wizard.',
        },
        {
          id: 'status-strip',
          number: 3,
          title: 'Auto-Configured Network & Metro Strip',
          subtitle: 'Live Session Telemetry',
          badge: 'Zero Manual ADB',
          description:
            'Clicking Start automatically runs adb reverse tcp:8081 (React Native Fast Refresh), injects global HTTP proxy (:8080), and pushes the mitmproxy CA certificate into /system/etc/security/cacerts.',
        },
        {
          id: 'left-workbench',
          number: 4,
          title: 'Left Panel: Automation, Network Inspector & Reports',
          subtitle: 'Multi-Tab Workbench (58% Split)',
          badge: 'mitmweb :8082 + Maestro',
          description:
            'Automation Studio for No-Code Visual Recorder & Maestro YAML; Network Inspector (embedded mitmweb :8082 with quick filters All, XHR/API, JSON, POST/PUT, Errors & Domain); Test Reports for PASS/FAIL step breakdowns and bug exports.',
        },
        {
          id: 'right-device',
          number: 5,
          title: 'Right Panel: Android Screen & Bug Exporter',
          subtitle: 'Live ws-scrcpy Stage (1080×1920)',
          badge: 'Record + Export .zip',
          description:
            'Low-latency interactive Android screen stream directly inside the workbench. Includes Record Flow (Smart Selector overlay), Screen Record (.mp4), and 1-click Export Bug Report (.zip + Jira/GitHub-ready Markdown).',
        },
        {
          id: 'bottom-logcat',
          number: 6,
          title: 'Bottom Panel: Live Error Logcat (*:E)',
          subtitle: 'WebSocket Log Streaming',
          badge: 'ws://localhost:4000',
          description:
            'Streams adb logcat *:E in real time over WebSocket with instant tag/stack-trace search, Auto-scroll, Clear, and 1-click Copy Stack Trace.',
        },
      ],
    },
    kiri: {
      eyebrow: 'Deep Dive: Kiri Mode',
      title: 'What is Kiri Mode & Why Does It Crush AVD & Docker Desktop?',
      subtitle:
        'Located at the top-left of the toolbar, Kiri Mode is the core container engine of AirgapDroid — running full Redroid Android OS containers on an ultra-slim ~15 MB daemon.',
      whatIsTitle: 'How Kiri Mode Works Under the Hood',
      whatIsBody:
        'Instead of booting a 4–8 GB QEMU emulator (Android Studio AVD) or keeping a memory-hungry Docker Desktop VM alive, Kiri Mode leverages the Kiri runtime (libracoder/kiri, ~15 MB RAM) to spin up Redroid Android 11, 12, 13, or 14 containers at 1080×1920 @ 420 DPI. Because Redroid runs rooted in an isolated Linux namespace, AirgapDroid automatically injects the mitmproxy system CA certificate so encrypted HTTPS traffic inspection works out of the box.',
      whyNotAvdTitle: 'Local Runtime Resource Comparison',
      benchmarks: [
        {
          engine: 'Kiri Mode (Redroid)',
          ram: '~15 MB daemon',
          boot: 'Seconds',
          note: 'Ultra-lightweight, automatic root HTTPS CA injection, clean teardown on Stop.',
          highlight: true,
        },
        {
          engine: 'Docker Desktop + Redroid',
          ram: '1.5 – 2.5 GB idle VM',
          boot: '15 – 30 sec',
          note: 'Automatically supported as fallback when Kiri is not installed.',
        },
        {
          engine: 'Android Studio AVD',
          ram: '4 – 8 GB RAM',
          boot: '45 – 90+ sec',
          note: 'Heavy CPU/battery drain, no built-in HTTPS inspector or bug packager.',
        },
      ],
      pipelineTitle: '6-Stage Automation Pipeline When You Click "Start"',
      pipelineSubtitle:
        'No more repeating manual adb commands every morning. The AirgapDroid orchestrator executes all six steps automatically:',
      pipelineSteps: [
        {
          step: '01',
          title: 'System Check & Auto-Binder Kernel',
          detail:
            'Verifies the Kiri daemon and CONFIG_ANDROID_BINDERFS=y kernel support. If missing, the System Check Wizard offers 1-click OS-specific remediation.',
          code: 'kiri info · /dev/binderfs check',
        },
        {
          step: '02',
          title: 'Boot Redroid Container (Android 11–14)',
          detail:
            'Launches redroid/redroid with guest GPU mode, 1080×1920 @ 420 DPI (automatically selects 64only images on Apple Silicon ARM64 Macs).',
          code: 'redroid/redroid:14.0.0_64only-latest',
        },
        {
          step: '03',
          title: 'Auto ADB Reverse for Metro (:8081)',
          detail:
            'Automatically forwards React Native Metro Bundler so Fast Refresh and Hot Reload connect immediately.',
          code: 'adb reverse tcp:8081 tcp:8081',
        },
        {
          step: '04',
          title: 'Auto Global HTTP Proxy (:8080)',
          detail:
            'Resolves the Kiri/docker0 host gateway IP automatically and routes all Android HTTP/HTTPS traffic through mitmproxy (:8080).',
          code: 'settings put global http_proxy <host>:8080',
        },
        {
          step: '05',
          title: 'Auto System HTTPS CA Injection',
          detail:
            'Converts the mitmproxy CA into <subject_hash_old>.0 and installs it into Android system trust store with chmod 644.',
          code: '/system/etc/security/cacerts/<hash>.0 (644)',
        },
        {
          step: '06',
          title: 'Clean Teardown on "Stop"',
          detail:
            'Resets global proxy back to :0, disconnects ADB, removes the Redroid container, and returns RAM back to zero.',
          code: 'http_proxy :0 · container rm -f',
        },
      ],
      comparisonTitle: 'Two Modes, One Unified Workflow: Kiri Mode vs Direct ADB',
      kiriCard: {
        badge: 'Virtual Container · Linux / macOS / WSL2',
        title: 'Kiri Mode (Redroid OS)',
        subtitle: 'Spin up isolated virtual Android devices with zero physical hardware required.',
        points: [
          'Supports Android 14 (Free) & Multi-OS Android 11, 12, 13, 14 (Pro)',
          'Rooted container → 100% automatic HTTPS System CA injection for SSL inspection',
          'Fresh, isolated QA environment per session (auto-cleaned on Stop)',
          'Automatic Docker Mode fallback if Docker Engine is already running',
        ],
        bestFor: 'Best for: Multi-OS regression QA, encrypted HTTPS API debugging, and cable-free local testing.',
      },
      directAdbCard: {
        badge: 'Real Device · USB / Wireless ADB',
        title: 'Direct ADB Mode',
        subtitle: 'Attach directly to any physical Android phone or existing emulator over ADB.',
        points: [
          'Instant discovery of connected ADB devices with serial, model & readiness state',
          'Includes Live Screen Stream (ws-scrcpy), Auto Metro :8081 & Global Proxy :8080',
          '1-click APK install from Firebase Builds or local drag-and-drop Upload APK',
          'Automatically resets global HTTP proxy to :0 on Stop so the phone works normally',
        ],
        bestFor: 'Best for: Hardware-specific testing (camera, GPS, biometrics, real GPU performance) on physical phones.',
      },
      osNotesTitle: 'How Kiri Mode Adapts to Every Host OS',
      osNotes: [
        {
          os: 'macOS (Apple Silicon & Intel)',
          mechanism: 'Kiri.app + KIRI_GUEST_DIR',
          detail:
            'Installs a binder-enabled guest kernel into ~/.qa-studio/kiri-guest and configures KIRI_GUEST_DIR via launchctl/PlistBuddy without altering Kiri.app, keeping Apple code signatures intact.',
        },
        {
          os: 'Windows 10 / 11 (WSL2)',
          mechanism: 'Auto-Configure .wslconfig Kernel',
          detail:
            'Runs Kiri inside WSL2. The 1-Click Auto-Configure Binder button downloads a binderfs-enabled bzImage and updates %UserProfile%\\.wslconfig automatically.',
        },
        {
          os: 'Linux Native',
          mechanism: 'binder_linux & ashmem_linux',
          detail:
            'Runs directly on the host Linux kernel with zero VM overhead — delivering the fastest boot times and highest screen stream frame rates.',
        },
      ],
    },
    workbench: {
      eyebrow: 'Complete Feature Breakdown',
      title: 'Every Panel, Tab & Button Explained',
      subtitle:
        'Matching the App Live Workbench layout shown above, every daily mobile QA tool lives in one cohesive split-screen interface.',
      groups: [
        {
          area: 'Left Panel (58%)',
          badge: '3 Workbench Tabs',
          title: 'Automation, Network Inspector & Test Reports',
          description: 'Your command center for live HTTPS traffic inspection, test recording, and run diagnostics.',
          items: [
            {
              name: 'Network Inspector (mitmweb :8082)',
              tag: 'Free Tier',
              detail:
                'Inspects live HTTP/HTTPS payloads from the app. Includes quick filter presets (All, XHR / API, JSON, POST / PUT, Errors), Domain filter, mitmweb tabs (File, Capture, Flow List, Options), Search, Highlight, and live Request Intercept / Resume All.',
            },
            {
              name: 'Automation Studio — No-Code & Maestro YAML',
              tag: 'Pro Tier',
              detail:
                'Two workflows in one: Visual Recorder (click directly on the Android screen to capture Smart Selectors + Input Text, Assert Visible, Swipe, Back) and Maestro YAML Studio with built-in templates, 1-click YAML export, and live console output.',
            },
            {
              name: 'Test Reports & Export .zip / Markdown',
              tag: 'Pro Tier',
              detail:
                'Stores full step-by-step execution history with PASS/FAIL badges, millisecond timings, failure screenshots, and 1-click .zip + Markdown export.',
            },
          ],
        },
        {
          area: 'Right Panel (42%)',
          badge: 'Live Screen Stage',
          title: 'Android Screen Stream & Bug Capture',
          description: 'Interactive 1080×1920 device bezel suspended on a clean studio stage.',
          items: [
            {
              name: 'Interactive Screen (ws-scrcpy :8000)',
              tag: 'Free Tier',
              detail:
                'Touch gestures, keyboard typing, and floating Android navigation/power controls with LIVE status indicator and active target serial (e.g., 127.0.0.1:5555).',
            },
            {
              name: 'Record Flow & Screen Record (.mp4)',
              tag: 'Pro Tier',
              detail:
                'Record Flow toggles a crosshair overlay to capture Smart Selector taps directly from the screen. Screen Record (.mp4) records the active session into an attachable video file.',
            },
            {
              name: '1-Click Export Bug Report',
              tag: 'Pro Tier',
              detail:
                'Packages a Jira/GitHub-ready Markdown summary, step JSON, failure screenshots, .mp4 screen recording, and recent Logcat errors into a single downloadable .zip.',
            },
          ],
        },
        {
          area: 'Top Toolbar & Bottom Drawer',
          badge: 'Utilities & Logcat',
          title: 'Build Distribution, State Reset & Real-Time Logcat',
          description: 'Essential mobile engineering utilities built to eliminate terminal context-switching.',
          items: [
            {
              name: 'Firebase Builds Switcher',
              tag: 'Free Tier',
              detail:
                'Dual Auth: Google OAuth 2.0 PKCE (AES-256-GCM encrypted token, no client_secret) or Service Account JSON. Paste a Firebase Console release URL to auto-parse Project Number & App ID, save multiple profiles, and 1-click install via adb install -r -d.',
            },
            {
              name: 'Upload APK & Clear App Data',
              tag: 'Free Tier',
              detail:
                'Drag-and-drop local .apk installation plus 1-click Clear App Data (pm clear) to reset app state between test scenarios without reinstalling.',
            },
            {
              name: 'Live Error Logcat (*:E) & System Check Wizard',
              tag: 'Free Tier',
              detail:
                'Bottom WebSocket panel streams adb logcat *:E with tag/stack-trace search, Auto-scroll, Clear, and Copy Stack Trace. The System button checks OS, Kiri/Docker, binder kernel modules, ADB, Maestro, and CA certs.',
            },
          ],
        },
      ],
    },
    architecture: {
      eyebrow: 'Zero-Conflict Port Architecture',
      title: 'Purpose-Built for React Native, Flutter & Native Android Workflows',
      subtitle:
        'Every local service runs on an isolated localhost port. mitmweb runs on :8082 specifically so it never collides with React Native Metro Bundler (:8081).',
      ports: [
        { port: ':3000', service: 'Web UI / Desktop App', role: 'App Live Workbench interface (React + Tailwind / Tauri v2)' },
        { port: ':4000', service: 'QA Orchestrator API & WS', role: 'Manages Kiri/Redroid sessions, ADB, Logcat WS, Automation & Firebase' },
        { port: ':8000', service: 'ws-scrcpy Streamer', role: 'Low-latency Android screen video & touch input WebSocket' },
        { port: ':8080', service: 'mitmproxy HTTP/HTTPS', role: 'Device traffic proxy + automatic Android system CA injection' },
        { port: ':8081', service: 'Metro Bundler (Reversed)', role: 'Reserved for React Native Fast Refresh via adb reverse tcp:8081' },
        { port: ':8082', service: 'mitmweb Network UI', role: 'Embedded Network Inspector in Left Panel (never conflicts with :8081)' },
      ],
    },
    pricing: {
      eyebrow: 'Simple Licensing',
      title: 'Free Forever for Core Debugging, Pro for Test Automation',
      subtitle:
        'Daily local QA essentials — Android 14, Direct ADB, Network Inspector, Firebase Builds, and Logcat — are completely free.',
      free: {
        name: 'Free Tier',
        price: '$0',
        period: 'Free forever · Local-first',
        description: 'For developers & QA engineers needing lightweight Android 14, HTTPS inspection, and Firebase APK switching.',
        cta: 'Download Free App',
        features: [
          'Kiri Mode / Docker Mode — Android 14 (Redroid 1080×1920)',
          'Unlimited Direct ADB Mode for physical USB/Wi-Fi devices',
          'Live HTTPS Network Inspector (mitmweb :8082 + Quick Filters)',
          'Auto Metro :8081 Reverse, Global Proxy :8080 & System CA Injection',
          'Firebase App Distribution Switcher (OAuth PKCE & Service Account)',
          'Drag-and-drop Upload APK, Clear App Data & Live Error Logcat (*:E)',
        ],
      },
      pro: {
        name: 'AirgapDroid Pro',
        badge: 'Commercial License',
        price: 'Pro Key',
        period: 'Gumroad License · Up to 3 Devices',
        description: 'For QA teams & engineers needing multi-OS Android testing, no-code/Maestro automation, and instant bug bundles.',
        cta: 'Get Pro License',
        features: [
          'Everything in Free Tier',
          'Multi-OS Switcher: Android 11, 12, 13, and 14 in Kiri Mode',
          'Automation Studio: Visual No-Code Flow Recorder (Smart Selector)',
          'Maestro YAML Studio + 1-click flow conversion & live execution console',
          'Screen Record (.mp4) & Test Reports with failure screenshots',
          '1-Click Export Bug Report (.zip + Jira/GitHub-ready Markdown)',
        ],
        licenseNote: 'Includes 7-day offline grace period and encrypted local activation (AES-256-GCM).',
      },
    },
    download: {
      eyebrow: 'Download AirgapDroid v1.0.0',
      title: 'Native Installers for macOS, Windows & Linux',
      subtitle:
        'Built with Tauri v2 and bundled with the Orchestrator sidecar, official Google ADB, and Screen Agent — install and launch immediately without setting up Node.js.',
      recommendedBadge: 'Recommended for your OS',
      downloadBtn: 'Download',
      bundledLabel: 'Bundled Sidecars:',
      desktopTab: 'Native Desktop App (.dmg / .exe / .AppImage)',
      selfHostTab: 'Developer CLI / Self-Host (Monorepo)',
      selfHostTitle: 'Run Directly from Source (Node.js ≥ 20)',
      selfHostSubtitle:
        'Ideal for contributors or teams running the Orchestrator & Web UI directly from their terminal.',
      releaseNote: 'All official installers are built cleanly via the GitHub Actions release matrix.',
      allReleasesBtn: 'View All Releases on GitHub',
    },
    footer: {
      summary:
        'AirgapDroid — Lightweight local Android QA & developer workbench keeping your traffic, builds, and logs 100% on localhost.',
      builtFor: 'Built with Tauri v2, React, Node.js, Redroid & Kiri Runtime.',
    },
  },
};
