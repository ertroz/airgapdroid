# AirgapDroid

Alternatif ringan dan 100% lokal (`localhost`) pengganti Android Studio Emulator (AVD) dan BrowserStack, dilengkapi antarmuka web modern, Live HTTPS Network Inspector, Dynamic Firebase App Distribution Switcher, dan WebSocket Error Logcat.

## Arsitektur Monorepo

```text
local-web-qa-studio/
├── package.json                  # npm workspaces root + concurrently dev scripts
├── docker-compose.yml            # ws-scrcpy (:8000) & mitmweb (proxy :8080, UI :8082)
├── .env.example                  # Konfigurasi environment opsional
├── scripts/
│   └── setup-certs.sh            # Generator & konverter CA mitmproxy -> <subject_hash_old>.0
└── packages/
    ├── orchestrator/             # Node.js + TypeScript + Express + ws (Port 4000)
    └── web-ui/                   # React + TypeScript + Vite + Tailwind + Lucide (Port 3000)
```

> **Catatan Port:** `mitmweb` berjalan di port **`8082`** (bukan `8081`) agar tidak pernah bentrok dengan **React Native Metro Bundler (`8081`)**.

---

## Prasyarat

- **Node.js** `>= 20` & **npm** `>= 10`
- **ADB** (`android-tools-adb` / `android-platform-tools`) tersedia di `PATH`
- **OpenSSL** untuk konversi sertifikat CA Android (`<subject_hash_old>.0`)
- **Kiri** ([libracoder/kiri](https://github.com/libracoder/kiri) atau fork custom Anda dengan kernel `CONFIG_ANDROID_BINDERFS=y`) sebagai runtime container utama yang super ringan (~15 MB RAM), dengan fallback otomatis ke Docker bila tersedia.

---

## Cara Menjalankan (Development Mode)

### 1. Install dependensi monorepo
```bash
npm install
```

### 2. Salin & atur konfigurasi environment (opsional)
```bash
cp .env.example .env
```
Atur `KIRI_FORK_REPO=<username-anda>/kiri` (dan `KIRI_BINARY` jika nama binary fork Anda diubah) agar tombol installer di System Check Wizard langsung mengarah ke GitHub Releases fork Anda.

### 3. Cek / install runtime Kiri
```bash
npm run runtime:install
```

### 4. Generate & konversi sertifikat CA `mitmproxy` untuk Android
```bash
npm run certs:setup
```
Script ini akan membuat/mengonversi CA `mitmproxy` menjadi file `<subject_hash_old>.0` di `./certs/` dan `~/.qa-studio/certs/`. Orchestrator otomatis menyuntikkannya ke `/system/etc/security/cacerts/` (permission `644`) pada perangkat berakses root seperti Redroid.

### 5. Jalankan infrastruktur pendukung (`ws-scrcpy` & `mitmweb`)
```bash
npm run infra:up
```
*(Otomatis memakai `kiri compose up -d` jika Kiri tersedia, atau fallback ke `docker compose up -d`.)*
- `ws-scrcpy`: `http://localhost:8000`
- `mitmproxy` HTTP/HTTPS proxy: `localhost:8080`
- `mitmweb` UI: `http://localhost:8082`

### 6. Jalankan Orchestrator (Port 4000) & Web UI (Port 3000)
```bash
npm run dev
```
Buka **`http://localhost:3000`** di browser Anda.

---

## Fitur Utama

1. **System Check Wizard & Hybrid Runtime Detector (`GET /api/system/check`)**
   - Mendeteksi OS (`linux`, `win32`, `darwin`, WSL2), ketersediaan Docker, modul kernel `binder` & `ashmem`, ADB & daftar perangkat fisik, serta kesiapan sertifikat CA.
   - Otomatis merekomendasikan `docker` (Linux/WSL2) atau `direct-adb` (macOS/Windows/HP fisik).
2. **Session Lifecycle & Otomasi Developer (`POST /api/session/start` & `/stop`)**
   - Menjalankan container Redroid (`Android 11 / 12 / 13 / 14`) dengan `androidboot.redroid_gpu_mode=guest`, `1080x1920`, `420 DPI`, atau attach ke perangkat fisik ADB.
   - Otomatis menjalankan `adb reverse tcp:8081 tcp:8081` (React Native Fast Refresh), menyuntikkan global HTTP proxy (`:8080`), dan push sertifikat CA sistem (`chmod 644`) jika rooted.
   - Saat **Stop**: mereset global proxy ke `:0`, disconnect ADB, dan menghapus container Redroid agar RAM kembali bersih.
3. **Dynamic Firebase App Distribution Switcher (`/api/firebase/*` & `/api/auth/*`)**
   - Parser dinamis URL rilis Firebase Console maupun input manual `Project Number` + `Firebase App ID`, tersimpan di `~/.qa-studio/firebase-profiles.json`.
   - Dual Auth: **Google OAuth 2.0 PKCE** (Desktop client tanpa `client_secret`, token terenkripsi AES-256-GCM) & **Service Account JSON** (RS256 JWT assertion).
   - 1-Click download `.apk` ke `/tmp/qa-apks/` dan instal langsung via `adb install -r -d`.
4. **Device Actions & Real-Time Error Logcat**
   - Drag-and-drop manual `.apk` (`POST /api/device/install`), reset state aplikasi (`POST /api/device/clear`), serta WebSocket `ws://localhost:4000/ws/logcat` (`adb logcat *:E`) dengan filter, auto-scroll, dan tombol Copy Stack Trace.
5. **Commercial License Gate (`GET /api/license/status` & `POST /api/license/activate`)**
   - **Free Tier**: Android 13, upload APK lokal, `ws-scrcpy`, dan Live Logcat.
   - **Pro Tier** (`QASTUDIO-PRO-XXXX-XXXX` atau endpoint validasi eksternal `LICENSE_VALIDATION_URL`): membuka Android 11/12/14, Live HTTPS Network Inspector (`mitmweb`), dan Dynamic Firebase App Distribution.
   - Dilengkapi mode **Demo Pro Preview** untuk pengujian cepat selama development.
