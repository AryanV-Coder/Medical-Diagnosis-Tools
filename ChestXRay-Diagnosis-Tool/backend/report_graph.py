import os
import re
import datetime
from typing import TypedDict

from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langgraph.graph import StateGraph, END

load_dotenv()

FAISS_DB_DIR = os.path.join(os.path.dirname(__file__), "faiss_db")

RETRIEVAL_MAP = {
    "Cardiomegaly": ["cardiomegaly", "xraydictionary"],
    "Effusion":     ["pleuraleffusion_pneumothorax", "tuberculosis", "xraydictionary"],
    "Pneumothorax": ["pleuraleffusion_pneumothorax", "xraydictionary"],
}

embeddings = HuggingFaceEndpointEmbeddings(
    model="sentence-transformers/all-MiniLM-L6-v2",
    huggingfacehub_api_token=os.getenv("HF_TOKEN"),
)

# Vision model for the Scribe — sees both images
vision_llm = ChatGroq(
    model="meta-llama/llama-4-scout-17b-16e-instruct",
    api_key=os.getenv("GROQ_API_KEY"),
    temperature=0.3,
)

# Text-only model for the Auditor — just checks the text draft
llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    api_key=os.getenv("GROQ_API_KEY"),
    temperature=0.3,
)


# ── State ──────────────────────────────────────────────────────────────────────
class ReportState(TypedDict):
    disease:         str
    probability:     float
    positive:        bool
    all_probs:       dict   # {"Cardiomegaly": 0.85, "Effusion": 0.12, "Pneumothorax": 0.02}
    original_base64: str   # base64 PNG of the original X-ray
    heatmap_base64:  str   # base64 PNG of the Grad-CAM heatmap
    context:         str
    draft:           str
    feedback:        str
    final:           str
    sections:        dict
    iterations:      int


# ── Helpers ────────────────────────────────────────────────────────────────────
def fetch_context(disease: str) -> str:
    chunks = []
    for name in RETRIEVAL_MAP.get(disease, ["xraydictionary"]):
        index = FAISS.load_local(
            os.path.join(FAISS_DB_DIR, name),
            embeddings,
            allow_dangerous_deserialization=True,
        )
        docs = index.similarity_search(f"{disease} chest xray diagnosis management", k=3)
        chunks.extend(d.page_content for d in docs)
    return "\n\n---\n\n".join(chunks)


def _confidence_table(all_probs: dict) -> str:
    """Build a formatted confidence table string for injection into the prompt."""
    lines = []
    for disease, prob in all_probs.items():
        lines.append(f"  - **{disease}:** {prob * 100:.1f}%")
    return "\n".join(lines)


def parse_sections(report: str, state: ReportState) -> dict:
    """Split the flat report text into named sections for the frontend editor."""

    # ── Invalid image case ────────────────────────────────────────────────────
    if "## INVALID IMAGE" in report.upper():
        m = re.search(r"##\s*INVALID IMAGE\s*\n(.*)", report, re.DOTALL | re.IGNORECASE)
        body = m.group(1).strip() if m else "The uploaded image is not a valid chest X-ray."
        return {
            "invalid": {
                "key":      "invalid",
                "title":    "Invalid Image",
                "content":  body,
                "editable": False,
            }
        }

    # ── Normal report case ────────────────────────────────────────────────────
    def extract(header):
        m = re.search(
            rf"##\s*{re.escape(header)}\s*\n(.*?)(?=\n##\s|\Z)",
            report, re.DOTALL | re.IGNORECASE
        )
        return m.group(1).strip() if m else ""

    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    conf_lines = "\n\n".join(
        f"**{d}:** {p * 100:.1f}%" for d, p in state["all_probs"].items()
    )

    return {
        "demographics": {
            "key":      "demographics",
            "title":    "Patient Demographics & Exam Details",
            "content":  (
                f"**Study:** Digital Chest X-Ray (CXR)\n\n"
                f"**Date/Time of Exam:** {now}\n\n"
                f"**Views:** PA / AP (specify on review)\n\n"
                f"**Clinical Indication:** To be completed by reviewing physician\n\n"
                f"**Comparison:** None available"
            ),
            "editable": True,
        },
        "technique": {
            "key":      "technique",
            "title":    "Technique & AI Processing",
            "content":  (
                f"**Imaging Technique:** Standard digital radiography\n\n"
                f"**AI Analysis:** Processed via DenseNet-121 Multi-Label Vision Model (v1.0)\n\n"
                f"**AI Confidence Scores:**\n\n{conf_lines}"
            ),
            "editable": False,
        },
        "findings": {
            "key":      "findings",
            "title":    "Findings",
            "content":  extract("FINDINGS"),
            "editable": True,
        },
        "impression": {
            "key":      "impression",
            "title":    "Impression",
            "content":  extract("IMPRESSION"),
            "editable": True,
        },
        "recommendations": {
            "key":      "recommendations",
            "title":    "RAG Clinical Recommendations (Lifecycle/Triage)",
            "content":  extract("RAG CLINICAL RECOMMENDATIONS"),
            "editable": True,
        },
        "disclaimer": {
            "key":      "disclaimer",
            "title":    "Mandatory AI Safety Disclaimer",
            "content":  extract("MANDATORY AI SAFETY DISCLAIMER"),
            "editable": False,
        },
    }


