# CONTEXT: api.md
# Covers: main.py
# Read this before adding new endpoints, changing request/response shapes,
# modifying middleware, or changing how the model is loaded at startup.

---

## What this feature does

FastAPI application that serves as the single entry point for all client requests.
Loads the ML model at startup (once), and exposes two endpoints:
- `GET /health` — liveness check
- `POST /predict` — full pipeline: inference + Grad-CAM + agentic report generation

---

## File: `main.py`

---

## App initialization

```python
app = FastAPI(title="ChestXRay Diagnosis API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```
- CORS is fully open (`*`) — restrict `allow_origins` when deploying to production.
- `version="2.0.0"` reflects the addition of the agentic report layer.

---

## Model loading — `lifespan` context manager

```python
model = None  # module-level global

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = load_model()   # blocks until model is on device
    yield
    model = None           # cleanup on shutdown
```
- `load_model()` is called ONCE at startup — it is NOT thread-safe to call it per-request.
- The global `model` variable is read inside `predict()` — do NOT shadow or reassign it.

---

## Endpoints

### `GET /health`
```python
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "device": str(DEVICE), "diseases": DISEASES}
```
No authentication. Used for uptime checks. Returns current device and disease list.

---

### `POST /predict`
```python
@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict:
```

**Accepted content types:** `image/png`, `image/jpeg`, `image/jpg`
Returns `HTTP 422` for any other type.

**Step 1 — ML inference + Grad-CAM (synchronous, CPU/GPU):**
```python
visual = run_full_pipeline(model, raw_bytes)
# raises HTTP 500 on any exception
```

**Step 2 — Agentic report generation (synchronous but blocking — run in thread):**
```python
report = await asyncio.to_thread(
    generate_report,
    visual["disease"],
    visual["probability"],
    visual["positive"],
)
# raises HTTP 500 on any exception
```
`generate_report()` is wrapped in `asyncio.to_thread()` because it is synchronous and
would block the event loop — it makes multiple LLM calls.

**Response shape (HTTP 200):**
```python
{
    "disease":        str,     # e.g. "Cardiomegaly"
    "probability":    float,   # e.g. 0.8174
    "positive":       bool,    # True/False
    "heatmap_base64": str,     # base64 PNG (no data URI prefix)
    "grayscale_map":  list,    # 2-D nested float list
    "report": {
        "raw_text": str,       # full markdown report
        "sections": {          # 6 keys: title, patient_info, findings, impression, recommendations, disclaimer
            "<key>": {
                "key":      str,
                "title":    str,
                "content":  str,
                "editable": bool
            }
        }
    }
}
```

---

## Imports (what main.py depends on)

```python
from model import load_model          # model.py
from inference import run_full_pipeline  # inference.py
from report_graph import generate_report # report_graph.py
from config import DEVICE, DISEASES      # config.py
```

---

## Editing guidance for AI

| Scenario | What to change |
|---|---|
| Add a new endpoint | Add a new `@app.get/post` route; import whatever backend functions are needed |
| Restrict CORS | Change `allow_origins=["*"]` to a specific list of allowed origins |
| Return additional fields in `/predict` | Add keys to the final `return {}` dict; ensure the source dict has the data |
| Add request validation (e.g., file size limit) | Add checks after `raw_bytes = await file.read()` before calling inference |
| Add authentication | Use FastAPI `Depends()` with a security scheme; apply to relevant endpoints |
| Change API version | Update `version=` in `FastAPI()` constructor |

---

## Do NOT change
- The `await asyncio.to_thread(generate_report, ...)` pattern — removing the thread wrapper
  will block the event loop during all LLM calls, causing request timeouts.
- The `global model` declaration in `lifespan` — without it, the assignment won't update the module-level variable.
- The content-type check before inference — the PIL image loader will crash on non-image bytes without it.
