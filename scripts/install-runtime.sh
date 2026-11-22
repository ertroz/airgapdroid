#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# AirgapDroid — Kiri Runtime Checker & Fork Installer
# 1. Checks if Kiri (or your renamed fork binary) is already installed.
# 2. If installed, ensures engine/context is configured.
# 3. If missing, downloads the latest release from KIRI_FORK_REPO on GitHub.
# ==============================================================================

KIRI_BIN="${KIRI_BINARY:-kiri}"
FORK_REPO="${KIRI_FORK_REPO:-libracoder/kiri}"
RELEASES_API="https://api.github.com/repos/${FORK_REPO}/releases/latest"
RELEASES_WEB="https://github.com/${FORK_REPO}/releases/latest"

echo "============================================================"
echo " AirgapDroid — Kiri Container Runtime Setup"
echo "   Binary    : ${KIRI_BIN}"
echo "   Fork Repo : ${FORK_REPO}"
echo "============================================================"

if command -v "${KIRI_BIN}" >/dev/null 2>&1; then
  echo "[OK] ${KIRI_BIN} is already installed at: $(command -v "${KIRI_BIN}")"
  echo "[1/2] Ensuring Kiri engine is running..."
  "${KIRI_BIN}" info >/dev/null 2>&1 || "${KIRI_BIN}" start >/dev/null 2>&1 || true

  if command -v docker >/dev/null 2>&1; then
    echo "[2/2] Setting Docker CLI context to 'kiri' (optional convenience)..."
    docker context use kiri >/dev/null 2>&1 || true
  fi

  echo ""
  echo "[DONE] Runtime is ready. Verify binderfs inside the System Check Wizard."
  exit 0
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64|amd64) ARCH_NORM="x86_64" ;;
  arm64|aarch64) ARCH_NORM="arm64" ;;
  *) ARCH_NORM="${ARCH}" ;;
esac

echo "[INFO] '${KIRI_BIN}' was not found on PATH."
echo "[INFO] Detected platform: ${OS} (${ARCH_NORM})"
echo "[INFO] Querying latest release from ${FORK_REPO}..."

RELEASE_JSON="$(curl -fsSL "${RELEASES_API}" 2>/dev/null || true)"

if [[ -z "${RELEASE_JSON}" ]]; then
  echo "[WARN] Could not query GitHub Releases API for ${FORK_REPO}."
  echo "       Download manually from: ${RELEASES_WEB}"
  exit 1
fi

if [[ "${OS}" == "darwin" ]]; then
  ASSET_URL="$(printf '%s' "${RELEASE_JSON}" | grep -Eo "https://[^\"]+${ARCH_NORM}\.dmg" | head -n 1 || true)"
  if [[ -n "${ASSET_URL}" ]]; then
    OUT_FILE="/tmp/$(basename "${ASSET_URL}")"
    echo "[INFO] Downloading ${ASSET_URL}..."
    curl -fL "${ASSET_URL}" -o "${OUT_FILE}"
    echo "[SUCCESS] Downloaded installer to ${OUT_FILE}"
    echo "          Opening DMG installer..."
    open "${OUT_FILE}"
    exit 0
  fi
elif [[ "${OS}" == "linux" ]]; then
  if command -v dpkg >/dev/null 2>&1; then
    EXT="deb"
  elif command -v rpm >/dev/null 2>&1; then
    EXT="rpm"
  else
    EXT="tar.gz"
  fi
  ASSET_URL="$(printf '%s' "${RELEASE_JSON}" | grep -Eo "https://[^\"]+${ARCH_NORM}[^\"]*\.${EXT}" | head -n 1 || true)"
  if [[ -n "${ASSET_URL}" ]]; then
    OUT_FILE="/tmp/$(basename "${ASSET_URL}")"
    echo "[INFO] Downloading ${ASSET_URL}..."
    curl -fL "${ASSET_URL}" -o "${OUT_FILE}"
    echo "[SUCCESS] Downloaded package to ${OUT_FILE}"
    if [[ "${EXT}" == "deb" ]]; then
      echo "          Run: sudo dpkg -i ${OUT_FILE}"
    elif [[ "${EXT}" == "rpm" ]]; then
      echo "          Run: sudo rpm -i ${OUT_FILE}"
    fi
    exit 0
  fi
fi

echo "[INFO] Open releases page to download the installer for ${OS}/${ARCH_NORM}:"
echo "       ${RELEASES_WEB}"
