# CONTEXT: classification.md
# Covers: config.py, model.py, data_preprocessing_&_model_training.ipynb
# Read this before editing any model architecture, checkpoint loading, or disease label logic.

---

## What this feature does

Loads a fine-tuned DenseNet-121 at server startup and exposes it for inference.
The model takes a 224×224 chest X-ray image tensor and outputs a probability score
(0–1) for each of three diseases via independent sigmoid activations.

---

## Files and their responsibilities

### `config.py` — imported by EVERY other backend file
```python
DISEASES   = ["Cardiomegaly", "Effusion", "Pneumothorax"]  # index order = model output neuron order
MODEL_PATH = Path(__file__).parent / "models" / "best_model.pth"
IMAGE_SIZE = 224          # pixels; used in preprocessing AND Grad-CAM overlay
THRESHOLD  = 0.5          # sigmoid score >= THRESHOLD → positive finding
DEVICE     = torch.device("cuda" if torch.cuda.is_available() else "cpu")
```
**Critical:** The order of `DISEASES` is fixed by the trained model weights.
Do NOT reorder, add, or remove entries without retraining and saving a new checkpoint.

---

### `model.py` — functions

#### `build_model() -> nn.Module`
- Creates a DenseNet-121 with `weights=None`.
- Freezes ALL parameters first.
- Unfreezes ONLY `net.features.denseblock4` and `net.features.norm5`.
- Replaces `net.classifier` with `nn.Linear(1024, len(DISEASES))` → 3 outputs.

#### `load_model() -> nn.Module`
- Raises `FileNotFoundError` if `MODEL_PATH` doesn't exist.
- Loads checkpoint with `weights_only=False` (required — checkpoint contains extra metadata).
- Checkpoint dict keys: `"model_state_dict"`, `"epoch"`, `"val_loss"`.
- Moves model to `DEVICE`, sets `model.eval()`, returns model.
- Called ONCE at FastAPI startup via the `lifespan` context manager in `main.py`.

---

## Model architecture details
- **Backbone:** DenseNet-121 pre-trained on ImageNet
- **Output:** 3 raw logits (not probabilities) — sigmoid is applied at inference time in `inference.py`
- **Loss used during training:** `BCEWithLogitsLoss` (binary cross-entropy per disease, independent)
- **Unfrozen layers:** `denseblock4` + `norm5` — these are the only layers that were fine-tuned

---

## Training details (informational — not needed for inference edits)
- **Dataset:** NIH Chest X-ray 14 (~57K relevant images, trained on 10K subset)
- **Split:** 70/15/15 with patient-aware splits (no patient appears in both train and test)
- **Imbalance:** `WeightedRandomSampler` up-samples minority disease classes
- **Optimizer:** Adam + `ReduceLROnPlateau`, mixed precision (AMP), early stopping (patience=5)
- **Notebook:** `data_preprocessing_&_model_training.ipynb` (run on Google Colab with T4 GPU)

---

## Performance (10K subset)
| Disease | AUC-ROC |
|---|---|
| Cardiomegaly | 0.7552 |
| Pleural Effusion | 0.8174 |
| Pneumothorax | 0.7478 |
| **Mean** | **0.7735** |

---

## Editing guidance for AI

| Scenario | What to change |
|---|---|
| Add a new disease | Retrain the model, update `DISEASES` in `config.py`, update `RETRIEVAL_MAP` in `report_graph.py` |
| Change checkpoint format | Update `load_model()` dict key access (`"model_state_dict"`) |
| Switch backbone (e.g., ResNet) | Rewrite `build_model()` and update `get_gradcam()` target layer in `inference.py` |
| Change threshold | Update `THRESHOLD` in `config.py` only — all files read from there |

---

## Do NOT change
- The order of entries in `config.DISEASES` without a matching retrained checkpoint.
- The `weights_only=False` flag in `torch.load()` — removing it will break checkpoint loading.
