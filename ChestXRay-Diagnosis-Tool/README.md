# ChestXRay Diagnosis Tool

An AI-powered multi-stage diagnostic assistant for radiologists. The system ingests a patient's Chest X-ray, classifies it for three target diseases, generates a visual heatmap explaining the model's focus, and drafts a structured clinical report using a RAG-augmented LLM.

> ⚠️ **Disclaimer:** This tool is intended for research and educational purposes only. It is **not** a certified medical device. All AI-generated reports must be reviewed and validated by a licensed radiologist before any clinical use.

---

## Pipeline Overview

```
[Chest X-Ray Image]
        │
        ▼
┌───────────────────┐
│   MODULE A        │  ← DenseNet-121 (fine-tuned)
│   Classification  │    Multi-label: 3 diseases
│   Status: ✅ Done │    Mean AUC-ROC: 0.7735
└───────┬───────────┘
        │  Disease probabilities
        ▼
┌───────────────────┐
│   MODULE B        │  ← pytorch-grad-cam
│   Explainability  │    Grad-CAM heatmap overlay
│   Status: ✅ Done │    per-disease visual map
└───────┬───────────┘
        │  Heatmap + findings
        ▼
┌───────────────────┐
│   MODULE C        │  ← ChromaDB + Gemini API
│   RAG Report      │    Retrieval-Augmented Generation
│   Status: ⬜ Todo │    Structured clinical report
└───────┬───────────┘
        │  Draft report
        ▼
┌───────────────────┐
│   FRONTEND        │  ← Streamlit
│   Web UI          │    Upload → Results → Download
│   Status: ⬜ Todo │
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
**Output:** `best_model.pth`

---

## Module B — Explainability (Grad-CAM) 🔄

**Goal:** Generate a visual heatmap overlay on the X-ray showing *where* the model focused for each disease prediction.

**Approach:**
- Library: `pytorch-grad-cam`
- Target layer: `model.features.denseblock4` (last convolutional block)
- Output: 3 heatmap images (one per disease) overlaid on the original X-ray
- Color scale: Blue (low attention) → Red (high attention)

**Notebook:** `backend/gradcam_inference.ipynb` *(coming soon)*

---

## Module C — RAG Clinical Report ⬜

**Goal:** Use disease predictions + heatmap findings to draft a structured radiology report grounded in medical guidelines.

**Architecture:**
- **Knowledge Base:** Medical guidelines for the 3 target diseases (chunked text)
- **Embeddings:** `sentence-transformers` (local, free)
- **Vector Store:** ChromaDB (local, no cloud needed)
- **LLM:** Google Gemini API
- **Pipeline:** Query vector store with findings → retrieve guideline context → inject into prompt → generate report

**Report Format:**
```
RADIOLOGY REPORT
Patient: [ID]    Date: [auto]

FINDINGS:
  Cardiomegaly:     Present (76.2% confidence)
  Pleural Effusion: Absent  (18.4% confidence)
  Pneumothorax:     Present (74.8% confidence)

CLINICAL IMPRESSION:
  [AI-generated paragraph with guideline citations]

RECOMMENDATIONS:
  [AI-generated follow-up suggestions]

DISCLAIMER: AI-assisted draft. Must be reviewed by a licensed radiologist.
```

---

## Frontend — Web UI ⬜

**Goal:** A clean, professional interface for radiologists to upload X-rays and view results.

**Stack:** Streamlit (Python-native, runs locally)

**Features:**
- Drag-and-drop X-ray upload
- Side-by-side: Original X-ray | Grad-CAM Heatmap
- Disease probability bars (per disease)
- AI-generated clinical report panel
- PDF download of the report

**File:** `frontend/app.py` *(coming soon)*

---

## Project Structure

```
ChestXRay-Diagnosis-Tool/
├── backend/
│   ├── data_preprocessing_&_model_training.ipynb  # Module A (Colab)
│   ├── gradcam_inference.ipynb                    # Module B (coming)
│   ├── rag_report_generator.py                    # Module C (coming)
│   └── requirements.txt
├── frontend/
│   └── app.py                                     # Streamlit UI (coming)
├── models/
│   └── best_model.pth                             # Trained weights
└── README.md
```

---

## Setup & Requirements

```bash
pip install -r backend/requirements.txt
```

Key dependencies: `torch`, `torchvision`, `pytorch-grad-cam`, `chromadb`, `sentence-transformers`, `google-generativeai`, `streamlit`

**Training environment:** Google Colab (T4 GPU recommended)

---

## Roadmap

- [x] Module A — Data preprocessing pipeline
- [x] Module A — DenseNet-121 training with patient-aware splits
- [x] Module A — Model evaluation (AUC-ROC per disease)
- [x] Module B — Grad-CAM heatmap generation
- [ ] Module C — Medical guideline knowledge base + vector store
- [ ] Module C — RAG pipeline + report generation
- [ ] Frontend — Streamlit UI
- [ ] Frontend — PDF export
- [ ] Retrain on full 57K dataset for improved AUC
