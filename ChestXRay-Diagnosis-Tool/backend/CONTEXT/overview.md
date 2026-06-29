# CONTEXT: overview.md
# Project: ChestXRay Diagnosis Tool
# Purpose of this file: high-level map of the entire system so an AI can orient itself
#                        before touching any module.

---

## What this project does (one paragraph)

A user uploads a chest X-ray image. The backend runs a fine-tuned DenseNet-121 to classify
it for three diseases, generates a Grad-CAM heatmap showing where the model focused, then
passes those findings into a LangGraph agentic workflow that retrieves relevant medical
guidelines from a local FAISS vector store and uses Gemini to write (and self-audit) a
structured clinical radiology report. The final JSON response contains the disease name,
probability, positive flag, heatmap image (base64), and a structured report split into
editable sections ready for a frontend editor.

---

## Module map

```
[POST /predict]  ← main.py (FastAPI)
       │
       ▼
 inference.py           → model.py + config.py
 run_full_pipeline()      DenseNet-121 forward pass + Grad-CAM
       │
       │ visual dict
       ▼
 report_graph.py         → faiss_db/ + Gemini API
 generate_report()         LangGraph: Scribe → Auditor loop
       │
       │ report dict
       ▼
 JSON response to caller
```

---

## File index (backend/)

| File | Role | Read this before editing |
|---|---|---|
| `config.py` | Single source of truth for all constants | Always — everything imports from here |
| `model.py` | Build + load the DenseNet-121 | When changing model architecture or checkpoint loading |
| `inference.py` | Image preprocessing, prediction, Grad-CAM | When changing inference logic, output format, or preprocessing |
| `report_graph.py` | LangGraph agentic report graph (Scribe + Auditor) + RAG retrieval | When changing report format, LLM, prompts, or graph structure |
| `main.py` | FastAPI app, lifespan, `/predict` endpoint | When adding endpoints or changing the API response shape |

---

## Shared data contracts (do not break these across files)

### `visual` dict — produced by `inference.py`, consumed by `main.py` and `report_graph.py`
```python
{
    "disease":        str,          # e.g. "Cardiomegaly" — must be one of config.DISEASES
    "probability":    float,        # e.g. 0.8174 — already rounded to 4 decimal places
    "positive":       bool,         # True if probability >= config.THRESHOLD (0.5)
    "heatmap_base64": str,          # base64-encoded PNG string (no data URI prefix)
    "grayscale_map":  list[list],   # 2-D float list of raw CAM values
}
```

### `report` dict — produced by `report_graph.py`, consumed by `main.py`
```python
{
    "raw_text": str,    # full markdown report text
    "sections": {       # structured breakdown for frontend editor
        "title":           {"key": str, "title": str, "content": str, "editable": bool},
        "patient_info":    {"key": str, "title": str, "content": str, "editable": bool},
        "findings":        {"key": str, "title": str, "content": str, "editable": bool},
        "impression":      {"key": str, "title": str, "content": str, "editable": bool},
        "recommendations": {"key": str, "title": str, "content": str, "editable": bool},
        "disclaimer":      {"key": str, "title": str, "content": str, "editable": bool},
    }
}
```

### Final `/predict` JSON response — what the frontend receives
```python
{
    "disease":        str,
    "probability":    float,
    "positive":       bool,
    "heatmap_base64": str,
    "grayscale_map":  list[list],
    "report":         dict,   # the report dict above
}
```

---

## Environment variables (`.env`)
| Variable | Used by | Description |
|---|---|---|
| `GEMINI_API_KEY` | `report_graph.py` | Google Gemini API key |
| `HF_TOKEN` | `report_graph.py` | HuggingFace token for embedding endpoint |

---

## Key invariants — do NOT violate these when editing
1. `config.DISEASES` is the single ordered list `["Cardiomegaly", "Effusion", "Pneumothorax"]`.
   The model's output neuron index matches this order. Never reorder or add to it without retraining.
2. The model checkpoint key is `"model_state_dict"` (not `"state_dict"`). `load_model()` depends on this.
3. `run_full_pipeline()` always returns the **single highest-probability disease** — it is NOT multi-label at API level.
4. `generate_report()` is a synchronous blocking call. `main.py` wraps it in `asyncio.to_thread()` to avoid blocking the event loop.
5. All four section headers in the LLM report must use `## PREFIX` (e.g., `## FINDINGS`) — `parse_sections()` uses regex on these exact strings.

---

## Status
| Module | Status |
|---|---|
| Classification (DenseNet-121) | ✅ Done — AUC 0.7735 |
| Grad-CAM + FastAPI | ✅ Done |
| RAG FAISS knowledge base | ✅ Done — 4 indexes built |
| LangGraph agentic report (Scribe + Auditor) | ✅ Initiated |
| Frontend UI | ⬜ Not started |
