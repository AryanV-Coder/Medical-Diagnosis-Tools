# Loads the DenseNet-121 model and returns it ready for inference

import torch
import torch.nn as nn
from torchvision import models
from config import MODEL_PATH, DEVICE, DISEASES


def build_model():
    net = models.densenet121(weights=None)

    # Freeze all layers
    for param in net.parameters():
        param.requires_grad = False

    # Unfreeze the last block (same as training)
    for param in net.features.denseblock4.parameters():
        param.requires_grad = True
    for param in net.features.norm5.parameters():
        param.requires_grad = True

    # Replace the classifier head
    net.classifier = nn.Linear(net.classifier.in_features, len(DISEASES))
    return net


def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}.\n"
            "Download best_model.pth from Google Drive and place it in backend/models/"
        )

    with torch.inference_mode():
        net = build_model()
        checkpoint = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
        net.load_state_dict(checkpoint["model_state_dict"])
        net = net.to(DEVICE)
        net.eval()

    print(f"Model loaded — epoch {checkpoint.get('epoch')} | val_loss {checkpoint.get('val_loss', 0):.4f}")
    return net
