import { useState, useRef, useEffect, useCallback } from "react";
import { marked } from "marked";
import { sendChatMessage } from "../../api/chat";
import styles from "./ChatPanel.module.css";

marked.setOptions({ breaks: true, gfm: true });

/**
 * @param {{ reportText: string }} props
 */
export default function ChatPanel({ reportText }) {
  const [messages,  setMessages]  = useState([]); // { role: "user"|"assistant", text, dbsQueried?, sources? }
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [chatError, setChatError] = useState("");
  const sessionIdRef = useRef(null);
  const reportSentRef = useRef(false); // send report_context only on first turn
  const messagesEndRef = useRef(null);
  const textAreaRef    = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Reset session when a new report arrives
  useEffect(() => {
    sessionIdRef.current  = null;
    reportSentRef.current = false;
    setMessages([]);
    setChatError("");
  }, [reportText]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setChatError("");
    setMessages(prev => [...prev, { role: "user", text: trimmed }]);
    setLoading(true);

    try {
      const payload = {
        sessionId: sessionIdRef.current ?? undefined,
        message:   trimmed,
      };

      // Always send the report context. If the backend restarts, it will recreate the 
      // in-memory session and needs this context to restore the state.
      if (reportText) {
        payload.reportContext = reportText;
      }

      const res = await sendChatMessage(payload);

      // Persist session id for subsequent turns
      sessionIdRef.current = res.sessionId;

      setMessages(prev => [
        ...prev,
        {
          role:              "assistant",
          text:              res.answer,
          intermediateSteps: res.intermediateSteps,
        },
      ]);
    } catch (err) {
      setChatError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, reportText]);

  const handleKeyDown = (e) => {
    // Send on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleClear = async () => {
    setMessages([]);
    setChatError("");
    sessionIdRef.current  = null;
    reportSentRef.current = false;
  };

  const hasMessages = messages.length > 0;

  return (
    <div className={styles.panel} aria-label="Dr. Chakshu chatbot">

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.avatarIcon} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <p className={styles.headerTitle}>Dr. Chakshu</p>
            <p className={styles.headerSub}>AI radiology assistant</p>
          </div>
        </div>
        {hasMessages && (
          <button className={styles.clearBtn} onClick={handleClear} aria-label="Clear conversation">
            Clear chat
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">

        {!hasMessages && !loading && (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <p className={styles.welcomeTitle}>Ask about this report</p>
            <p className={styles.welcomeText}>
              I have full context of the generated report. Ask me anything about the findings, implications, or next steps.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.messageRow} ${msg.role === "user" ? styles.messageRowUser : styles.messageRowAssistant}`}
          >
            <div
              className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}
              // Use dangerouslySetInnerHTML only for assistant markdown rendering
              {...(msg.role === "assistant"
                ? { dangerouslySetInnerHTML: { __html: marked.parse(msg.text) } }
                : { children: msg.text }
              )}
            />

            {/* Tool Calls (Thought Process) */}
            {msg.role === "assistant" && msg.intermediateSteps?.length > 0 && (
              <details style={{ marginTop: 8, fontSize: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
                <summary style={{ padding: "6px 10px", cursor: "pointer", color: "#64748b", fontWeight: 500, display: "flex", alignItems: "center", gap: 6, userSelect: "none", outline: "none" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                  View agent thought process ({msg.intermediateSteps.length} steps)
                </summary>
                <div style={{ padding: "8px 10px", borderTop: "1px solid #e2e8f0", color: "#475569", maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {msg.intermediateSteps.map((step, si) => (
                    <div key={si} style={{ background: "#fff", padding: 6, borderRadius: 4, border: "1px solid #f1f5f9" }}>
                      {step.type === "action" ? (
                        <>
                          <div style={{ color: "#2563eb", fontWeight: 600, marginBottom: 2 }}>🛠 Tool: {step.tool}</div>
                          <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>Input: {JSON.stringify(step.input)}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ color: "#16a34a", fontWeight: 600, marginBottom: 2 }}>👁 Result:</div>
                          <div style={{ fontSize: "11px", lineHeight: 1.4 }}>{step.output}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className={`${styles.messageRow} ${styles.typingRow}`}>
            <div className={styles.typingBubble} aria-label="Dr. Chakshu is typing">
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}

        {/* Chat-level error */}
        {chatError && (
          <div className={styles.chatError} role="alert">
            ⚠️ {chatError}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ── */}
      <div className={styles.inputBar}>
        <textarea
          ref={textAreaRef}
          id="chat-input"
          className={styles.textArea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the report…"
          rows={1}
          disabled={loading}
          aria-label="Type your message"
        />
        <button
          className={styles.sendBtn}
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

    </div>
  );
}
