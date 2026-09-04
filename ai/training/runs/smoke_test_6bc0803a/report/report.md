# Training Report — smoke_test_6bc0803a

**Status:** completed
**Started:** 2026-08-01T07:31:52.446757+00:00
**Completed:** 2026-08-01T07:32:18.956467+00:00
**Duration:** 26.5s
**Dataset version:** v1

## Configuration

| Parameter | Value |
|---|---|
| dataset_manifest | datasets/manifest.csv |
| dataset_root | datasets |
| train_split | 0.8 |
| base_weights | yolov8n.pt |
| image_size | 64 |
| epochs | 2 |
| batch_size | 4 |
| learning_rate | 0.01 |
| optimizer | auto |
| weight_decay | 0.0005 |
| confidence_threshold | 0.25 |
| seed | 42 |
| resume_from | None |
| experiment_name | smoke_test |
| generator_config_used | datasets/configs/sample.yaml |
| runs_dir | training/runs |

## Metrics

| Metric | Value |
|---|---|
| precision | 0.0000 |
| recall | 0.0000 |
| mAP50 | 0.0000 |
| mAP50_95 | 0.0000 |
| f1 | 0.0000 |

## Environment

| Field | Value |
|---|---|
| python_version | 3.12.3 |
| platform | Linux-6.18.5-x86_64-with-glibc2.39 |
| torch_version | 2.5.1+cu124 |
| torchvision_version | 0.20.1+cu124 |
| ultralytics_version | 8.3.55 |
| numpy_version | 2.5.1 |
| cuda_available | False |
| device_used | cpu |

## Artifacts

- **confusionMatrix**: `training/runs/smoke_test_6bc0803a/confusion_matrix.png`
- **confusionMatrixNormalized**: `training/runs/smoke_test_6bc0803a/confusion_matrix_normalized.png`
- **lossCurves**: `training/runs/smoke_test_6bc0803a/results.png`
- **labelsDistribution**: `training/runs/smoke_test_6bc0803a/labels.jpg`
- **Best weights (PyTorch)**: `training/runs/smoke_test_6bc0803a/weights/best.pt`

_No PR curve — expected for a degenerate/tiny validation run; see evaluation/evaluate.py._
