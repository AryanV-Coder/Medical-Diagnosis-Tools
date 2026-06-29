# CONTEXT: gradcam_explainability.md
# Covers: inference.py
# Read this before editing anything related to image preprocessing, model forward pass,
# Grad-CAM generation, or the shape/format of the visual output dict.

---

## What this feature does

Takes raw image bytes from the HTTP request, runs them through the DenseNet-121 to get
disease probabilities, identifies the single highest-probability disease, then generates
a Grad-CAM heatmap overlay for that disease. Returns a structured dict consumed directly
by `main.py` and passed to `report_graph.py`.

---

## File: `inference.py`

### Module-level object (instantiated once on import)
```python
preprocess = transforms.Compose([
    transforms.Resize((224, 224)),          # IMAGE_SIZE from config
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],         # ImageNet stats — must match training
        std =[0.229, 0.224, 0.225]
    ),
])
```
**Critical:** These exact normalization values were used during training.
Changing them will silently produce garbage predictions.

---

### Function signatures and contracts

#### `load_image(raw_bytes: bytes) -> tuple[Tensor, ndarray]`
- Input: raw image bytes (PNG or JPEG)
- Opens with PIL, converts to RGB (handles grayscale X-rays transparently)
- Returns:
  - `tensor`: shape `(1, 3, 224, 224)`, normalized, on `DEVICE` — fed to model
  - `rgb`: shape `(224, 224, 3)`, float32, range [0, 1] — used as Grad-CAM background

#### `get_predictions(model, tensor) -> ndarray`
- Runs forward pass under `torch.no_grad()`
- Applies `torch.sigmoid()` to raw logits (model outputs logits, NOT probabilities)
- Returns numpy array of shape `(3,)` — one probability per disease, order matches `config.DISEASES`

#### `get_gradcam(model, tensor, rgb, disease_idx: int) -> tuple[ndarray, ndarray]`
- `disease_idx`: index into `config.DISEASES` for the target class
- Target layer: `model.features.denseblock4` (last conv block — do NOT change without testing)
- Returns:
  - `overlay`: uint8 RGB array `(224, 224, 3)` — JET colormap blended onto original image
  - `mask`: float array `(224, 224)` — raw CAM values, range [0, 1]

#### `to_base64_png(array: ndarray) -> str`
- Converts a uint8 image array to a base64-encoded PNG string
- Returns plain base64 string — NO `data:image/png;base64,` prefix

#### `run_full_pipeline(model, raw_bytes: bytes) -> dict`
- **Main entry point called by `main.py`**
- Orchestrates: `load_image` → `get_predictions` → picks best disease → `get_gradcam`
- Returns (this exact shape — do not add/remove keys without updating `main.py`):
```python
{
    "disease":        str,        # config.DISEASES[best_idx]
    "probability":    float,      # rounded to 4 decimal places via round(..., 4)
    "positive":       bool,       # probs[best_idx] >= config.THRESHOLD
    "heatmap_base64": str,        # base64 PNG of the JET overlay
    "grayscale_map":  list,       # mask.tolist() — 2-D nested list of floats
}
```

---

## Data flow within this file
```
raw_bytes
   │
   ▼ load_image()
tensor (model input) + rgb (overlay background)
   │
   ├─▶ get_predictions() → probs[3]
   │       └─▶ best_idx = probs.argmax()
   │
   └─▶ get_gradcam(best_idx) → overlay (uint8), mask (float)
           └─▶ to_base64_png(overlay) → heatmap_base64
```

---

## Dependencies imported
```python
import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from config import IMAGE_SIZE, DEVICE, THRESHOLD, DISEASES
```

---

## Editing guidance for AI

| Scenario | What to change |
|---|---|
| Change Grad-CAM method (e.g., EigenCAM) | Replace `GradCAM` import and instantiation in `get_gradcam()` |
| Change colormap | Replace `cv2.COLORMAP_JET` in `get_gradcam()` |
| Return all disease probabilities (multi-label) | Modify `run_full_pipeline()` to loop over all diseases instead of just `best_idx` |
| Add image validation | Add checks in `load_image()` before PIL open |
| Change output image size | Update `IMAGE_SIZE` in `config.py` — both `preprocess` and `rgb` resize use it |

---

## Do NOT change
- The `preprocess` normalization mean/std — they match training.
- `model.features.denseblock4` as the CAM target layer without verifying the new layer exists.
- The keys or types in the returned dict from `run_full_pipeline()` — `main.py` unpacks them by key.
