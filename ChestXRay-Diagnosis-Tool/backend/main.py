from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from model import load_model
from inference import run_full_pipeline
from config import DEVICE, DISEASES

# ── Startup / shutdown ────────────────────────────────────────────────────────
model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = load_model()
    yield
    model = None

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ChestXRay Diagnosis API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "device": str(DEVICE), "diseases": DISEASES}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Upload a chest X-ray (PNG or JPEG).
    Returns disease probabilities + Grad-CAM heatmaps.
    """
    if file.content_type not in ("image/png", "image/jpeg", "image/jpg"):
        raise HTTPException(status_code=422, detail="Only PNG or JPEG images are supported.")

    raw_bytes = await file.read()

    try:
        results = run_full_pipeline(model, raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"diseases": results}
