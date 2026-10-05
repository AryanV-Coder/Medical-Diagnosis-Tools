# All constants in one place — change here, works everywhere

import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from pathlib import Path
import torch

torch.set_num_threads(1)

MODEL_PATH      = Path(__file__).parent / "models" / "best_model.pth"
DISEASES        = ["Cardiomegaly", "Effusion", "Pneumothorax"]
IMAGE_SIZE      = 224
THRESHOLD       = 0.5
DEVICE          = torch.device("cuda" if torch.cuda.is_available() else "cpu")
