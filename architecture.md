# Pineapple YOLO — Architecture

Custom object detection pipeline built on [Ultralytics YOLOv8](https://docs.ultralytics.com/), trained to detect **hands** and **boxes** in webcam imagery.

---

## Project Overview

```
pineapple_yolo/
├── train.py                  # Training entry point
├── validate.py               # Model evaluation
├── detect.py                 # Inference: images, video, webcam
├── capture_webcam.py         # Capture frames for annotation
├── convert_dataset.py        # CVAT XML → YOLO format
├── confidence_report.py      # Per-image confidence analysis
├── data.yaml                 # Dataset & class config
├── requirements.txt          # Python dependencies
├── yolov8n.pt                # Pretrained base model (6.2 MB)
├── dataset/                  # YOLO-format annotated data
│   ├── images/
│   │   ├── train/            # 251 training images
│   │   └── val/              # 63 validation images
│   └── labels/
│       ├── train/            # YOLO .txt labels (same filenames)
│       └── val/
├── runs/detect/
│   ├── train-v3-4/           # ★ Best model (99.5% mAP@50)
│   │   ├── weights/
│   │   │   ├── best.pt       # Best checkpoint (6.3 MB)
│   │   │   └── last.pt       # Final epoch checkpoint
│   │   ├── args.yaml         # Training hyperparameters
│   │   ├── results.csv       # Per-epoch metrics
│   │   └── *.png             # Plots & visualizations
│   └── train-v2/             # Fallback checkpoint
│       └── weights/          # best.pt + last.pt
└── architecture.md           # This file
```

---

## Data Pipeline

```
                      ┌─────────────┐
                      │  Webcam or   │
                      │  phone pics  │
                      └──────┬──────┘
                             │
                     ┌───────▼───────┐
                     │ capture_webcam │  Spacebar to save frames
                     │     .py        │  → webcam_frames/*.jpg
                     └───────┬───────┘
                             │
                     ┌───────▼───────┐
                     │    CVAT        │  Manual annotation tool
                     │  (external)    │  Draw bounding boxes, label "hands" / "box"
                     └───────┬───────┘
                             │ exports XML
                     ┌───────▼────────┐
                     │ convert_dataset │  XML annotations → YOLO format
                     │     .py         │  Splits train/val (80/20), copies images
                     └───────┬────────┘
                             │
                     ┌───────▼───────┐
                     │   dataset/    │  Ready for training
                     │ images/labels │  YOLO normalized format
                     └───────────────┘
```

### Annotation Flow

1. **capture_webcam.py** — Opens webcam, user presses **Space** to save frames to `webcam_frames/`. Timestamped filenames prevent collisions.
2. **CVAT** (external tool) — User draws bounding boxes around hands and boxes, exports XML.
3. **convert_dataset.py** — Parses CVAT XML, converts pixel coordinates to YOLO normalized format `[class x_center y_center width height]`, shuffles all annotated images, splits 80/20 into train/val, and populates `dataset/`.

### Class Schema

| ID | Name | Description |
|----|------|-------------|
| 0 | `hands` | Human hands in frame |
| 1 | `box` | Physical boxes/containers |

Defined in both `data.yaml` and `convert_dataset.py:CLASS_NAMES` — these must stay synchronized.

---

## Script Reference

### `train.py`

Thin wrapper around `ultralytics.YOLO.train()`. All Ultralytics training params are exposed as CLI flags, with sensible defaults for this dataset.

```bash
python train.py --model yolov8n.pt --epochs 100 --batch 16 --patience 100
```

Key defaults:
- Base model: `yolov8n.pt` (nano — 3.2M params, fastest)
- Image size: 640×640
- Batch: 16 (GPU) — reduce if OOM
- Optimizer: AdamW (Ultralytics auto)
- Early stopping patience: 100 epochs

### `validate.py`

Runs `model.val()` and prints the core metrics: mAP@0.5, mAP@0.5:0.95, precision, and recall. Accepts confidence/IoU thresholds and optional plot generation.

### `detect.py`

The most feature-rich script. Two modes:

**File mode** (default) — delegates to `model.predict()`. Accepts images, folders, and videos. Saves annotated outputs to `runs/detect/`.

**Webcam mode** (`--source 0`) — custom OpenCV loop with:
- **Confidence-tiered colors**: Green (≥80%), Yellow (50–80%), Red (<50%)
- **HUD overlay**: Real-time FPS, inference latency, detection counts per tier
- **Trigger line**: Movable vertical line (left/right arrows); turns red when a "hands" detection crosses it
- **Live controls**: `+`/`-` adjust confidence threshold, `t` toggles the line, `q` quits

### `capture_webcam.py`

Simple frame grabber. Opens webcam, shows live preview with capture count. Spacebar saves the current frame. Intended as the first step of the annotation workflow.

### `convert_dataset.py`

Multi-source CVAT-to-YOLO converter. Configured via two module-level constants:
- **`SOURCES`** — list of `(xml_path, image_root)` tuples; add new annotation batches here
- **`CLASS_NAMES`** — must match `data.yaml`

Parses CVAT `<image>`/`<box>` elements, converts to normalized YOLO format, shuffles, splits, and writes `dataset/`. Handles missing images and unlabeled frames gracefully with warnings.

### `confidence_report.py`

Diagnostic tool. Runs inference over the validation set and prints:
- Overall confidence distribution (mean, median, histogram)
- Top 10 lowest-confidence images (flagged ⚠ for annotation review)
- Top 10 highest-confidence images

Helps identify mislabeled or ambiguous images that degrade model quality.

---

## Training History

| Run | Base | Epochs | mAP@50 | Status |
|-----|------|--------|--------|--------|
| train-v2 | yolov8n.pt | 200 | ~98% | Fallback — kept as safe rollback |
| train-v3-4 | train-v2 last.pt | 100 | **99.5%** | ★ Current best, production-ready |

train-v3-4 was trained by resuming from train-v2's checkpoint with `patience=100`, deterministic mode, automatic mixed precision (AMP), and RandAugment. It achieved 99.5% mAP@50 with 99.1% precision and 100% recall on the validation set.

---

## Dependencies

```
ultralytics >= 8.0.0    # YOLOv8 training & inference
torch >= 2.0.0           # Deep learning backend
opencv-python >= 4.8.0   # Webcam capture & image drawing
matplotlib >= 3.7.0      # Training plots (generated by Ultralytics)
```

CUDA-capable GPU recommended for training. Inference works on CPU at reduced FPS.

---

## Common Workflows

### Add more training data

1. `python capture_webcam.py` → capture new frames
2. Upload to CVAT, annotate, export XML
3. Add the XML + image root to `SOURCES` in `convert_dataset.py`
4. `python convert_dataset.py` → rebuilds `dataset/`
5. `python train.py --model runs/detect/train-v3-4/weights/last.pt --epochs 50` → fine-tune

### Evaluate a model

```bash
python validate.py --weights runs/detect/train-v3-4/weights/best.pt
python confidence_report.py --weights runs/detect/train-v3-4/weights/best.pt
```

### Run live detection

```bash
python detect.py --weights runs/detect/train-v3-4/weights/best.pt --source 0
```
