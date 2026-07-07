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
            {/* Tool Calls (Thought Process) */}
            {msg.role === "assistant" && msg.intermediateSteps?.length > 0 && (
              <details style={{ marginBottom: 8, fontSize: "13px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
                <summary style={{ padding: "8px 12px", cursor: "pointer", color: "#475569", fontWeight: 500, display: "flex", alignItems: "center", gap: 8, userSelect: "none", outline: "none" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 7.6 7.6 2.4-7.6 2.4L12 22l-2.4-7.6-7.6-2.4 7.6-2.4L12 2z" />
                  </svg>
                  Thought process
                </summary>
                <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", color: "#334155", maxHeight: 250, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {msg.intermediateSteps.map((step, si) => {
                    // Hide raw database observations from the user
                    if (step.type === "observation") return null;

                    if (step.type === "thought") {
                      return (
                        <div key={si} style={{ lineHeight: 1.5 }}>
                          {step.output}
                        </div>
                      );
                    }

                    if (step.type === "action") {
                      // Map technical tool names to user-friendly status updates
                      let actionText = "Searching medical knowledge...";
                      if (step.tool === "clinical_web_search") {
                        actionText = "Searching clinical guidelines...";
                      } else if (step.tool.endsWith("_db")) {
                        actionText = "Searching internal knowledge base...";
                      }

                      const query = step.input?.query;

                      return (
                        <div key={si} style={{ color: "#2563eb", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          {actionText} {query && <span style={{ color: "#64748b", fontWeight: 400 }}>"{query}"</span>}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </details>
            )}

            <div
              className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}
              // Use dangerouslySetInnerHTML only for assistant markdown rendering
              {...(msg.role === "assistant"
                ? { dangerouslySetInnerHTML: { __html: marked.parse(msg.text) } }
                : { children: msg.text }
              )}
            />


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
