# ChestXRay Diagnosis Tool

An AI-powered multi-stage diagnostic assistant designed for both doctors and patients. The system ingests a Chest X-ray, classifies it for three target diseases, generates a visual Grad-CAM saliency heatmap explaining the model's focus, and drafts a structured clinical report through a two-agent LangGraph RAG pipeline. Additionally, the integrated AI chat system is specifically built to help patients understand their health by simplifying complex medical terms, ensuring that the diagnostic results are clear and accessible to everyone.

> ⚠️ **Disclaimer:** This tool is intended for research and educational purposes only. It is **not** a certified medical device. All AI-generated reports must be reviewed and validated by a licensed radiologist before any clinical use.

🎥 **[Watch the Demo Video](https://drive.google.com/file/d/1X7yuYM2ie2FDbV43EE0FeBHUg_kFFqE9/view)**

---

## 🇮🇳 Project Vision

This project was built with a clear mission: to advance the medical sector in India by democratizing access to high-quality healthcare. By leveraging cutting-edge AI technologies, we aim to deliver accessible, rapid, and highly accurate diagnostic support. Our goal is to empower patients with understandable health insights while assisting radiologists and healthcare professionals in making critical decisions—especially in resource-constrained and rural environments across the country where expert care is needed most.

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
│   Web UI & Chat   │    Upload → Heatmap → Findings → Editable Report
│   Status: ✅ Done │    Resizable Chat Panel (Dr. Chakshu assistant)
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
| `POST` | `/chat` | Conversational endpoint for the ReAct agent |

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

## Module D — Chat Assistant (Dr. Chakshu) ✅

**Goal:** Provide an interactive conversational agent that can answer user queries about their diagnostic report, query medical databases, and search clinical guidelines.

**Architecture — LangGraph ReAct Agent:**
- **LLM:** Qwen (e.g. `qwen-2.5-32b`) via Groq for high-speed tool calling.
- **Tools:**
  - `search_xray_dictionary`: Queries the local FAISS medical dictionary.
  - `search_cardiomegaly_db` / `search_pleuraleffusion_pneumothorax_db`: Queries disease-specific FAISS indexes.
  - `clinical_web_search`: Uses DuckDuckGo Search (`ddgs`) for live clinical guidelines search (NIH, CDC, WHO).
- **Context Injection:** The user's most recent diagnostic report is dynamically injected into the active message payload as a hidden system context, ensuring the LLM is fully aware of the patient's findings.
- **Frontend Integration:** The UI displays a resizable side panel that renders the agent's thought process (reasoning and tool execution) transparently to the user, similar to modern AI assistant UIs.

**Files:** `backend/chat_agent.py`, `backend/chat_router.py`, `backend/tools.py`

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
- **Interactive Chat Assistant** — Dr. Chakshu panel with drag-to-resize handle, markdown support, and an expandable "Thought process" UI showing the AI's internal reasoning.
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
│   ├── chat_agent.py                              # LangGraph ReAct conversational agent
│   ├── chat_router.py                             # FastAPI router for /chat endpoint
│   ├── tools.py                                   # Tool definitions for the ReAct agent
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
│   │   ├── components/
│   │   │   ├── UploadZone.jsx
│   │   │   ├── FindingsCard.jsx
│   │   │   ├── ReportCard.jsx
│   │   │   └── ChatPanel/                         # Chatbot UI with resizable logic
│   │   └── api/
│   │       ├── predict.js
│   │       └── chat.js
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
GROQ_API_KEY=your_groq_api_key
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

---

**Author:** Aryan Varshney