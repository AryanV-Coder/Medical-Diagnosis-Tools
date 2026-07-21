# CONTEXT: chat_assistant.md
# Covers: chat_agent.py, chat_router.py, tools.py
# Read this before modifying the Dr. Chakshu interactive chat functionality.

---

## What this feature does

The Chat Assistant (Dr. Chakshu) is an interactive, conversational LangGraph ReAct (Reasoning and Acting) agent. It allows users to ask questions about their diagnostic report, query local medical guidelines, or search the live clinical web.

---

## File: `chat_agent.py` (The Agent)

This file builds the LangGraph ReAct agent. 

### LLM Setup
- Uses `ChatGroq` for high-speed inference.
- Defaults to a model like `qwen-2.5-32b` or `llama-3.3-70b-versatile`.
- **Note:** Depending on the model, `parallel_tool_calls` may be enabled or disabled based on provider support.

### The Context Injection Hack
A critical challenge with large context-window models is that they often "ignore" long system prompts if the user's message is very short (e.g., "tell me about my report"). 
To fix this, the agent uses a **dynamic context injection**:
- Instead of hiding the patient's report inside the top-level `SystemMessage`, the `report_context` is physically appended to the bottom of the user's most recent `HumanMessage` inside a `[SYSTEM CONTEXT]` block.
- This forces the LLM's attention mechanism to read the report alongside the query.

### State Modification
Because `create_react_agent` abstracts the graph, the injection is done by mutating the `messages` array *before* invoking the graph in `chat_agent()`.

---

## File: `tools.py` (The Tools)

The agent has access to specific tools to augment its knowledge:
1. `search_xray_dictionary`: Uses FAISS to query general X-ray terms.
2. `search_cardiomegaly_db`: Uses FAISS to query cardiomegaly guidelines.
3. `search_pleuraleffusion_pneumothorax_db`: Uses FAISS to query lung fluid/collapse guidelines.
4. `clinical_web_search`: Uses the `ddgs` (DuckDuckGo Search) package to hit the live internet for recent clinical guidelines (e.g., "AHA guidelines 2024"). It restricts queries to trusted domains (nih.gov, cdc.gov, who.int).

*To add a new tool:*
1. Write a function with a detailed Google-style docstring (the LLM reads this to know when to use it).
2. Decorate it with `@tool`.
3. Add it to the `tools = [...]` list in `chat_agent.py`.

---

## File: `chat_router.py` (The API)

Exposes the `POST /chat` endpoint.
- Accepts `message`, `session_id`, and `report_context`.
- Generates a new `uuid4()` if no session is provided.
- Calls `chat_agent` in an `asyncio.to_thread()` wrapper so it doesn't block FastAPI's event loop.
- **Intermediate Steps:** Extracts `msg.tool_calls` and `msg.content` (thoughts) from intermediate `AIMessage`s to stream the agent's internal reasoning back to the frontend.

---

## Editing Guidance

| Scenario | Where to edit |
|---|---|
| Add a new tool | `tools.py`, then add to `chat_agent.py`'s tool list |
| Change the LLM provider | `chat_agent.py` (update `ChatGroq` to `ChatOpenAI` etc.) |
| Tweak the chatbot persona | Update `sys_prompt` in `chat_agent.py` |
| Pass new metadata from frontend | Update `ChatRequest` in `chat_router.py`, pass it into `chat_agent()` |
