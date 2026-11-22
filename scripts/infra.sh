#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-up}"
KIRI_BIN="${KIRI_BINARY:-kiri}"

# Add common Kiri & Docker CLI locations on macOS/Linux to PATH
for dir in \
  "/Applications/Kiri.app/Contents/MacOS" \
  "/Applications/Kiri.app/Contents/Resources/bin" \
  "${HOME}/Applications/Kiri.app/Contents/MacOS" \
  "${HOME}/Applications/Kiri.app/Contents/Resources/bin" \
  "${HOME}/.kiri/bin" \
  "/opt/homebrew/bin" \
  "/usr/local/bin"; do
  if [[ -d "${dir}" ]] && [[ ":${PATH}:" != *":${dir}:"* ]]; then
    export PATH="${dir}:${PATH}"
  fi
done

# Use KIRI_GUEST_DIR automatically on macOS if user placed a binder-enabled kernel there
if [[ "$(uname -s)" == "Darwin" ]]; then
  GUEST_DIR="${KIRI_GUEST_DIR:-${HOME}/.qa-studio/kiri-guest}"
  ARCH="$(uname -m)"
  if [[ "${ARCH}" == "arm64" ]] && [[ -f "${GUEST_DIR}/Image" ]]; then
    export KIRI_GUEST_DIR="${GUEST_DIR}"
  elif [[ "${ARCH}" != "arm64" ]] && [[ -f "${GUEST_DIR}/bzImage" ]]; then
    export KIRI_GUEST_DIR="${GUEST_DIR}"
  fi
fi

if command -v "${KIRI_BIN}" >/dev/null 2>&1; then
  # Ensure Kiri daemon is awake
  "${KIRI_BIN}" info >/dev/null 2>&1 || "${KIRI_BIN}" start >/dev/null 2>&1 || true

  if [[ "${ACTION}" == "up" ]]; then
    exec "${KIRI_BIN}" compose up -d
  elif [[ "${ACTION}" == "down" ]]; then
    exec "${KIRI_BIN}" compose down
  else
    exec "${KIRI_BIN}" compose "${ACTION}"
  fi
fi

if command -v docker >/dev/null 2>&1; then
  if [[ "${ACTION}" == "up" ]]; then
    exec docker compose up -d
  elif [[ "${ACTION}" == "down" ]]; then
    exec docker compose down
  else
    exec docker compose "${ACTION}"
  fi
fi

echo "[ERROR] Neither 'kiri' nor 'docker' was found on PATH." >&2
echo "  1. Install Kiri Official: brew install --cask libracoder/kiri/kiri (or run: npm run runtime:install)" >&2
echo "  2. Open Kiri.app at least once to finish initial CLI setup." >&2
exit 1
