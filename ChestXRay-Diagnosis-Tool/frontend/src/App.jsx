import { useState, useCallback, useRef } from "react";
import "./App.css";
import UploadPanel from "./components/UploadPanel/UploadPanel";
import ReportCard from "./components/ReportCard/ReportCard";
import { predictXRay } from "./api/predict";

const LOADING_STEPS = [
  "Running ML inference…",
  "Generating Grad-CAM heatmap…",
  "Composing radiology report…",
];

export default function App() {
  const [file, setFile]         = useState(null);
  const [status, setStatus]     = useState("idle"); // idle | loading | done | error
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState("");
  const [stepIdx, setStepIdx]   = useState(0);
  const stepTimer               = useRef(null);
  const originalSrc             = useRef(null); // blob URL — for display only
  const originalDataUrl         = useRef(null); // base64  — for PDF print

  const cycleSteps = () => {
    setStepIdx(0);
    let i = 0;
    stepTimer.current = setInterval(() => {
      i = (i + 1) % LOADING_STEPS.length;
      setStepIdx(i);
    }, 1800);
  };

  const stopSteps = () => {
    clearInterval(stepTimer.current);
  };

  const handleAnalyze = useCallback(async () => {
    if (!file) return;

    // Blob URL for fast in-page display
    originalSrc.current = URL.createObjectURL(file);

    // Base64 dataURL so the print iframe can access it cross-context
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
    // Reset results when a new file is chosen
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

      {/* ── Main ── */}
      <main className="main" id="main-content">

        {/* Step 1 — Upload */}
        <section aria-labelledby="upload-step-label">
          <p id="upload-step-label" className="stepLabel">Step 1 — Upload Image</p>
          <UploadPanel file={file} onChange={handleFileChange} />
        </section>

        {/* Step 2 — Analyze */}
        <section aria-labelledby="analyze-step-label">
          <p id="analyze-step-label" className="stepLabel">Step 2 — Run Analysis</p>
          <button
            id="analyze-btn"
            className="analyzeBtn"
            disabled={!file || status === "loading"}
            onClick={handleAnalyze}
            aria-busy={status === "loading"}
          >
            {status === "loading" ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Analyzing…
              </>
            ) : (
              <>
                Analyze X-Ray
              </>
            )}
          </button>
        </section>

        {/* Loading skeleton */}
        {status === "loading" && (
          <div className="loadingWrapper" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <p className="loadingText">Processing your X-ray…</p>
            <p className="loadingSteps">{LOADING_STEPS[stepIdx]}</p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="errorBanner" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span><strong>Error:</strong> {error}</span>
          </div>
        )}

        {/* Step 3 — Results */}
        {status === "done" && result && (() => {
          const reportText = result.report?.raw_text ?? result.report ?? "";
          const isInvalid  = reportText.toUpperCase().includes("## INVALID IMAGE");

          if (isInvalid) {
            return (
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
            );
          }

          return (
            <section aria-labelledby="results-step-label">
              <p id="results-step-label" className="stepLabel">Step 3 — Review Report</p>
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
          );
        })()}

      </main>

      {/* ── Footer ── */}
      <footer className="footer" role="contentinfo">
        For clinical use only. AI output must be reviewed by a licensed radiologist. &copy; {new Date().getFullYear()} Dr. Chakshu.
      </footer>

    </div>
  );
}
