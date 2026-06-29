# CONTEXT: rag_pipeline.md
# Covers: rag.ipynb, faiss_db/ directory
# Read this before editing knowledge base construction, embedding model, vector store,
# retrieval logic inside report_graph.py (fetch_context), or adding new diseases.

---

## What this feature does

Offline (notebook), medical guideline PDFs are chunked, embedded, and saved as local FAISS
indexes. At inference time, `fetch_context()` in `report_graph.py` loads the relevant
indexes for the detected disease, runs similarity search, and returns the top chunks as a
plain string that is injected into the Scribe LLM prompt.

---

## Stack

| Component | Choice | Notes |
|---|---|---|
| Document loader | `PyPDFLoader` (LangChain) | Used in notebook to parse PDFs |
| Text splitter | `RecursiveCharacterTextSplitter` | Used in notebook |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` | Via `HuggingFaceEndpointEmbeddings`; requires `HF_TOKEN` env var |
| Vector store | FAISS | Local disk — no cloud; `faiss-cpu` package |
| LLM | Google Gemini 2.5 Flash | Used in `report_graph.py`, NOT in RAG build step |

---

## FAISS indexes — `backend/faiss_db/`

Each subdirectory is a self-contained FAISS index (2 files: `.faiss` + `.pkl`):

| Directory | Medical content | Used for diseases |
|---|---|---|
| `cardiomegaly/` | Cardiomegaly clinical guidelines | Cardiomegaly |
| `pleuraleffusion_pneumothorax/` | Pleural effusion & pneumothorax guidelines | Effusion, Pneumothorax |
| `tuberculosis/` | TB / NTEP screening guidelines | Effusion (TB is a common cause) |
| `xraydictionary/` | General chest X-ray terminology dictionary | All diseases (fallback) |

---

## Retrieval mapping (defined in `report_graph.py`)

```python
RETRIEVAL_MAP = {
    "Cardiomegaly": ["cardiomegaly", "xraydictionary"],
    "Effusion":     ["pleuraleffusion_pneumothorax", "tuberculosis", "xraydictionary"],
    "Pneumothorax": ["pleuraleffusion_pneumothorax", "xraydictionary"],
}
# Default (any disease not in map): ["xraydictionary"]
```
- For each listed index name, `fetch_context()` loads that FAISS folder and calls
  `similarity_search(f"{disease} chest xray diagnosis", k=3)`.
- All retrieved chunks across all indexes are concatenated with `\n\n---\n\n` and returned
  as a single string — this is the `context` field in `ReportState`.

---

## `fetch_context()` function signature (in `report_graph.py`)

```python
def fetch_context(disease: str) -> str:
    # Looks up RETRIEVAL_MAP[disease] (or default)
    # Loads each FAISS index from FAISS_DB_DIR
    # Searches with k=3 per index
    # Returns concatenated chunk string
```
- `FAISS_DB_DIR = os.path.join(os.path.dirname(__file__), "faiss_db")`
- Uses `allow_dangerous_deserialization=True` (required for FAISS pickle loading)
- Called ONLY on the first Scribe iteration (`if not state["feedback"]`)
- On re-runs (after auditor feedback), the already-fetched context is reused from state

---

## How indexes were built (notebook: `rag.ipynb`)
1. PDFs loaded with `PyPDFLoader`
2. Split with `RecursiveCharacterTextSplitter`
3. Embedded with `HuggingFaceEndpointEmbeddings` (same model used at inference)
4. Saved with `FAISS.save_local(path)`

---

## Editing guidance for AI

| Scenario | What to change |
|---|---|
| Add a new disease's knowledge base | Add PDF → run notebook to create new FAISS index → add entry to `RETRIEVAL_MAP` in `report_graph.py` |
| Change embedding model | Update `model=` in `HuggingFaceEndpointEmbeddings` in BOTH `report_graph.py` AND rebuild all indexes in `rag.ipynb` — they must match |
| Change number of retrieved chunks | Change `k=3` in `fetch_context()` in `report_graph.py` |
| Switch from FAISS to another vector store | Replace `FAISS.load_local()` call in `fetch_context()` and the save step in `rag.ipynb` |

---

## Do NOT change
- The embedding model in `report_graph.py` without rebuilding ALL FAISS indexes — mismatched
  embedding dimensions will cause a runtime error.
- The `allow_dangerous_deserialization=True` flag — it is required to load FAISS pickle files.
