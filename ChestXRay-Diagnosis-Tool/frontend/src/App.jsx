import { useState, useCallback, useRef } from 'react'
import { IconXray, IconWarning, IconAlertCircle } from './icons'
import UploadZone from './components/UploadZone'
import FindingsCard from './components/FindingsCard'
import ReportCard from './components/ReportCard'

const API_BASE = 'http://localhost:8000'

const STEPS = [
  'Preprocessing image...',
  'Running DenseNet-121 classification...',
  'Generating Grad-CAM heatmap...',
  'Drafting clinical report...',
]

export default function App() {
  const [file, setFile]         = useState(null)
  const [status, setStatus]     = useState('idle') // idle | loading | done | error
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [stepIdx, setStepIdx]   = useState(0)
  const [timestamp, setTs]      = useState(null)

  const stepRef   = useRef(0)
  const timerRef  = useRef(null)

  const startSteps = () => {
    stepRef.current = 0
    setStepIdx(0)
    timerRef.current = setInterval(() => {
      stepRef.current = (stepRef.current + 1) % STEPS.length
      setStepIdx(stepRef.current)
    }, 1800)
  }

  const stopSteps = () => {
    clearInterval(timerRef.current)
    timerRef.current = null
  }

  const handleAnalyze = useCallback(async () => {
    if (!file) return
    setStatus('loading')
    setError(null)
    setResult(null)
    startSteps()

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/predict`, { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Server error ${res.status}`)
      }
      const data = await res.json()
      setResult(data)
      setTs(new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }))
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    } finally {
      stopSteps()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const handleReset = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setStatus('idle')
    setTs(null)
  }

  const originalSrc = file ? URL.createObjectURL(file) : null
  const heatmapSrc  = result?.heatmap_base64
    ? `data:image/png;base64,${result.heatmap_base64}`
    : null

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="container">
          <div className="header__inner">
            <div className="header__brand">
              <div className="header__logo" aria-hidden="true">
                <IconXray />
              </div>
              <div>
                <div className="header__name">ChestXRay Diagnosis Tool</div>
                <div className="header__sub">AI-Assisted Radiology Support System</div>
              </div>
            </div>
            <span className="header__badge">Research Use Only</span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">
        <div className="container">

          {/* Disclaimer */}
          <div className="disclaimer" role="note">
            <IconWarning style={{ width: 15, height: 15, flexShrink: 0 }} />
            <p>
              <strong>Clinical Disclaimer: </strong>
              This tool is intended for research and educational purposes only. It is not a
              certified medical device. All AI-generated outputs must be reviewed and validated
              by a licensed radiologist before any clinical use.
            </p>
          </div>

          {/* Page heading */}
          <div className="page-heading">
            <h1>Chest X-Ray Analysis</h1>
            <p>
              Upload a PA or AP chest radiograph to receive multi-label disease classification,
              Grad-CAM saliency mapping, and a structured clinical report draft.
            </p>
          </div>

          {/* ── Upload section ── */}
          {status !== 'done' && (
            <section aria-labelledby="upload-heading">
              <h2 id="upload-heading" className="sr-only">Upload Radiograph</h2>

              <UploadZone
                onFileSelected={setFile}
                disabled={status === 'loading'}
              />

              {error && status === 'error' && (
                <div className="error-banner" role="alert">
                  <IconAlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                  <div>
                    <span className="error-banner__label">Analysis Failed</span>
                    <span className="error-banner__msg">{error}</span>
                  </div>
                </div>
              )}

              <button
                className="btn-run"
                onClick={handleAnalyze}
                disabled={!file || status === 'loading'}
                aria-busy={status === 'loading'}
              >
                {status === 'loading'
                  ? <><span className="btn-spinner" aria-hidden="true" /> Analysing...</>
                  : 'Run Analysis'}
              </button>

              <div className="status-line" role="status" aria-live="polite">
                {status === 'loading' ? STEPS[stepIdx] : ''}
              </div>
            </section>
          )}

          {/* ── Results section ── */}
          {status === 'done' && result && (
            <section className="results fade-up" aria-labelledby="results-heading">

              <div className="results__topbar">
                <div>
                  <h2 className="results__heading" id="results-heading">Analysis Results</h2>
                  <div className="results__ts">{timestamp}</div>
                </div>
                <button className="btn-new" onClick={handleReset}>
                  New Analysis
                </button>
              </div>

              {/* Images */}
              <div className="image-panel" role="region" aria-label="Radiograph comparison">
                <div className="img-card">
                  <div className="img-card__bar">
                    <span className="img-card__label">Original Radiograph</span>
                    <span className="img-card__tag">INPUT</span>
                  </div>
                  <img
                    src={originalSrc}
                    alt="Uploaded chest X-ray"
                    className="img-card__img"
                  />
                </div>
                <div className="img-card">
                  <div className="img-card__bar">
                    <span className="img-card__label">Grad-CAM Saliency Map</span>
                    <span className="img-card__tag">GRADCAM</span>
                  </div>
                  {heatmapSrc && (
                    <img
                      src={heatmapSrc}
                      alt={`Saliency map for ${result.disease}`}
                      className="img-card__img"
                    />
                  )}
                </div>
              </div>

              {/* Findings */}
              <FindingsCard
                disease={result.disease}
                probability={result.probability}
                positive={result.positive}
              />

              {/* Report */}
              {result.report && <ReportCard report={result.report} />}

            </section>
          )}

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <span className="footer__copy">
              ChestXRay Diagnosis Tool &mdash; Research Prototype &mdash; Not for clinical use
            </span>
            <span className="footer__stack">DenseNet-121 &bull; Grad-CAM &bull; RAG Report</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
