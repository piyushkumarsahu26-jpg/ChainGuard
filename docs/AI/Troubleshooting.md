# Troubleshooting

Every issue below was actually hit and fixed during Sprint AI-3's real verification — not speculative. See `docs/chainguard-sprint-ai3-completion-report.md` for the full account.

## `pip install torch` wants to download 3-5GB of NVIDIA packages, but I have no GPU

Expected, not a misconfiguration. The plain PyPI `torch` wheel for Linux x86_64 depends on ~11 separate `nvidia-*-cu12` packages, and — this is the part that surprises people — **it needs them even for CPU-only use**: this wheel's `__init__.py` eagerly `ctypes.CDLL()`-loads `libcudart.so`/`libcublas.so` at import time, before any code checks `torch.cuda.is_available()`. Skipping them causes an `OSError`/`ValueError` on `import torch`, not a graceful CPU fallback.

Official CPU-only wheels exist at `download.pytorch.org/whl/cpu` but that domain may not be reachable in a restricted network environment (it wasn't in this project's sandbox). If you're in the same situation: install the full `requirements-ml.txt` list as-is — the NVIDIA packages provide the shared libraries torch's import needs; `torch.cuda.is_available()` will still correctly return `False` on hardware with no actual GPU/driver, and training runs on CPU automatically.

**Disk budget**: expect ~5-6GB for the full `requirements.txt` + `requirements-dataset.txt` + `requirements-ml.txt` install. This project verified it fits in 8.9GB free with roughly 3GB to spare — tight, not comfortable.

## `ultralytics` export fails with `externally-managed-environment` / PEP 668

Ultralytics' ONNX exporter tries to auto-install `onnxslim`/`onnxruntime` if they're missing, using a bare `pip install` call that targets the system Python, not your active virtualenv — which Debian/Ubuntu's Python blocks by default (PEP 668). Export still *succeeds* without them (just skips the "simplify" optimization step), but to avoid the noisy failure entirely: `requirements-ml.txt` already pins both — a normal `pip install -r requirements-ml.txt` avoids hitting this at all.

## `numpy` version conflicts between the dataset platform and training stack

`scipy>=1.18` and `opencv-python-headless>=5.0` (pulled in by `requirements-ml.txt`) require `numpy>=2.0`. If you're extending an older checkout where `requirements-dataset.txt` still pins `numpy==1.26.4` (Sprint AI-2's original pin), installing all three requirements files together will silently downgrade numpy and break the training stack. Fixed as of Sprint AI-3 — `requirements-dataset.txt` now pins `numpy==2.5.1`, re-verified against the full Sprint AI-1 + AI-2 test suite before the change. If you hit this on your own fork/branch, the fix is the same: bump the dataset platform's numpy pin, then re-run `pytest tests/` to confirm nothing in the dataset code depended on numpy 1.x-only behavior.

## `source .venv/bin/activate` doesn't seem to do anything (`python3`/`pip` still resolve to the system install)

Depends on your shell. This project's sandbox defaults to `/bin/sh` (dash), where `.venv/bin/activate`'s `source`-based PATH modification did not reliably take effect for subsequent commands in the same tool invocation. If you hit this: use the venv's binaries directly — `.venv/bin/python3` and `.venv/bin/python3 -m pip` — instead of relying on `activate`. This is more robust across shells regardless.

## I renamed my venv directory and now `pip`/other console scripts say "not found" even though `ls` shows them

Venv-generated console scripts (`pip`, `pip3`, etc.) have a hardcoded absolute-path shebang line pointing at that specific venv's `python3` — e.g. `#!/path/to/.venv_old_name/bin/python3`. Renaming the venv's directory breaks every one of these scripts, even though the files themselves still exist (`ls` finds them fine; the shell's shebang-based `exec` doesn't). Fix: don't rename a venv directory after creating it — recreate it at the final path instead — or always invoke via `python3 -m pip ...` instead of the `pip` script directly, which sidesteps the shebang issue since it resolves through the (still-working) `python3` binary.

## My tiny smoke-test training run reports 0.0 for every metric

