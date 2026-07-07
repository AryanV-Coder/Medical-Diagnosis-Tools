"""
chat_agent.py — Dr. Chakshu Agentic Chatbot
LangGraph two-node agent: Router → Responder
"""

import os
from typing import TypedDict, Annotated
import operator

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END

load_dotenv()

# ── Constants ──────────────────────────────────────────────────────────────────
FAISS_DB_DIR = os.path.join(os.path.dirname(__file__), "faiss_db")

# Maps DB name → description (used in the Router prompt so the LLM knows what each DB contains)
DB_CATALOGUE = {
    "cardiomegaly":               "Guidelines and clinical information about cardiomegaly, enlarged heart, cardiac silhouette assessment.",
    "pleuraleffusion_pneumothorax": "Clinical guidelines for pleural effusion and pneumothorax diagnosis and management.",
    "tuberculosis":               "TB screening protocols, tuberculosis diagnosis, MoHFW/NTEP guidelines.",
    "xraydictionary":             "General chest X-ray terminology, anatomy, radiograph interpretation fundamentals.",
}

# ── LLM ───────────────────────────────────────────────────────────────────────
llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    api_key=os.getenv("GROQ_API_KEY"),
    temperature=0.2,
)

# ── Embeddings ─────────────────────────────────────────────────────────────────
embeddings = HuggingFaceEndpointEmbeddings(
    model="sentence-transformers/all-MiniLM-L6-v2",
    huggingfacehub_api_token=os.getenv("HF_TOKEN"),
)


# ── State ──────────────────────────────────────────────────────────────────────
class ChatState(TypedDict):
    session_id:     str
    message:        str                                      # latest user message
    history:        list[dict]                               # [{role, content}, ...]
    report_context: str                                      # raw_text of the generated radiology report (optional)
    dbs_to_query:   list[str]                                # chosen by Router
    context:        str                                      # retrieved chunks
    answer:         str                                      # final answer
    sources:        Annotated[list[str], operator.add]       # source chunks shown to user


# ── Helpers ────────────────────────────────────────────────────────────────────
def _retrieve(db_names: list[str], query: str, k: int = 3) -> tuple[str, list[str]]:
    """Query one or more FAISS DBs and return joined context + individual chunks."""
    all_chunks: list[str] = []
    for name in db_names:
        db_path = os.path.join(FAISS_DB_DIR, name)
        if not os.path.isdir(db_path):
            continue
        index = FAISS.load_local(
            db_path,
            embeddings,
            allow_dangerous_deserialization=True,
        )
        docs = index.similarity_search(query, k=k)
        all_chunks.extend(d.page_content for d in docs)

    context = "\n\n---\n\n".join(all_chunks) if all_chunks else "No relevant information found."
    return context, all_chunks


def _history_to_messages(history: list[dict]) -> list:
    """Convert stored history dicts into LangChain message objects."""
    messages = []
    for turn in history:
        if turn["role"] == "user":
            messages.append(HumanMessage(content=turn["content"]))
        else:
            messages.append(AIMessage(content=turn["content"]))
    return messages


# ── Node 1: Router ─────────────────────────────────────────────────────────────
def router(state: ChatState) -> ChatState:
    """
    Classify the user's question and decide which FAISS databases to query.
    Returns a list of DB names.
    """
    catalogue_text = "\n".join(
        f'- "{name}": {desc}' for name, desc in DB_CATALOGUE.items()
    )

    prompt = f"""You are a medical knowledge routing agent for Dr. Chakshu, a chest X-ray diagnostic tool.

You have access to these knowledge bases:
{catalogue_text}

The user asked:
"{state['message']}"

Your job: decide which knowledge base(s) to query to best answer this question.

Rules:
- Return ONLY a comma-separated list of knowledge base names from the list above.
- Include "xraydictionary" for any radiology or X-ray interpretation question.
- Include multiple if the question spans topics (e.g., effusion + TB → both).
- If the question is completely unrelated to chest X-rays or the listed medical topics, return: none
- Do NOT include any explanation, just the names.

Example outputs:
cardiomegaly, xraydictionary
tuberculosis
pleuraleffusion_pneumothorax, tuberculosis, xraydictionary
none
"""

    response = llm.invoke([HumanMessage(content=prompt)]).content.strip().lower()

    if response == "none" or not response:
        dbs = []
    else:
        # Parse comma-separated DB names, validate against known DBs
        raw = [x.strip() for x in response.split(",")]
        dbs = [db for db in raw if db in DB_CATALOGUE]
        if not dbs:
            # Fallback: query all DBs
            dbs = list(DB_CATALOGUE.keys())

    return {**state, "dbs_to_query": dbs}


