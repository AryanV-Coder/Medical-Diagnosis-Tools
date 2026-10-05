"""
chat_router.py — FastAPI endpoints for the Dr. Chakshu chatbot
Mounted into main.py via app.include_router()
"""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio

# run_chat is imported lazily inside the chat endpoint to avoid slow module-level imports
router = APIRouter(prefix="/chat", tags=["Chat"])

# ── In-memory session store ────────────────────────────────────────────────────
# Keyed by session_id → list of {role, content} dicts
# Also stores the report_context per session so it persists across turns
_sessions: dict[str, dict] = {}
# Structure: { session_id: { "history": [...], "report_context": "..." } }


def _get_session(session_id: str) -> dict:
    if session_id not in _sessions:
        _sessions[session_id] = {"history": [], "report_context": ""}
    return _sessions[session_id]


# ── Request / Response schemas ──────────────────────────────────────────────────
class ChatRequest(BaseModel):
    session_id:     Optional[str] = None   # auto-generated if not provided
    message:        str
    report_context: Optional[str] = None   # raw_text of the generated report — send once per session


class ChatResponse(BaseModel):
    session_id:         str
    answer:             str
    intermediate_steps: list[dict]


class HistoryResponse(BaseModel):
    session_id: str
    history:    list[dict]


# ── Endpoints ──────────────────────────────────────────────────────────────────
@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Send a message to the Dr. Chakshu chatbot.

    - If `session_id` is omitted, a new session is created and returned.
    - Optionally pass `report_context` (the raw report text from /predict) once
      per session — it will be remembered for all subsequent turns.
    - The agent automatically selects which knowledge base(s) to query.
    """
    # Create or reuse session
    session_id = req.session_id or str(uuid.uuid4())
    session = _get_session(session_id)

    # Update report_context if provided this turn (only needs to be sent once)
    if req.report_context and req.report_context.strip():
        session["report_context"] = req.report_context.strip()

    history      = session["history"]
    report_ctx   = session["report_context"]

    # Run the agentic graph in a thread (it's synchronous LangGraph)
    try:
        from chat_agent import run_chat
        result = await asyncio.to_thread(
            run_chat,
            session_id,
            req.message,
            history,
            report_ctx,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat agent failed: {e}")

    # Persist this turn into history
    session["history"].append({"role": "user",      "content": req.message})
    session["history"].append({"role": "assistant",  "content": result["answer"]})

    return ChatResponse(
        session_id         = session_id,
        answer             = result["answer"],
        intermediate_steps = result["intermediate_steps"],
    )


@router.get("/history/{session_id}", response_model=HistoryResponse)
async def get_history(session_id: str):
    """Retrieve the full conversation history for a session."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    return HistoryResponse(
        session_id = session_id,
        history    = _sessions[session_id]["history"],
    )


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    """Clear conversation history for a session (keeps report_context)."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    _sessions[session_id]["history"] = []
    return {"session_id": session_id, "status": "history cleared"}