# ── Node 1: Scribe ─────────────────────────────────────────────────────────────
def scribe(state: ReportState) -> ReportState:
    """Write (or rewrite) the report. Sends both images to the vision model."""

    if not state["feedback"]:
        context = fetch_context(state["disease"])
        conf_table = _confidence_table(state["all_probs"])
        text_prompt = f"""You are a senior radiologist reviewing an uploaded medical image.

You are provided with two images:
- Image 1: The UPLOADED IMAGE (check whether this is a chest X-ray)
- Image 2: The Grad-CAM heatmap from an AI model

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — IMAGE VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Look at Image 1. Is it a chest X-ray (a radiograph showing the thorax, ribcage, lungs, and heart)?

If NO — output ONLY this and nothing else:

## INVALID IMAGE
The uploaded image does not appear to be a chest X-ray. A valid PA or AP chest radiograph of the thorax is required for AI-assisted analysis. Please re-upload a correct chest X-ray image.

Do NOT produce any other sections. Stop here.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — WRITE THE REPORT (only if Image 1 IS a chest X-ray)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ CRITICAL SAFETY RULES — YOU MUST FOLLOW THESE STRICTLY:
1. You are NOT performing independent radiology. Do NOT diagnose anything by looking at the images yourself.
2. The ONLY confirmed finding is what the AI model detected: **{state['disease']}** at **{state['probability'] * 100:.1f}% confidence**.
3. Use Image 2 (Grad-CAM) ONLY to describe the specific anatomical region highlighted (e.g. "cardiac silhouette", "left lower lung zone"). Do NOT use it to make a new diagnosis.
4. Write about ONLY **{state['disease']}**. Do NOT mention any other disease by name — not even to say it was not found.
5. For areas NOT related to **{state['disease']}**, write "No acute abnormality detected by the AI model".
6. Do NOT use phrases like "I observe", "I notice", or "appears to show".

Primary AI-detected finding: **{state['disease']}** at **{state['probability'] * 100:.1f}%**

Relevant medical guideline extracts (use ONLY these for recommendations — do not invent clinical steps):
{context}

---

Write ONLY the following four sections using these EXACT headers (## prefix).
Format: **bold** for key terms, bullet points for lists, no extra headings inside sections.

## FINDINGS

- **Lungs and Pleura:** [Write here ONLY if {state['disease']} is Effusion or Pneumothorax. Use Image 2 to state which specific lung region is highlighted. For any other disease write: No acute abnormality detected by the AI model.]
- **Heart and Mediastinum:** [Write here ONLY if {state['disease']} is Cardiomegaly. Use Image 2 to state which specific cardiac region is highlighted. For any other disease write: No acute abnormality detected by the AI model.]
- **Bones and Soft Tissues:** No acute abnormality detected by the AI model.
- **Hardware/Lines/Tubes:** None identified.
- **Localization:** The Grad-CAM heatmap (Image 2) highlights the [fill in the specific anatomical region you see highlighted in Image 2, e.g. "cardiac silhouette" or "right lower lung zone"] as the region most associated with the AI model's detection of **{state['disease']}**.

## IMPRESSION

- **{state['disease']}** detected by the AI model at **{state['probability'] * 100:.1f}% confidence**. [Add one sentence on its clinical significance based on the provided guideline extracts.]

## RAG CLINICAL RECOMMENDATIONS

Use ONLY the guideline extracts above. Do not invent any step not present in those extracts.

- **Suggested Action:** [One specific evidence-based next step from the provided guideline extracts for **{state['disease']}**.]
- **Regional Protocol Flag:** [If {state['disease']} is Effusion: flag MoHFW/NTEP TB screening. For all other diseases: state the relevant regional standard from the provided guideline extracts.]

## MANDATORY AI SAFETY DISCLAIMER
**ALERT:** This report was generated by an artificial intelligence triage assistant. The findings and suggested recommendations are for investigational and prioritization purposes only. This document does not constitute a final medical diagnosis and **must be independently verified by a licensed, board-certified physician before initiating any patient care**.
"""

        # Build multimodal message: text + original image + heatmap
        message = HumanMessage(content=[
            {"type": "text", "text": text_prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{state['original_base64']}"}},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{state['heatmap_base64']}"}},
        ])
        draft = vision_llm.invoke([message]).content

    else:
        context = state["context"]
        # Revision also uses the vision model with images —
        # some auditor checks (e.g. Localization too generic) require seeing Image 2 to fix properly
        revision_prompt = f"""You are a senior radiologist revising a chest X-ray report.

You are provided with the same two images as before:
- Image 1: The ORIGINAL chest X-ray
- Image 2: The Grad-CAM heatmap (shows WHERE the AI model is focusing)

⚠️ SAFETY RULES (same as the original draft — do not violate these during revision):
1. Do NOT add any new diagnosis or finding beyond what the AI model already detected: **{state['disease']}** at **{state['probability'] * 100:.1f}%**.
2. Do NOT invent clinical recommendations not present in the original draft's guideline extracts.
3. Do NOT use phrases like "I observe" or "appears to show".
4. For all unflagged areas, keep the "No acute abnormality detected by the AI model" phrasing.

The auditor flagged these specific issues with your previous draft:
{state['feedback']}

Your previous draft:
{state['draft']}

Fix ONLY the flagged issues. Keep all other content exactly as is.
Preserve all Markdown formatting (**bold**, bullet points).
Keep the same four section headers: ## FINDINGS, ## IMPRESSION, ## RAG CLINICAL RECOMMENDATIONS, ## MANDATORY AI SAFETY DISCLAIMER.
Output ONLY the corrected report text — no preamble, no commentary.
"""
        message = HumanMessage(content=[
            {"type": "text", "text": revision_prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{state['original_base64']}"}},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{state['heatmap_base64']}"}},
        ])
        draft = vision_llm.invoke([message]).content

    return {**state, "context": context, "draft": draft, "feedback": "", "iterations": state["iterations"] + 1}


