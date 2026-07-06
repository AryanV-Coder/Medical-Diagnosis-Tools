import { useRef, useState, useCallback } from "react";
import styles from "./UploadPanel.module.css";

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg"];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {{ file: File|null, onChange: (file: File|null) => void }} props
 */
export default function UploadPanel({ file, onChange }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((candidate) => {
    if (!candidate) return;
    if (!ACCEPTED.includes(candidate.type)) {
      alert("Only PNG or JPEG images are supported.");
      return;
    }
    onChange(candidate);
  }, [onChange]);

  /* ── Drag handlers ── */
  const onDragEnter = (e) => { e.preventDefault(); setDragging(true); };
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  };

  /* ── Keyboard support ── */
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const panelClass = [
    styles.panel,
    dragging ? styles.dragging : "",
    file ? styles.hasFile : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      id="upload-panel"
      className={panelClass}
      role="button"
      tabIndex={0}
      aria-label="Upload chest X-ray image"
      onClick={() => !file && inputRef.current?.click()}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        id="file-input"
        type="file"
        accept="image/png,image/jpeg"
        className={styles.hiddenInput}
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        aria-hidden="true"
      />

      {file ? (
        <PreviewRow file={file} onClear={() => { onChange(null); inputRef.current.value = ""; }} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <>
      <div className={styles.iconWrapper}>
        {/* Upload cloud icon (inline SVG — no extra dep) */}
        <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.4} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 3.75 3.75 0 0 1 4.13 5.095H18a3 3 0 0 1-3 3H6.75Z" />
        </svg>
      </div>
      <p className={styles.heading}>
        <span className={styles.accent}>Click to upload</span> or drag & drop
      </p>
      <p className={styles.sub}>PNG or JPEG · Chest X-ray images only</p>
    </>
  );
}

function PreviewRow({ file, onClear }) {
  const src = URL.createObjectURL(file);
  return (
    <div className={styles.previewWrapper}>
      <img src={src} alt="Selected X-ray thumbnail" className={styles.previewThumb} />
      <div className={styles.previewInfo}>
        <p className={styles.previewName}>{file.name}</p>
        <p className={styles.previewSize}>{formatBytes(file.size)}</p>
      </div>
      <button
        id="clear-file-btn"
        className={styles.clearBtn}
        aria-label="Remove selected file"
        onClick={(e) => { e.stopPropagation(); onClear(); }}
      >
        {/* X icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
