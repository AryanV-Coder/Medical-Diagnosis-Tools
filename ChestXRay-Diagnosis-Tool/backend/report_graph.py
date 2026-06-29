import os
import re
import datetime
from typing import TypedDict

from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI
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

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=os.getenv("GEMINI_API_KEY"),
    temperature=0.3,
)


# ── State ──────────────────────────────────────────────────────────────────────
class ReportState(TypedDict):
    disease:      str
    probability:  float
    positive:     bool
    context:      str
    draft:        str          # Scribe's current draft
    feedback:     str          # Auditor's feedback (empty string = approved)
    final:        str
    sections:     dict
    iterations:   int          # safety counter to avoid infinite loops


# ── Helpers ────────────────────────────────────────────────────────────────────
def fetch_context(disease: str) -> str:
    """Load relevant FAISS indexes and return top guideline chunks as a string."""
    chunks = []
    for name in RETRIEVAL_MAP.get(disease, ["xraydictionary"]):
        index = FAISS.load_local(
            os.path.join(FAISS_DB_DIR, name),
            embeddings,
            allow_dangerous_deserialization=True,
        )
        docs = index.similarity_search(f"{disease} chest xray diagnosis", k=3)
        chunks.extend(d.page_content for d in docs)
    return "\n\n---\n\n".join(chunks)


def parse_sections(report: str, state: ReportState) -> dict:
    """Split the flat report text into named sections for the frontend editor."""
    def extract(header):
        m = re.search(rf"##\s*{re.escape(header)}\s*\n(.*?)(?=\n##\s|\Z)", report, re.DOTALL | re.IGNORECASE)
        return m.group(1).strip() if m else ""

    return {
        "title":           {"key": "title",           "title": "Report Title",        "content": "RADIOLOGY REPORT — AI ASSISTED DRAFT",                                                                                                                        "editable": True},
        "patient_info":    {"key": "patient_info",    "title": "Patient Information", "content": f"**Disease detected:** {state['disease']}\n\n**AI Confidence:** {state['probability']:.1%}\n\n**Positive finding:** {'Yes' if state['positive'] else 'No'}\n\n**Date:** {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", "editable": True},
        "findings":        {"key": "findings",        "title": "Findings",            "content": extract("FINDINGS"),          "editable": True},
        "impression":      {"key": "impression",      "title": "Clinical Impression", "content": extract("CLINICAL IMPRESSION"), "editable": True},
        "recommendations": {"key": "recommendations", "title": "Recommendations",     "content": extract("RECOMMENDATIONS"),    "editable": True},
        "disclaimer":      {"key": "disclaimer",      "title": "Disclaimer",          "content": extract("DISCLAIMER"),         "editable": False},
    }


# ── Node 1: Scribe ─────────────────────────────────────────────────────────────
def scribe(state: ReportState) -> ReportState:
    """Write (or rewrite) the report. If feedback exists, fix based on it."""

    # First run: fetch context and write from scratch
    # Subsequent runs: fix the draft based on auditor's feedback
    if not state["feedback"]:
        context = fetch_context(state["disease"])
        prompt = f"""You are a senior radiologist. Write a structured clinical radiology report.

Use exactly these four section headers (with ## prefix):
## FINDINGS
## CLINICAL IMPRESSION
## RECOMMENDATIONS
## DISCLAIMER

Formatting rules (this report will be rendered as a document):
- Use **bold** for medical terms, disease names, and key values
- Use bullet points ( - ) for lists
- Keep each section concise and professional
- Do NOT use any other Markdown headings inside sections

Disease detected : **{state['disease']}**
AI Confidence    : **{state['probability']:.1%}**
Positive finding : **{'Yes' if state['positive'] else 'No'}**

Guideline extracts:
{context}
"""
    else:
        context = state["context"]  # reuse already-fetched context
        prompt = f"""You are a senior radiologist. Your previous report draft had issues.

The auditor gave this feedback:
{state['feedback']}

Here is your previous draft:
{state['draft']}

Fix ONLY the issues mentioned in the feedback. Keep everything else unchanged.
Preserve all Markdown formatting (**bold**, bullet points).
Keep the same four section headers: ## FINDINGS, ## CLINICAL IMPRESSION, ## RECOMMENDATIONS, ## DISCLAIMER.
Output only the corrected report text, nothing else.
"""

    draft = llm.invoke(prompt).content
    return {**state, "context": context, "draft": draft, "feedback": "", "iterations": state["iterations"] + 1}


# ── Node 2: Auditor ────────────────────────────────────────────────────────────
def auditor(state: ReportState) -> ReportState:
    """Check the draft. If issues found, return feedback. If clean, approve."""
    prompt = f"""You are a medical safety auditor reviewing a radiology report draft.

Check the draft against this checklist:
1. Has a ## DISCLAIMER section stating it must be reviewed by a licensed radiologist?
2. Correctly names **{state['disease']}** as the detected disease?
3. Has a ## RECOMMENDATIONS section with at least 2 actionable steps?
4. If disease is Effusion, does it mention TB or NTEP screening?

Reply in this exact format:

VERDICT: PASS
(if all checks pass — nothing else needed)

or

VERDICT: FAIL
FEEDBACK:
- [specific issue 1]
- [specific issue 2]
(list only what needs to be fixed, be precise)

Draft:
{state['draft']}
"""
    response = llm.invoke(prompt).content.strip()

    if response.upper().startswith("VERDICT: PASS"):
        # Approved — parse sections and mark as done
        sections = parse_sections(state["draft"], state)
        return {**state, "final": state["draft"], "sections": sections, "feedback": ""}
    else:
        # Extract the feedback lines and send back to Scribe
        feedback = response.replace("VERDICT: FAIL", "").replace("FEEDBACK:", "").strip()
        return {**state, "feedback": feedback}


# ── Conditional edge: route based on auditor verdict ──────────────────────────
def route_after_auditor(state: ReportState) -> str:
    # If approved (feedback is empty and final is set), go to END
    # Safety cap: max 3 iterations to avoid infinite loops
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
def generate_report(disease: str, probability: float, positive: bool) -> dict:
    result = report_graph.invoke({
        "disease":     disease,
        "probability": probability,
        "positive":    positive,
        "context":     "",
        "draft":       "",
        "feedback":    "",
        "final":       "",
        "sections":    {},
        "iterations":  0,
    })
    return {
        "raw_text": result["final"],
        "sections": result["sections"],
    }
