"""
chat_agent.py — Dr. Chakshu Agentic Chatbot
Uses LangGraph's prebuilt ReAct agent for true tool-calling autonomy.
"""

import os
import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langgraph.prebuilt import create_react_agent

from tools import all_tools

load_dotenv()

# ── LLM ───────────────────────────────────────────────────────────────────────
# Using Qwen 3 32B on Groq — it has reliable native tool calling support,
# unlike llama-3.3-70b-versatile which generates broken tool call formats.
llm = ChatGroq(
    model="qwen/qwen3-32b",
    api_key=os.getenv("GROQ_API_KEY"),
    temperature=0.2,
)


# ── Agent Setup ────────────────────────────────────────────────────────────────
# We use the prebuilt ReAct agent. It natively handles the Thought -> Action -> Observation loop.
# We will inject the system prompt dynamically per run so we can include the report context.
chat_agent = create_react_agent(llm, all_tools)


def _format_intermediate_steps(messages: list) -> list[dict]:
    """
    Extracts the tool calls and their results from the message history of the current run.
    This allows the frontend to show the user exactly what the agent was 'thinking' and searching.
    """
    steps = []
    
    # We only care about messages generated during this specific run, but for simplicity,
    # we'll look at the tail of the conversation for recent tool usage.
    for msg in messages:
        if isinstance(msg, AIMessage) and msg.tool_calls:
            for tc in msg.tool_calls:
                steps.append({
                    "type": "action",
                    "tool": tc["name"],
                    "input": tc["args"]
                })
        elif isinstance(msg, ToolMessage):
            # Trim the observation if it's too long so we don't overwhelm the UI
            obs = msg.content
            if len(obs) > 300:
                obs = obs[:300] + "... [truncated]"
            steps.append({
                "type": "observation",
                "tool": msg.name,
                "output": obs
            })
            
    return steps


# ── Public function ────────────────────────────────────────────────────────────
def run_chat(
    session_id:     str,
    message:        str,
    history:        list[dict],
    report_context: str = "",
) -> dict:
    """
    Run one turn of the tool-calling chatbot.
    Returns: { answer, intermediate_steps }
    """
    # 1. Build the dynamic system prompt
    report_section = ""
    if report_context.strip():
        report_section = f"""

Patient's current AI-generated radiology report (use this as primary patient-specific context):
---
{report_context}
---
When the user asks about "the report", "my result", "the finding", or "what was found", refer to this report.
"""

    sys_prompt = f"""You are Dr. Chakshu, a clinical AI assistant specialised in chest X-ray diagnostics.

You answer questions about chest radiograph interpretation, including:
- Cardiomegaly (enlarged heart)
- Pleural Effusion
- Pneumothorax
- Tuberculosis
{report_section}
⚠️ STRICT RULES:
1. If a patient's report is provided above, use it as the primary context for patient-specific questions.
2. For clinical knowledge, ALWAYS use your tools to query the local databases first.
3. If the local databases do not contain the answer, you may use the `clinical_web_search` tool.
4. Do NOT invent clinical facts, statistics, or recommendations.
5. Keep answers concise, structured, and clinically precise.
6. Use bullet points for lists of findings or steps.
7. Do NOT diagnose individual patients — this is a clinical information tool.
8. Always remind the user to consult a licensed physician for actual patient care.
"""

    # 2. Build the message list for this run
    messages = [SystemMessage(content=sys_prompt)]
    
    for turn in history:
        if turn["role"] == "user":
            messages.append(HumanMessage(content=turn["content"]))
        else:
            messages.append(AIMessage(content=turn["content"]))
            
    # Forcefully inject the report into the user's immediate message if they ask about it
    current_message = message
    if report_context.strip():
        current_message += f"\n\n[SYSTEM CONTEXT: The user is asking about their report. Here is the full text of their report. Do not ask them to provide it, it is provided here:]\n---\n{report_context}\n---"

    messages.append(HumanMessage(content=current_message))

    # 3. Invoke the agent
    # The agent will loop internally until it returns a final AIMessage without tool calls.
    result_state = chat_agent.invoke({"messages": messages})
    
    # 4. Extract results
    all_output_messages = result_state["messages"]
    
    # The final message is the agent's response to the user
    final_answer = all_output_messages[-1].content
    
    # We isolate only the messages generated *during this run* to extract intermediate steps.
    # The number of messages passed in was `len(messages)`. Everything after that is new.
    new_messages = all_output_messages[len(messages):]
    intermediate_steps = _format_intermediate_steps(new_messages)

    return {
        "answer": final_answer,
        "intermediate_steps": intermediate_steps,
    }
