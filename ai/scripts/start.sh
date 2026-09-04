#!/usr/bin/env bash
# Production-style start (no reload). Mirrors backend's `npm start`.
set -e
cd "$(dirname "$0")/.."
uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
