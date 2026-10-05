"""
main.py — Dr. Chakshu API

Heavy imports (torch, langchain, etc.) are intentionally deferred into the
endpoint functions via local imports. This lets uvicorn bind to $PORT in
< 0.5 s at startup, satisfying Render's port scanner before any library is
even loaded.
"""

import threading
from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import DISEASES   # config.py: only os + pathlib — no torch

# ---- Lazy model singleton ------------------------------------------------
_model_lock = threading.Lock()
_model = None


def get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from model import load_model   # deferred — pulls torch
                _model = load_model()
    return _model


# ---- App -----------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Nothing blocks here — uvicorn binds to $PORT instantly.
    # Heavy imports (torch, langchain) happen on first request.
    yield
    global _model
    _model = None


app = FastAPI(title="Dr. Chakshu API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Chat router is registered at startup (before any request), but its
# internal heavy imports (langchain, groq) are deferred inside chat_agent.py
from chat_router import router as chat_router
app.include_router(chat_router)


# ---- Endpoints -----------------------------------------------------------
@app.get("/health")
def health():
    from config import get_device
    return {"status": "ok", "device": str(get_device()), "diseases": DISEASES}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """Upload a chest X-ray. Returns visual results + a structured editable report."""
    if file.content_type not in ("image/png", "image/jpeg", "image/jpg"):
        raise HTTPException(status_code=422, detail="Only PNG or JPEG images are supported.")

    raw_bytes = await file.read()

    # Step 1 — ML inference + Grad-CAM (lazy imports torch on first call)
    try:
        from inference import run_full_pipeline
        visual = run_full_pipeline(get_model(), raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")

    # Step 2 — LangGraph: Scribe -> Auditor -> structured report
    try:
        from report_graph import generate_report
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