Expected, not a bug — see `Training_Guide.md`'s closing section. 2 epochs on 24 training images (this sprint's shipped example) is nowhere near enough signal for YOLOv8 to learn anything. Check `training/runs/<experiment_id>/results.csv` to confirm loss is at least decreasing epoch-over-epoch (it should be, even on tiny data) — if loss is flat or `NaN`, that's a real problem; if loss decreases but validation mAP is still 0.0, that's simply "not enough data/epochs yet," not a broken pipeline.

## No `PR_curve.png` in a run's output directory

Ultralytics only generates a PR curve plot when validation produces enough non-degenerate predictions to plot meaningfully. A run with 0.0 precision/recall across the board (see above) won't produce one. `evaluation/evaluate.py`'s `evaluate_experiment()` checks for each plot's existence rather than assuming a fixed set always exists — this is expected, handled behavior, not a missing-file bug.

## An ONNX model throws "Got invalid dimensions for input" during inference

Real error hit during this sprint's own verification, not hypothetical:
```
RuntimeError: Error in execution: Got invalid dimensions for input: images for the following indices
 index: 2 Got: 640 Expected: 64
 index: 3 Got: 640 Expected: 64
```
ONNX exports have a **fixed** input shape baked in at export time (this project's models are exported without `dynamic=True`). `ultralytics.YOLO().predict()` defaults to 640×640 if you don't pass `imgsz` explicitly — which breaks the moment the model was exported at a different size (this project's smoke-test model: 64×64). Fix: always pass `imgsz=` matching the exact size the model was trained/exported at. `inference/model_loader.py` handles this automatically by reading `ModelEntry.imageSize` (added this sprint specifically because of this bug) — if you're calling `ultralytics.YOLO()` directly outside this project's `inference/` modules, you must pass `imgsz` yourself.

## `docker build` for `ai/Dockerfile` is slow / large

Expected as of Sprint AI-4A — the image now installs the full `requirements-ml.txt` stack (same ~5-6GB dependency set documented below), not the lightweight Sprint AI-1 image. This specific build step was not verified in this project's sandbox (see `Deployment_Guide.md`) — if it fails or behaves unexpectedly in your environment, that's genuinely new information this project doesn't have yet, not a known issue to search for here.

## `psutil`/memory metrics look wrong or missing in a container

`inference/performance.py`'s memory snapshot uses `psutil.Process().memory_info().rss` (this process's own resident memory) and `psutil.virtual_memory().available` (host-visible available memory) — inside a container with a memory cgroup limit, `virtual_memory().available` may report the *host's* available memory rather than the container's actual limit, which is a known `psutil` behavior in containerized environments generally, not specific to this project. Not fixed this sprint (flagged in Known Issues) — treat `memoryAvailableMb` as approximate under Docker.

## A retry/network-failure test passes for `ECONNREFUSED` but fails for other connection drops

Real bug caught by this sprint's own test suite, not hypothetical. Node's `fetch` (built on undici) wraps *every* network-level failure — connection refused, a mid-request socket reset, DNS failure — as a generic `TypeError: fetch failed`, with the specific reason nested in `err.cause.code` (`ECONNREFUSED`, `UND_ERR_SOCKET`, `ENOTFOUND`, etc.). `aiClient.service.js`'s original retry-detection only checked for `ECONNREFUSED` specifically, so a simulated mid-request connection drop (a real, realistic failure mode — a restarting AI service, a load balancer resetting a connection) fell through as non-retryable and failed the test immediately. Fixed by matching on the `TypeError` + `'fetch failed'` signature instead of enumerating individual `cause.code` values — catches the whole family of network failures, not just one.

## Background processes (`&`, `nohup`) don't survive between separate commands in this sandbox

Encountered repeatedly across AI sprints in this project's own development, not something you're likely to hit in a normal deployment (this is a quirk of the specific sandboxed shell environment this project was built in, not of Docker/production Linux generally). Plain `command &` or `nohup command &` would start a process that showed up in `ps` momentarily but then vanished — the log file stayed empty and the port never bound. Root cause: this environment doesn't fully detach background jobs from the invoking shell's session the way a normal terminal does. Fix: `setsid command < /dev/null &` — `setsid` starts the process in a new session, fully detached; `< /dev/null` avoids any stdin-related hang. If you're deploying normally (Docker, systemd, a real terminal), you will not hit this — it's specific to this sandbox's shell behavior.


