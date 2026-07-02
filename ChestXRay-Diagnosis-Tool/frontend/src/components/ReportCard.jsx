import { useState, useCallback } from 'react'

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// Highlight lines that look like section headings
function renderReport(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    const isHeading = /^[A-Z][A-Z\s\-&\/]{3,}:?\s*$/.test(line.trim()) ||
      /^(FINDINGS|IMPRESSION|RECOMMENDATIONS|CLINICAL|RADIOLOGY REPORT|PATIENT|DATE|DISCLAIMER|REPORT\s*DATE):/i.test(line.trim())
    return (
      <span key={i} className={isHeading ? 'hl' : undefined}>
        {line}{'\n'}
      </span>
    )
  })
}

export default function ReportCard({ report }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }, [report])

  const download = useCallback(() => {
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain' }))
    const a   = Object.assign(document.createElement('a'), {
      href: url, download: `radiology-report-${Date.now()}.txt`,
    })
    a.click()
    URL.revokeObjectURL(url)
  }, [report])

  return (
    <div className="card fade-up">
      <div className="card__header">
        <span className="card__title">Clinical Report Draft</span>
        <div className="report-actions">
          <button
            className={`btn-sm${copied ? ' btn-sm--green' : ''}`}
            onClick={copy}
            aria-label="Copy report to clipboard"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="btn-sm" onClick={download} aria-label="Download report">
            <DownloadIcon />
            Download
          </button>
        </div>
      </div>
      <div className="card__body">
        <pre className="report-pre" aria-label="Clinical report">
          {renderReport(report)}
        </pre>
      </div>
    </div>
  )
}
