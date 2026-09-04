#!/usr/bin/env bash
# Development start with auto-reload. Mirrors backend's `npm run dev`.
set -e
cd "$(dirname "$0")/.."
uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
