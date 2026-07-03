# ChestXRay Diagnosis Tool

An AI-powered multi-stage diagnostic assistant for radiologists. The system ingests a patient's Chest X-ray, classifies it for three target diseases, generates a visual Grad-CAM saliency heatmap explaining the model's focus, and drafts a structured clinical report through a two-agent LangGraph RAG pipeline.

> ⚠️ **Disclaimer:** This tool is intended for research and educational purposes only. It is **not** a certified medical device. All AI-generated reports must be reviewed and validated by a licensed radiologist before any clinical use.

---

## Pipeline Overview

```
[Chest X-Ray Image]
        │
        ▼
┌───────────────────┐
│   MODULE A        │  ← DenseNet-121 (fine-tuned on NIH ChestX-ray14)
│   Classification  │    Multi-label: 3 diseases
│   Status: ✅ Done │    Mean AUC-ROC: 0.7735
└───────┬───────────┘
        │  Disease probabilities
        ▼
┌───────────────────┐
│   MODULE B        │  ← pytorch-grad-cam + FastAPI
│   Explainability  │    Grad-CAM heatmap overlay
│   Status: ✅ Done │    for highest-probability disease
└───────┬───────────┘
        │  Heatmap + findings
        ▼
┌───────────────────┐
│   MODULE C        │  ← LangGraph (Scribe → Auditor) + FAISS + Gemini 2.5 Flash
│   RAG Report      │    Two-agent loop with structured section output
│   Status: ✅ Done │    FAISS vector store, HuggingFace embeddings
└───────┬───────────┘
        │  Structured report (raw text + parsed sections)
        ▼
┌───────────────────┐
│   FRONTEND        │  ← React + Vite
│   Web UI          │    Upload → Heatmap → Findings → Editable Report
│   Status: ✅ Done │
└───────────────────┘
```

---

## Target Diseases

| Disease | NIH CSV Label | Description |
|---|---|---|
| Cardiomegaly | `Cardiomegaly` | Enlarged heart — visible as increased cardiac silhouette |
| Pleural Effusion | `Effusion` | Fluid accumulation in the pleural space |
| Pneumothorax | `Pneumothorax` | Collapsed lung — visible as absent lung markings |
| Healthy Baseline | `No Finding` | No pathology detected |

---

## Module A — Classification ✅

**Goal:** Multi-label binary classification for 3 diseases from a single X-ray image.

**Architecture:**
- **Backbone:** DenseNet-121 pre-trained on ImageNet
- **Classifier:** Final layer replaced with `nn.Linear(1024, 3)`
- **Loss:** `BCEWithLogitsLoss` (independent sigmoid per disease)
- **Optimizer:** Adam with `ReduceLROnPlateau` scheduler
- **Training:** Mixed precision (AMP), early stopping (patience=5)

**Dataset:**
- **Source:** NIH Chest X-ray 14 (via Kaggle) — 112,000 images
- **Filtered:** ~57,000 images relevant to 3 target diseases + No Finding
- **Split:** 70% train / 15% val / 15% test — **patient-aware** (no data leakage)
- **Imbalance Handling:** `WeightedRandomSampler` to up-sample minority classes

**Results (trained on 10K subset):**

| Disease | AUC-ROC |
|---|---|
| Cardiomegaly | 0.7552 |
| Pleural Effusion | 0.8174 |
| Pneumothorax | 0.7478 |
| **Mean** | **0.7735** |

**Notebook:** `backend/data_preprocessing_&_model_training.ipynb`  
**Output:** `backend/models/best_model.pth`

---

## Module B — Explainability (Grad-CAM) & API ✅

**Goal:** Provide a FastAPI endpoint that processes an X-ray and generates a visual saliency heatmap showing *where* the model focused for its primary disease prediction.

**Approach:**
- **API:** FastAPI (`POST /predict`) — version `2.0.0`
- **Library:** `pytorch-grad-cam`
- **Target layer:** `model.features.denseblock4` (last convolutional block)
- **Inference:** Selects the highest-probability disease across all 3 classes, applies `GradCAM` for that class index
- **Output:** JSON with disease name, probability, positive flag (threshold 0.5), Base64-encoded Grad-CAM heatmap overlay, and raw grayscale attention map
- **Color scale:** Blue (low attention) → Red (high attention)

**API Endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns device info and disease list |
| `POST` | `/predict` | Upload PNG/JPEG → returns classification + heatmap + report |

**Files:** `backend/main.py`, `backend/inference.py`, `backend/model.py`, `backend/config.py`

---

## Module C — RAG Clinical Report ✅

**Goal:** Use disease predictions to draft a structured radiology report grounded in disease-specific clinical guidelines, reviewed by a safety auditor before delivery.

**Architecture — Two-Agent LangGraph Loop:**

