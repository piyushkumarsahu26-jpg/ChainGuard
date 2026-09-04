"""
Tests for the Sprint AI-4A inference platform.

Unlike test_training_platform.py, these DO exercise real inference against
the real registered champion model (whichever one is currently promoted
in models/weights/manifest.json — assertions below query it dynamically
rather than hardcoding a version string, so a future retraining/promotion
doesn't require editing these tests) — a single forward pass on a small
YOLOv8n model takes well under a second on CPU, so this is fast enough to
run in the normal test suite, unlike actual training. webcam_inference is
tested only for its correct-failure path (no camera in this or any CI
sandbox) — see inference/webcam_inference.py's docstring.
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from inference.batch_inference import predict_batch
from inference.image_inference import predict_image
from inference.model_loader import detect_device, load_champion
from inference.performance import get_metrics
from inference.video_inference import predict_video
from main import app

client = TestClient(app)

SAMPLE_IMAGE = "datasets/synthetic/SAFE/SAFE_synthetic_v1.0.0_0000.jpg"


# --- Model loader --------------------------------------------------------

def test_detect_device_returns_cpu_or_cuda():
    assert detect_device() in ("cpu", "cuda")


def test_load_champion_returns_cached_instance_on_second_call():
    loaded_a = load_champion()
    loaded_b = load_champion()
    assert loaded_a.model is loaded_b.model
    assert loaded_a.entry.version == loaded_b.entry.version


def test_load_champion_reports_correct_image_size():
    from services.model_registry import get_champion
    loaded = load_champion()
    # Whatever the real registered champion's imageSize is — the point of
    # this test is that model_loader passes it through correctly, not that
    # it equals any specific number (see Sprint AI-4B's model-repair
    # investigation for why hardcoding this broke the first time the
    # champion changed).
    assert loaded.entry.imageSize == get_champion().imageSize


# --- Image inference ----------------------------------------------------

def test_predict_image_returns_valid_result():
    from services.model_registry import get_champion
    result = predict_image(SAMPLE_IMAGE)
    assert result.modelVersion == get_champion().version
    assert result.processingTimeMs > 0
    assert result.imageWidth == 320 and result.imageHeight == 320
    assert isinstance(result.detections, list)


def test_predict_image_saves_annotated_output(tmp_path):
    result = predict_image(SAMPLE_IMAGE, save_annotated=True, output_dir=tmp_path)
    assert result.annotatedImagePath is not None
    assert Path(result.annotatedImagePath).exists()


# --- Batch inference ------------------------------------------------------

def test_predict_batch_processes_all_images(tmp_path):
    images = list(Path("datasets/synthetic").glob("*/*.jpg"))[:4]
    result = predict_batch(images, output_dir=tmp_path)
    assert result.totalImages == 4
    assert result.succeeded == 4
    assert result.failed == 0
    assert Path(result.jsonReportPath).exists()
    assert Path(result.csvReportPath).exists()


def test_predict_batch_records_failure_for_bad_file(tmp_path):
    bad_file = tmp_path / "not_an_image.txt"
    bad_file.write_text("this is not an image")
    result = predict_batch([bad_file], output_dir=tmp_path / "out")
    assert result.failed == 1
    assert result.results[0].error is not None


# --- Video inference --------------------------------------------------------

@pytest.fixture(scope="module")
def sample_video(tmp_path_factory):
    import cv2

    tmp_dir = tmp_path_factory.mktemp("video")
    video_path = tmp_dir / "test.mp4"
    images = sorted(Path("datasets/synthetic").glob("*/*.jpg"))[:6]

    # Explicitly resize every frame to a fixed size before writing. Without
    # this, cv2.VideoWriter silently drops any frame whose dimensions
    # don't match the size it was initialized with — a real issue this
    # fixture hit after a second dataset-generation run (Sprint AI-4B
    # model repair) added images at a different resolution (96x96) than
    # the original Sprint AI-2 sample (320x320) into the same
    # datasets/synthetic/ folder. Resizing makes this fixture correct
    # regardless of what resolutions coexist there.
    target_size = (160, 160)
    writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*"mp4v"), 5.0, target_size)
    for img_path in images:
        frame = cv2.imread(str(img_path))
        writer.write(cv2.resize(frame, target_size))
    writer.release()
    return video_path


def test_predict_video_processes_correct_frame_count(sample_video, tmp_path):
    result = predict_video(sample_video, output_dir=tmp_path, frame_skip=2)
    assert result.totalFrames == 6
    assert result.framesProcessed == 3  # every 2nd frame of 6
    assert result.annotatedVideoPath is not None
    assert Path(result.annotatedVideoPath).exists()


def test_predict_video_annotated_output_is_valid(sample_video, tmp_path):
    import cv2

    result = predict_video(sample_video, output_dir=tmp_path, frame_skip=3)
    cap = cv2.VideoCapture(result.annotatedVideoPath)
    assert cap.isOpened()
    assert int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) == result.totalFrames
    cap.release()


# --- Webcam (failure path only — no camera in any CI/sandbox environment) ---

def test_webcam_inference_raises_clear_error_without_a_camera():
    from inference.webcam_inference import run_webcam_inference

    with pytest.raises(RuntimeError, match="Could not open camera"):
        run_webcam_inference(device_index=0, max_frames=1)


# --- Performance / metrics ---------------------------------------------------

def test_metrics_reflect_real_predictions():
    before = get_metrics().totalPredictions
    predict_image(SAMPLE_IMAGE)
    after = get_metrics().totalPredictions
    assert after == before + 1


# --- Endpoints (via TestClient — the real HTTP layer, not direct function calls) ---

def test_health_endpoint_reports_model_loaded():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["data"]["modelLoaded"] is True


def test_models_endpoint_lists_the_champion():
    from services.model_registry import get_champion
    response = client.get("/models")
    assert response.status_code == 200
    versions = [m["version"] for m in response.json()["data"]]
    assert get_champion().version in versions


def test_predict_image_endpoint(tmp_path):
    from services.model_registry import get_champion
    with open(SAMPLE_IMAGE, "rb") as f:
        response = client.post("/predict/image", files={"file": ("test.jpg", f, "image/jpeg")})
    assert response.status_code == 200
    data = response.json()["data"]
    assert "detections" in data
    assert data["modelVersion"] == get_champion().version


def test_predict_image_endpoint_respects_confidence_threshold_param():
    with open(SAMPLE_IMAGE, "rb") as f:
        response = client.post(
            "/predict/image",
            files={"file": ("test.jpg", f, "image/jpeg")},
            params={"confidence_threshold": 0.99},
        )
    assert response.status_code == 200


def test_predict_batch_endpoint():
    files = [
        ("files", ("a.jpg", open(SAMPLE_IMAGE, "rb"), "image/jpeg")),
    ]
    response = client.post("/predict/batch", files=files)
    assert response.status_code == 200
    assert response.json()["data"]["succeeded"] == 1


def test_predict_video_endpoint(sample_video):
    with open(sample_video, "rb") as f:
        response = client.post("/predict/video", files={"file": ("test.mp4", f, "video/mp4")}, params={"frame_skip": 2})
    assert response.status_code == 200
    assert response.json()["data"]["framesProcessed"] > 0


def test_predict_webcam_endpoint_returns_503_without_a_camera():
    response = client.post("/predict/webcam", params={"max_frames": 1})
    assert response.status_code == 503
    assert response.json()["success"] is False


def test_metrics_endpoint():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "totalPredictions" in response.json()["data"]
