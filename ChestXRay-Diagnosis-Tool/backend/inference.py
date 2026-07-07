# All inference logic: image preprocessing, prediction, and Grad-CAM

import io
import base64

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget

from config import IMAGE_SIZE, DEVICE, THRESHOLD, DISEASES


# Same transforms used during training
preprocess = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def load_image(raw_bytes: bytes):
    """Convert raw image bytes into a model-ready tensor and a float overlay array."""
    pil = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

    # Float array [0,1] used for the heatmap overlay
    rgb = np.array(pil.resize((IMAGE_SIZE, IMAGE_SIZE)), dtype=np.float32) / 255.0

    # Normalised tensor for the model
    tensor = preprocess(pil).unsqueeze(0).to(DEVICE)

    return tensor, rgb


def get_predictions(model, tensor):
    """Run a forward pass and return probabilities for each disease."""
    with torch.no_grad():
        probs = torch.sigmoid(model(tensor)).cpu().numpy()[0]
    return probs


def get_gradcam(model, tensor, rgb, disease_idx):
    """Generate a Grad-CAM heatmap for one disease."""
    cam = GradCAM(model=model, target_layers=[model.features.denseblock4])
    mask = cam(input_tensor=tensor, targets=[ClassifierOutputTarget(disease_idx)])[0]
    overlay = show_cam_on_image(rgb, mask, use_rgb=True, colormap=cv2.COLORMAP_JET)
    return overlay, mask


def to_base64_png(array):
    """Convert a uint8 image array to a base64 PNG string."""
    buf = io.BytesIO()
    Image.fromarray(array.astype(np.uint8)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def run_full_pipeline(model, raw_bytes: bytes):
    """
    Main entry point — given a model and raw image bytes, return a dict for
    the single highest-probability disease plus all confidence scores:
      - disease name, probability, positive flag, heatmap (base64 PNG), raw grayscale map
      - all_probs: {disease: probability} for every disease (used in the report header)
    """
    tensor, rgb = load_image(raw_bytes)
    probs = get_predictions(model, tensor)

    # Pick the disease with the highest predicted probability
    best_idx = int(probs.argmax())
    best_disease = DISEASES[best_idx]

    overlay, grayscale = get_gradcam(model, tensor, rgb, best_idx)

    return {
        "disease":         best_disease,
        "probability":     round(float(probs[best_idx]), 4),
        "positive":        bool(probs[best_idx] >= THRESHOLD),
        "all_probs":       {d: round(float(p), 4) for d, p in zip(DISEASES, probs)},
        "original_base64": to_base64_png((rgb * 255).astype(np.uint8)),
        "heatmap_base64":  to_base64_png(overlay),
        "grayscale_map":   grayscale.tolist(),
    }
