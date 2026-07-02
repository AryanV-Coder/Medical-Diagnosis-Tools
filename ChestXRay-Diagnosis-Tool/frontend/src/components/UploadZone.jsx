import { useState, useRef, useCallback } from 'react'

function formatBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// X icon inline
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// Upload arrow icon
function UpIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

export default function UploadZone({ onFileSelected, disabled }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const inputRef                = useRef(null)

  const accept = f => {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    onFileSelected(f)
  }

  const clear = useCallback(() => {
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    onFileSelected(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [preview, onFileSelected])

  const onDragOver  = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop      = e => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.type === 'image/png' || f.type === 'image/jpeg')) accept(f)
  }
  const onChange = e => { const f = e.target.files[0]; if (f) accept(f) }

  if (file) {
    return (
      <div className="file-preview">
        <img src={preview} alt="Preview" className="file-preview__thumb" />
        <div className="file-preview__meta">
          <div className="file-preview__name" title={file.name}>{file.name}</div>
          <div className="file-preview__size">{formatBytes(file.size)}</div>
        </div>
        <button
          className="file-preview__remove"
          onClick={clear}
          disabled={disabled}
          aria-label="Remove file"
        >
          <XIcon />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`upload-zone${dragging ? ' upload-zone--drag' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      aria-label="Upload chest X-ray image"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={onChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="upload-zone__icon">
        <UpIcon />
      </div>
      <p className="upload-zone__label">Drop chest X-ray here, or click to browse</p>
      <p className="upload-zone__sub">
        Accepts PA and AP projections exported from DICOM
      </p>
      <span className="upload-zone__cta">Select File</span>
      <p className="upload-zone__formats">PNG / JPEG &nbsp;&bull;&nbsp; Max 10 MB</p>
    </div>
  )
}
