#!/usr/bin/env bash
set -euo pipefail

# FastAPI backend launcher (offline-friendly)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Prefer local cache for the sentence-transformers model when available.
DEFAULT_MODEL_PATH="${HOME}/.cache/huggingface/hub/models--sentence-transformers--paraphrase-multilingual-MiniLM-L12-v2/snapshots/86741b4e3f5cb7765a600d3a3d55a0f6a6cb443d"
if [ -z "${LOCAL_SENTENCE_MODEL_PATH:-}" ] && [ -d "${DEFAULT_MODEL_PATH}" ]; then
  export LOCAL_SENTENCE_MODEL_PATH="${DEFAULT_MODEL_PATH}"
fi

# faster-whisper (ASR) default path
DEFAULT_ASR_MODEL_PATH="${HOME}/models/faster-whisper-medium/models--Systran--faster-whisper-medium/snapshots/08e178d48790749d25932bbc082711ddcfdfbc4f"
if [ -z "${ASR_MODEL_PATH:-}" ] && [ -d "${DEFAULT_ASR_MODEL_PATH}" ]; then
  export ASR_MODEL_PATH="${DEFAULT_ASR_MODEL_PATH}"
fi

# Local ASRを有効化する
export USE_LOCAL_ASR="${USE_LOCAL_ASR:-1}"
export ASR_DEVICE="${ASR_DEVICE:-cpu}"
export ASR_COMPUTE_TYPE="${ASR_COMPUTE_TYPE:-int8}"

# Force offline to avoid network retries.
export HF_HUB_OFFLINE="${HF_HUB_OFFLINE:-1}"
export TRANSFORMERS_OFFLINE="${TRANSFORMERS_OFFLINE:-1}"

# Activate venv if present.
if [ -d "${REPO_ROOT}/venv" ]; then
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/venv/bin/activate"
fi

exec uvicorn backend.main:app --host 127.0.0.1 --port 8000
