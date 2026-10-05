# All constants in one place — change here, works everywhere
#
# NOTE: torch is intentionally NOT imported at the top level.
# It is only loaded when _resolve_device() is first called (lazily).

import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from pathlib import Path

MODEL_PATH = Path(__file__).parent / "models" / "best_model.pth"
DISEASES   = ["Cardiomegaly", "Effusion", "Pneumothorax"]
IMAGE_SIZE = 224
THRESHOLD  = 0.5

# DEVICE is resolved lazily on first access to avoid importing torch at module load time.
# Every caller (inference.py, model.py) already imports torch themselves.
_DEVICE = None


def get_device():
    global _DEVICE
    if _DEVICE is None:
        import torch
        torch.set_num_threads(1)
        _DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return _DEVICE