# ── Node 2: Auditor ────────────────────────────────────────────────────────────
def auditor(state: ReportState) -> ReportState:
    """Check the draft. Return PASS or FAIL+feedback."""

    # ── Fast-pass for invalid image reports ───────────────────────────────────
    if "## INVALID IMAGE" in state["draft"].upper():
        sections = parse_sections(state["draft"], state)
        return {**state, "final": state["draft"], "sections": sections, "feedback": ""}

    # ── Normal checklist ──────────────────────────────────────────────────────
    prompt = f"""You are a medical safety auditor reviewing an AI-generated chest X-ray report.

The ONLY confirmed disease for this report is: **{state['disease']}**.

Check the draft against ALL of the following:
1. Does it have a ## MANDATORY AI SAFETY DISCLAIMER section containing the word "physician"?
2. Does it have a ## FINDINGS section with ALL five sub-areas: Lungs and Pleura, Heart and Mediastinum, Bones and Soft Tissues, Hardware/Lines/Tubes, Localization?
3. Does the Localization line describe a SPECIFIC anatomical region (e.g. "cardiac silhouette", "left lower zone") — NOT just a generic placeholder like "the region of the image"?
4. Does it have a ## IMPRESSION section with at least one bullet point?
5. Does it have a ## RAG CLINICAL RECOMMENDATIONS section with at least one actionable step?
6. If the disease is "Effusion", does it mention TB or NTEP screening?
7. Does it correctly identify **{state['disease']}** as the primary finding?
8. Does it mention ONLY **{state['disease']}** by name — NOT any other disease from this list: {[d for d in state['all_probs'].keys() if d != state['disease']]}? (Single-disease focus check.)

Reply in EXACTLY this format and nothing else:

VERDICT: PASS

or

VERDICT: FAIL
FEEDBACK:
- [specific issue 1]
- [specific issue 2]

Draft:
{state['draft']}
"""
    response = llm.invoke(prompt).content.strip()

    # Robust verdict extraction
    verdict_match = re.search(r"VERDICT:\s*(PASS|FAIL)", response, re.IGNORECASE)
    verdict = verdict_match.group(1).upper() if verdict_match else "FAIL"

    if verdict == "PASS":
        sections = parse_sections(state["draft"], state)
        return {**state, "final": state["draft"], "sections": sections, "feedback": ""}
    else:
        feedback_match = re.search(r"FEEDBACK:\s*(.*)", response, re.DOTALL | re.IGNORECASE)
        feedback = feedback_match.group(1).strip() if feedback_match else response
        return {**state, "feedback": feedback}


# ── Conditional edge ───────────────────────────────────────────────────────────
def route_after_auditor(state: ReportState) -> str:
    if not state["feedback"] or state["iterations"] >= 3:
        return END
    return "scribe"


# ── Graph ──────────────────────────────────────────────────────────────────────
graph = StateGraph(ReportState)
graph.add_node("scribe",  scribe)
graph.add_node("auditor", auditor)
graph.set_entry_point("scribe")
graph.add_edge("scribe", "auditor")
graph.add_conditional_edges("auditor", route_after_auditor)
report_graph = graph.compile()


# ── Public function ────────────────────────────────────────────────────────────
def generate_report(
    disease: str,
    probability: float,
    positive: bool,
    all_probs: dict,
    original_base64: str,
    heatmap_base64: str,
) -> dict:
    result = report_graph.invoke({
        "disease":         disease,
        "probability":     probability,
        "positive":        positive,
        "all_probs":       all_probs,
        "original_base64": original_base64,
        "heatmap_base64":  heatmap_base64,
        "context":         "",
        "draft":           "",
        "feedback":        "",
        "final":           "",
        "sections":        {},
        "iterations":      0,
    })
    return {
        "raw_text": result["final"],
        "sections": result["sections"],
    }
