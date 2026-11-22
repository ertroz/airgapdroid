#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# AirgapDroid — mitmproxy CA Certificate Generator & Android Converter
# Generates a mitmproxy-compatible CA if none exists, then converts it into
# Android's system certificate format: <subject_hash_old>.0
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MITM_DIR="${MITM_DIR:-${ROOT_DIR}/.mitmproxy}"
OUT_DIR_LOCAL="${ROOT_DIR}/certs"
OUT_DIR_HOME="${HOME}/.qa-studio/certs"
CERT_PEM="${MITM_DIR}/mitmproxy-ca-cert.pem"
CA_COMBINED="${MITM_DIR}/mitmproxy-ca.pem"

echo "============================================================"
echo " AirgapDroid — Android SSL System Certificate Setup"
echo "============================================================"

if ! command -v openssl >/dev/null 2>&1; then
  echo "[ERROR] openssl is required but not installed." >&2
  exit 1
fi

mkdir -p "${MITM_DIR}" "${OUT_DIR_LOCAL}" "${OUT_DIR_HOME}"

# Step 1: Ensure mitmproxy CA PEM exists
if [[ ! -f "${CERT_PEM}" ]]; then
  echo "[1/3] mitmproxy CA certificate not found at ${CERT_PEM}."

  RUNTIME_BIN=""
  if command -v "${KIRI_BINARY:-kiri}" >/dev/null 2>&1 && "${KIRI_BINARY:-kiri}" info >/dev/null 2>&1; then
    RUNTIME_BIN="${KIRI_BINARY:-kiri}"
  elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    RUNTIME_BIN="docker"
  fi

  if [[ -n "${RUNTIME_BIN}" ]]; then
    echo "      Bootstrapping CA using official mitmproxy image via ${RUNTIME_BIN}..."
    "${RUNTIME_BIN}" run --rm \
      -v "${MITM_DIR}:/home/mitmproxy/.mitmproxy" \
      mitmproxy/mitmproxy:latest \
      sh -c "mitmdump --set confdir=/home/mitmproxy/.mitmproxy -q & PID=\$!; sleep 3; kill \$PID 2>/dev/null || true" \
      >/dev/null 2>&1 || true
  fi

  # Fallback: generate a mitmproxy-compatible root CA directly via openssl
  if [[ ! -f "${CERT_PEM}" ]]; then
    echo "      Generating local Root CA directly via OpenSSL..."
    TMP_KEY="${MITM_DIR}/mitmproxy-ca-key.pem"
    openssl genrsa -out "${TMP_KEY}" 2048 >/dev/null 2>&1
    openssl req -x509 -new -nodes \
      -key "${TMP_KEY}" \
      -sha256 -days 3650 \
      -subj "/CN=mitmproxy/O=AirgapDroid" \
      -addext "basicConstraints=critical,CA:TRUE" \
      -addext "keyUsage=critical,keyCertSign,cRLSign" \
      -out "${CERT_PEM}" >/dev/null 2>&1
    cat "${TMP_KEY}" "${CERT_PEM}" > "${CA_COMBINED}"
    chmod 600 "${TMP_KEY}" "${CA_COMBINED}"
  fi
else
  echo "[1/3] Found existing mitmproxy CA certificate at ${CERT_PEM}."
fi

if [[ ! -f "${CERT_PEM}" ]]; then
  echo "[ERROR] Failed to locate or generate ${CERT_PEM}." >&2
  exit 1
fi

# Step 2: Calculate Android legacy subject hash (<subject_hash_old>.0)
echo "[2/3] Computing Android subject_hash_old..."
SUBJECT_HASH="$(openssl x509 -inform PEM -subject_hash_old -in "${CERT_PEM}" | head -n 1 | tr -d '\r\n')"

if [[ -z "${SUBJECT_HASH}" ]]; then
  echo "[ERROR] Could not compute subject_hash_old from ${CERT_PEM}." >&2
  exit 1
fi

ANDROID_CERT_NAME="${SUBJECT_HASH}.0"
LOCAL_TARGET="${OUT_DIR_LOCAL}/${ANDROID_CERT_NAME}"
HOME_TARGET="${OUT_DIR_HOME}/${ANDROID_CERT_NAME}"

# Step 3: Build Android system certificate file (PEM + human-readable x509 metadata)
echo "[3/3] Writing Android system certificate: ${ANDROID_CERT_NAME}"
{
  openssl x509 -inform PEM -in "${CERT_PEM}"
  openssl x509 -inform PEM -text -noout -in "${CERT_PEM}"
} > "${LOCAL_TARGET}"

chmod 644 "${LOCAL_TARGET}"
cp "${LOCAL_TARGET}" "${HOME_TARGET}"
chmod 644 "${HOME_TARGET}"

echo ""
echo "[SUCCESS] Android CA certificate generated:"
echo "  - Project path : ${LOCAL_TARGET}"
echo "  - Studio path  : ${HOME_TARGET}"
echo ""
echo "The Orchestrator will automatically push ${ANDROID_CERT_NAME} to"
echo "/system/etc/security/cacerts/ with permission 644 on rooted devices (e.g., Redroid)."
