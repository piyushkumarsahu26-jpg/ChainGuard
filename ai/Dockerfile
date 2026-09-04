# ChainGuard AI Service
#
# Sprint AI-4A: this service now performs real inference (image/video/
# webcam/batch), which genuinely needs the ML stack — requirements-ml.txt
# is installed here for the first time, a real change from Sprint AI-1's
# "core API deps only" image. This makes the image large (see this
# sprint's completion report for the real, measured disk cost of this
# dependency set) — that's an accurate reflection of what the service now
# does, not something to minimize.
#
# Honesty note: this Dockerfile change is written correctly against the
# same requirements files verified working in this sprint's venv, but has
# NOT been build-tested via an actual `docker build` in this sandbox —
# building this image would need to download and unpack the same ~5-6GB
# dependency set that already used most of this sandbox's disk budget
# installing directly into a venv (see docs/AI/Troubleshooting.md). Please
# run a real `docker build` in your own environment before deploying from
# this image.

FROM python:3.12-slim

WORKDIR /app

# opencv-python-headless (used for video/webcam frame handling) needs
# libglib2.0-0 even in its "headless" build; libgl1 is not required since
# headless explicitly avoids the GUI/display dependencies that would need
# it. curl is for the HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-dataset.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-dataset.txt -r requirements-ml.txt

COPY . .

RUN mkdir -p logs models/weights

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