```
[Scribe Node]  →  writes/rewrites the clinical report
      │
      ▼
[Auditor Node] →  checks safety checklist
      │
      ├── PASS  →  parse sections → END
      └── FAIL  →  send feedback back to Scribe (max 3 iterations)
```

**Components:**
- **LLM:** Google Gemini 2.5 Flash (`gemini-2.5-flash`) via `langchain-google-genai`
- **Embeddings:** `sentence-transformers/all-MiniLM-L6-v2` via HuggingFace Endpoints
- **Vector Store:** FAISS (local, no cloud needed) with disease-specific indexes
- **Knowledge Base:** Medical guideline PDFs chunked into FAISS indexes per disease

**FAISS Retrieval Map:**

| Disease | Indexes Queried |
|---|---|
| Cardiomegaly | `cardiomegaly`, `xraydictionary` |
| Pleural Effusion | `pleuraleffusion_pneumothorax`, `tuberculosis`, `xraydictionary` |
| Pneumothorax | `pleuraleffusion_pneumothorax`, `xraydictionary` |

**Report Sections (parsed for frontend editor):**
- `title` — Report Title
- `patient_info` — Disease, confidence, positive flag, timestamp
- `findings` — `## FINDINGS`
- `impression` — `## CLINICAL IMPRESSION`
- `recommendations` — `## RECOMMENDATIONS`
- `disclaimer` — `## DISCLAIMER` *(read-only)*

**Auditor Checklist:**
1. Has a `## DISCLAIMER` section?
2. Correctly names the detected disease?
3. Has `## RECOMMENDATIONS` with ≥2 actionable steps?
4. If Effusion — mentions TB/NTEP screening?

**Files:** `backend/report_graph.py`, `backend/faiss_db/`, `backend/rag.ipynb`

---

## Frontend — Web UI ✅

**Goal:** A clean, professional interface for radiologists to upload X-rays and view results.

**Stack:** React 18 + Vite

**Features:**
- Drag-and-drop X-ray upload with live thumbnail preview (PNG/JPEG)
- Animated multi-step status indicator during inference
- Side-by-side comparison: Original Radiograph | Grad-CAM Saliency Map
- **Diagnostic Findings card** — confidence bar per disease, Present/Absent pill badge
- **Clinical Report card** — formatted report with Copy-to-clipboard and `.txt` download
- Error banner with descriptive API error messages
- Fully accessible (ARIA roles, keyboard navigation, live regions)

**Components:**

| File | Purpose |
|---|---|
| `App.jsx` | Root — state management, API fetch, layout |
| `UploadZone.jsx` | Drag-and-drop / click-to-browse file input |
| `FindingsCard.jsx` | Per-disease confidence bars and Present/Absent indicators |
| `ReportCard.jsx` | Formatted report display with copy & download actions |
| `index.css` | Design system — dark theme, CSS custom properties, animations |

---

## Project Structure

```
ChestXRay-Diagnosis-Tool/
├── backend/
│   ├── data_preprocessing_&_model_training.ipynb  # Module A (Colab, T4 GPU)
│   ├── gradcam_inference.ipynb                    # Module B exploration
│   ├── rag.ipynb                                  # Module C exploration
│   ├── main.py                                    # FastAPI server (v2.0.0)
│   ├── inference.py                               # ML inference & Grad-CAM pipeline
│   ├── model.py                                   # PyTorch DenseNet-121 loader
│   ├── config.py                                  # Shared configuration
│   ├── report_graph.py                            # LangGraph Scribe→Auditor RAG pipeline
│   ├── faiss_db/                                  # FAISS vector store indexes
│   ├── models/
│   │   └── best_model.pth                         # Trained weights
│   ├── CONTEXT/                                   # Source PDFs for RAG
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                                # Root component
│   │   ├── main.jsx                               # React entry point
│   │   ├── index.css                              # Design system & styles
│   │   ├── icons.jsx                              # SVG icon components
│   │   └── components/
│   │       ├── UploadZone.jsx
│   │       ├── FindingsCard.jsx
│   │       └── ReportCard.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Setup & Running

### Backend

Create and activate a virtual environment (Python 3.11 recommended):

```bash
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Create a `.env` file in `backend/`:

```env
GEMINI_API_KEY=your_google_gemini_api_key
HF_TOKEN=your_huggingface_token
```

Start the API server:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Key Backend Dependencies

| Package | Purpose |
|---|---|
| `fastapi` / `uvicorn` | API server |
| `torch` / `torchvision` | DenseNet-121 inference |
| `grad-cam` | Grad-CAM saliency maps |
| `opencv-python` / `Pillow` | Image processing |
| `langgraph` | Scribe → Auditor agent loop |
| `langchain-google-genai` | Gemini 2.5 Flash LLM |
| `langchain-huggingface` | HuggingFace embeddings |
| `faiss-cpu` | Local vector store |
| `pypdf` / `langchain-text-splitters` | PDF ingestion for RAG |

**Training environment:** Google Colab (T4 GPU recommended)