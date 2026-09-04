# Training configs

One YAML file per training run goes here (e.g. `v1.0.0.yaml`). Read by
`training/train.py --config training/configs/<name>.yaml`, which is not
implemented yet (see that file's docstring).

Planned shape, per docs/chainguard-ai-technical-design-phase3a.md, Step 8:

```yaml
datasetVersion: "v1"
baseWeights: "yolov8n.pt"
imageSize: 640
batchSize: 16
epochs: 150
earlyStoppingPatience: 20
augmentation: default
```

No config files exist yet — this sprint only creates the folder and
documents the intended shape.
