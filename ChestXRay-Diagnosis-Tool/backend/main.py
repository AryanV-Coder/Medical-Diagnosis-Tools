from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from model import load_model
from inference import run_full_pipeline
from report_graph import generate_report
from config import DEVICE, DISEASES

model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = load_model()
    yield
    model = None

app = FastAPI(title="Dr. Chakshu API", version="2.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"status": "ok", "device": str(DEVICE), "diseases": DISEASES}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """Upload a chest X-ray. Returns visual results + a structured editable report."""
    if file.content_type not in ("image/png", "image/jpeg", "image/jpg"):
        raise HTTPException(status_code=422, detail="Only PNG or JPEG images are supported.")

    raw_bytes = await file.read()

    # Step 1 — ML inference + Grad-CAM
    try:
        visual = run_full_pipeline(model, raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")

    # Step 2 — LangGraph: Scribe → Auditor → structured report
    try:
        report = await asyncio.to_thread(
            generate_report,
            visual["disease"],
            visual["probability"],
            visual["positive"],
            visual["all_probs"],
            visual["original_base64"],
            visual["heatmap_base64"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {e}")

    return {
        "disease":        visual["disease"],
        "probability":    visual["probability"],
        "positive":       visual["positive"],
        "heatmap_base64": visual["heatmap_base64"],
        "grayscale_map":  visual["grayscale_map"],
        "report":         report,
    }