# ── Node 2: Responder ──────────────────────────────────────────────────────────
def responder(state: ChatState) -> ChatState:
    """
    Retrieve context from chosen DBs and generate a grounded medical answer.
    """
    dbs = state["dbs_to_query"]
    query = state["message"]

    if not dbs:
        # Out-of-scope question
        answer = (
            "I'm Dr. Chakshu, an AI assistant specialised in chest X-ray diagnostics "
            "covering cardiomegaly, pleural effusion, pneumothorax, and tuberculosis. "
            "I wasn't able to find any relevant information in my knowledge base for your question. "
            "Please ask something related to chest radiograph interpretation or these conditions."
        )
        return {**state, "answer": answer, "context": "", "sources": []}

    context, source_chunks = _retrieve(dbs, query)

    # Build the conversation so the LLM has memory
    history_messages = _history_to_messages(state["history"])

    # Optionally inject the patient's generated radiology report
    report_section = ""
    if state.get("report_context", "").strip():
        report_section = f"""

Patient's current AI-generated radiology report (use this as primary patient-specific context):
---
{state['report_context']}
---
When the user asks about "the report", "my result", "the finding", or "what was found", refer to this report.
"""

    system_prompt = SystemMessage(content=f"""You are Dr. Chakshu, a clinical AI assistant specialised in chest X-ray diagnostics.

You answer questions about chest radiograph interpretation, including:
- Cardiomegaly (enlarged heart)
- Pleural Effusion
- Pneumothorax
- Tuberculosis
{report_section}
⚠️ STRICT RULES:
1. If a patient's report is provided above, use it as the primary context for patient-specific questions.
2. Base general clinical knowledge ONLY on the retrieved knowledge base context provided below.
3. Do NOT invent clinical facts, statistics, or recommendations not present in either the report or the context.
4. If the context does not contain enough information to answer, say so clearly.
5. Keep answers concise, structured, and clinically precise.
6. Use bullet points for lists of findings or steps.
7. Do NOT diagnose individual patients — this is a clinical information tool.
8. Always remind the user to consult a licensed physician for actual patient care.

Retrieved knowledge base context:
---
{context}
---
""")

    messages = [system_prompt] + history_messages + [HumanMessage(content=query)]
    response = llm.invoke(messages).content.strip()

    return {
        **state,
        "answer":  response,
        "context": context,
        "sources": source_chunks[:3],  # return top 3 source chunks to the API
    }


# ── Graph ──────────────────────────────────────────────────────────────────────
def _build_graph() -> StateGraph:
    g = StateGraph(ChatState)
    g.add_node("router",    router)
    g.add_node("responder", responder)
    g.set_entry_point("router")
    g.add_edge("router", "responder")
    g.add_edge("responder", END)
    return g.compile()


chat_graph = _build_graph()


# ── Public function ────────────────────────────────────────────────────────────
def run_chat(
    session_id:     str,
    message:        str,
    history:        list[dict],
    report_context: str = "",
) -> dict:
    """
    Run one turn of the chatbot.
    Returns: { answer, dbs_queried, sources }
    """
    result = chat_graph.invoke({
        "session_id":     session_id,
        "message":        message,
        "history":        history,
        "report_context": report_context,
        "dbs_to_query":   [],
        "context":        "",
        "answer":         "",
        "sources":        [],
    })
    return {
        "answer":      result["answer"],
        "dbs_queried": result["dbs_to_query"],
        "sources":     result["sources"],
    }
