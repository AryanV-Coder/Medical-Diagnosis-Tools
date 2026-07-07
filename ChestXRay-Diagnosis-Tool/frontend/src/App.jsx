import { useState, useCallback, useRef, useEffect } from "react";
import "./App.css";
import UploadPanel from "./components/UploadPanel/UploadPanel";
import ReportCard from "./components/ReportCard/ReportCard";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import { predictXRay } from "./api/predict";

const LOADING_STEPS = [
  "Running ML inference…",
  "Generating Focused Heatmap…",
  "Composing radiology report…",
];

export default function App() {
  const [file, setFile]         = useState(null);
  const [status, setStatus]     = useState("idle"); // idle | loading | done | error
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState("");
  const [stepIdx, setStepIdx]   = useState(0);
  const stepTimer               = useRef(null);
  const originalSrc             = useRef(null);
  const originalDataUrl         = useRef(null);

  // ── Resizable chat panel ──
  const [chatWidth, setChatWidth] = useState(420);
  const isResizing                = useRef(false);
  const startX                    = useRef(0);
  const startWidth                = useRef(420);

  const onResizeStart = useCallback((e) => {
    isResizing.current   = true;
    startX.current       = e.clientX;
    startWidth.current   = chatWidth;
    document.body.style.cursor     = "col-resize";
    document.body.style.userSelect = "none";
  }, [chatWidth]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizing.current) return;
      // Drag LEFT → handle moves left → chat gets wider, report shrinks
      // Drag RIGHT → handle moves right → report gets wider, chat shrinks
      const delta = startX.current - e.clientX;  // left drag = positive
      const next  = Math.min(720, Math.max(280, startWidth.current + delta));
      setChatWidth(next);
    };
    const onMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current             = false;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  }, []);

  // Derived values lifted to component scope
  const reportText = result?.report?.raw_text ?? result?.report ?? "";
  const isInvalid  = reportText.toUpperCase().includes("## INVALID IMAGE");
  const showChat   = status === "done" && !!result && !isInvalid;

  const cycleSteps = () => {
    setStepIdx(0);
    let i = 0;
    stepTimer.current = setInterval(() => {
      i = (i + 1) % LOADING_STEPS.length;
      setStepIdx(i);
    }, 1800);
  };

  const stopSteps = () => clearInterval(stepTimer.current);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;

    originalSrc.current = URL.createObjectURL(file);
    originalDataUrl.current = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });

    setStatus("loading");
    setError("");
    setResult(null);
    cycleSteps();

    try {
      const data = await predictXRay(file);
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err.message ?? "An unexpected error occurred.");
      setStatus("error");
    } finally {
      stopSteps();
    }
  }, [file]);

  const handleFileChange = (newFile) => {
    setFile(newFile);
    if (!newFile) {
      setResult(null);
      setStatus("idle");
      setError("");
    }
  };

  return (
    <div className="appShell">

      {/* ── Header ── */}
      <header className="header" role="banner">
        <div className="headerInner">
          <div className="logoIcon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div className="headerText">
            <h1 className="headerTitle">Dr. Chakshu</h1>
            <p className="headerSub">AI-assisted radiology report generation</p>
          </div>
        </div>
      </header>

      {/* ── Page body ── */}
      <div className={`pageBody${showChat ? " pageBody--chat" : ""}`}>

        {/* Left column — fluid, shrinks as chat grows */}
        <main
          className={`contentCol${showChat ? "" : " contentCol--narrow"}`}
          id="main-content"
          style={showChat ? { flex: "1 1 0", minWidth: 300, maxWidth: "none" } : {}}
        >

          {/* Hero — only shown before a report is ready */}
          {!showChat && status === "idle" && (
            <div className="hero">
              <div className="heroIcon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <h2 className="heroTitle">AI-Powered Chest X-Ray Analysis</h2>
              <p className="heroSub">
                Upload a Chest X-ray and receive an AI-generated radiology report with Focused Heatmap visualisation.
              </p>
              <div className="heroPills">
                <span className="heroPill">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm0 2a8 8 0 1 0 0 16A8 8 0 0 0 12 4zm-1 4h2v5h-2zm0 6h2v2h-2z"/></svg>
                  AI Diagnosis
                </span>
                <span className="heroPill">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Focused Heatmap
                </span>
                <span className="heroPill">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Structured Report
                </span>
                <span className="heroPill">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  AI Chat Assistant
                </span>
              </div>
            </div>
          )}

          {/* Upload */}
          <section aria-label="Upload image">
            <UploadPanel file={file} onChange={handleFileChange} />
          </section>

          {/* Analyze */}
          <section aria-label="Run analysis">
            <button
              id="analyze-btn"
              className="analyzeBtn"
              disabled={!file || status === "loading"}
              onClick={handleAnalyze}
              aria-busy={status === "loading"}
            >
              {status === "loading" ? (
                <><span className="spinner" aria-hidden="true" />Analyzing…</>
              ) : (
                "Analyze X-Ray"
              )}
            </button>
          </section>

          {/* Loading */}
          {status === "loading" && (
            <div className="loadingWrapper" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p className="loadingText">Processing your X-ray…</p>
              <p className="loadingSteps">{LOADING_STEPS[stepIdx]}</p>
            </div>
          )}

          {/* API error */}
          {status === "error" && (
            <div className="errorBanner" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span><strong>Error:</strong> {error}</span>
            </div>
          )}

          {/* Invalid image */}
          {status === "done" && result && isInvalid && (
            <div className="errorBanner" role="alert" style={{ alignItems: "flex-start", gap: 12 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <strong>Invalid Image</strong>
                <p style={{ margin: "4px 0 0", fontWeight: 400 }}>
                  The uploaded file does not appear to be a chest X-ray. Please upload a valid PA or AP chest radiograph for AI-assisted analysis.
                </p>
              </div>
            </div>
          )}

          {/* Report */}
          {showChat && (
            <section aria-label="Diagnosis report">
              <ReportCard
                originalSrc={originalSrc.current}
                originalDataUrl={originalDataUrl.current}
                heatmapBase64={result.heatmap_base64}
                disease={result.disease}
                probability={result.probability}
                positive={result.positive}
                reportText={reportText}
              />
            </section>
          )}

        </main>

        {/* Resize handle + right chat column */}
        {showChat && (
          <>
            {/* ── Drag handle ── */}
            <div
              aria-hidden="true"
              onMouseDown={onResizeStart}
              className="resizeHandle"
            />

            <aside
              className="chatCol"
              aria-label="AI chat assistant"
              style={{ flex: `0 0 ${chatWidth}px`, width: `${chatWidth}px` }}
            >
              <ChatPanel reportText={reportText} />
            </aside>
          </>
        )}

      </div>

      {/* ── Footer ── */}
      <footer className="footer" role="contentinfo">
        For clinical use only. AI output must be reviewed by a licensed radiologist. &copy; {new Date().getFullYear()} Dr. Chakshu.
      </footer>

    </div>
  );
}
