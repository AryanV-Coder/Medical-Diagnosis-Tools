const BASE = import.meta.env.BACKEND_API_URL ?? "http://localhost:8000";

/**
 * Send a message to the Dr. Chakshu chat agent.
 *
 * @param {{ sessionId?: string, message: string, reportContext?: string }} params
 * @returns {Promise<{ sessionId: string, answer: string, dbsQueried: string[], sources: string[] }>}
 */
export async function sendChatMessage({ sessionId, message, reportContext }) {
  const body = {
    message,
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(reportContext ? { report_context: reportContext } : {}),
  };

  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Chat request failed (${res.status})`);
  }

  const data = await res.json();
  return {
    sessionId: data.session_id,
    answer: data.answer,
    intermediateSteps: data.intermediate_steps ?? [],
  };
}
