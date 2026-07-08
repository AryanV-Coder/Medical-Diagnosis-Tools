# CONTEXT: chat_panel.md
# Covers: ChatPanel.jsx and api/chat.js

---

## What this component does

`ChatPanel` is the interactive UI for the Dr. Chakshu AI agent. It allows users to ask questions about the generated radiology report. It sits in the right-hand column and maintains a conversational loop with the backend LangGraph agent.

---

## Architecture & State

### State Variables
- `messages`: Array of message objects `{ role: "user"|"assistant", text: string, dbsQueried?: string[], sources?: string[] }`.
- `input`: The current value of the textarea.
- `loading`: Boolean blocking input while waiting for the LLM.
- `chatError`: Displays API/network errors inline.

### Session Persistence
The backend requires a `session_id` to maintain conversation history.
- The frontend holds a `sessionIdRef` (initially `null`).
- On the first request, it sends no session ID. The backend generates a UUID and returns it.
- The frontend saves this to `sessionIdRef.current` and passes it in all subsequent requests.
- **Reset Logic**: When a new X-ray is analyzed (i.e., the `reportText` prop changes), a `useEffect` fires that resets `sessionIdRef.current = null`, clears messages, and effectively starts a fresh chat session.

### The Context Payload Optimization
The LLM requires the `report_context` (the full markdown report) to ground its answers.
- To save bandwidth and backend parsing time, the frontend uses a `reportSentRef`.
- `reportContext` is **only** attached to the payload on the very first message of a new session.
- The backend FastAPI router stores this context in memory (`_sessions`) and automatically re-injects it on subsequent turns for that `session_id`.

---

## UI Features

1. **Markdown Rendering**:
   - User messages are rendered as plain text to prevent injection.
   - Assistant messages are rendered using `marked.parse(msg.text)` and injected via `dangerouslySetInnerHTML`.
   - `marked` is configured with `{ breaks: true, gfm: true }`.

2. **Metadata Chips**:
   - The backend LangGraph agent returns arrays of `dbsQueried` (FAISS indexes) and `sources` (Tavily URLs).
   - If present, `ChatPanel` maps these into visual "chips" below the assistant's message bubble, giving the user transparency into where the AI pulled its medical guidelines from.

3. **Auto-Scrolling**:
   - A `messagesEndRef` is placed at the bottom of the message list.
   - A `useEffect` calls `scrollIntoView({ behavior: "smooth" })` whenever the `messages` array changes or `loading` toggles, ensuring the newest message is always visible.

4. **Keyboard Support**:
   - `Enter` sends the message.
   - `Shift + Enter` inserts a newline.

---

## Editing Guidance

- **If you change the backend `/chat` payload shape**, you must update both `api/chat.js` and `sendMessage` inside `ChatPanel.jsx`.
- **If the user reports white screen crashes on chat load**, verify that no undefined constants (like deleted `SUGGESTIONS` arrays) are being mapped in the JSX.
