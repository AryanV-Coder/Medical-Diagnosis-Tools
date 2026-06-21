# All constants in one place — change here, works everywhere

from pathlib import Path
import torch

MODEL_PATH      = Path(__file__).parent / "models" / "best_model.pth"
DISEASES        = ["Cardiomegaly", "Effusion", "Pneumothorax"]
IMAGE_SIZE      = 224
THRESHOLD       = 0.5
DEVICE          = torch.device("cuda" if torch.cuda.is_available() else "cpu")
