import { useRef, useEffect, useCallback, useState } from "react";
import { marked } from "marked";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import styles from "./ReportCard.module.css";

marked.setOptions({ breaks: true, gfm: true });

export default function ReportCard({
  originalSrc,
  originalDataUrl,   // base64 dataURL — safe cross-context
  heatmapBase64,
  disease,
  probability,
  positive,
  reportText,
}) {
  const editorRef     = useRef(null);
  const printRef      = useRef(null);
  const confidencePct = Math.round(probability * 100);
  const [downloading, setDownloading] = useState(false);

  // Detect invalid image — hide all ML output in this case
  const isInvalid = (reportText ?? "").toUpperCase().includes("## INVALID IMAGE");

  // Pre-fill the contenteditable div with rendered markdown on load
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = marked.parse(reportText ?? "");
    }
  }, [reportText]);

  // ── Direct PDF download (no print dialog) ────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!printRef.current || downloading) return;
    setDownloading(true);

    try {
      // Sync the hidden print div's report section with the live editor content
      const printReportEl = printRef.current.querySelector("#print-report-body");
      if (printReportEl && editorRef.current) {
        printReportEl.innerHTML = editorRef.current.innerHTML;
      }

      // Make print div visible off-screen so html2canvas can measure it
      printRef.current.style.visibility = "visible";
      printRef.current.style.left = "-9999px";

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: printRef.current.scrollWidth,
        height: printRef.current.scrollHeight,
        windowWidth: printRef.current.scrollWidth,
      });

      // Hide again
      printRef.current.style.visibility = "hidden";
      printRef.current.style.left = "-9999px";

      const pdf      = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW    = pdf.internal.pageSize.getWidth();   // 210mm
      const pageH    = pdf.internal.pageSize.getHeight();  // 297mm
      const margin   = 12;
      const usableW  = pageW - margin * 2;
      const pxPerMm  = canvas.width / usableW;
      const usableH  = pageH - margin * 2;
      const sliceH   = usableH * pxPerMm; // canvas pixels per page

      const imgData  = canvas.toDataURL("image/jpeg", 0.92);
      const totalH   = (canvas.height * usableW) / canvas.width; // mm

      let remainingH = canvas.height;
      let page = 0;

      while (remainingH > 0) {
        if (page > 0) pdf.addPage();

        const thisSlicePx = Math.min(sliceH, remainingH);
        const thisSliceMm = (thisSlicePx / canvas.height) * totalH;

        // Crop the canvas for this page
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width  = canvas.width;
        sliceCanvas.height = thisSlicePx;
        const ctx = sliceCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, page * sliceH, canvas.width, thisSlicePx, 0, 0, canvas.width, thisSlicePx);

        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
        pdf.addImage(sliceData, "JPEG", margin, margin, usableW, thisSliceMm);

        remainingH -= thisSlicePx;
        page++;
      }

      const filename = `ChestXRay_Report_${disease}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Could not generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [disease, downloading]);

  const imgSrc     = originalDataUrl ?? originalSrc;
  const heatmapSrc = `data:image/png;base64,${heatmapBase64}`;

  return (
    <>
      {/* ── Hidden print-quality div — captured by html2canvas ── */}
      <div
        ref={printRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: "-9999px",
          visibility: "hidden",
          width: "794px",        // A4 at 96dpi
          background: "#ffffff",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: "13px",
          color: "#0f172a",
          lineHeight: 1.7,
          padding: "40px 48px",
          boxSizing: "border-box",
        }}
      >
        {/* Title */}
        <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Radiology Report — AI Assisted Draft</p>
        <p style={{ fontSize: 11, color: "#64748b", marginBottom: 28 }}>
          Generated on {new Date().toLocaleString()} · Dr. Chakshu
        </p>

        {/* Images — hidden for invalid uploads */}
        {!isInvalid && (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>Imaging</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[{ label: "Original X-Ray", src: imgSrc }, { label: "Focused Heatmap", src: heatmapSrc }].map(({ label, src }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>{label}</span>
                  <img src={src} alt={label} style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", border: "1px solid #dde3ec", borderRadius: 8, background: "#f8fafc" }} crossOrigin="anonymous" />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Findings row — hidden for invalid uploads */}
        {!isInvalid && (
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start", background: "#f8fafc", border: "1px solid #dde3ec", borderRadius: 8, padding: "14px 18px", marginBottom: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>Finding</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{disease}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>Result</span>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: positive ? "#dcfce7" : "#fee2e2", color: positive ? "#15803d" : "#b91c1c" }}>
                {positive ? "✓ Positive" : "✕ Negative"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>AI Confidence</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{confidencePct}%</span>
              <div style={{ height: 6, borderRadius: 99, background: "#e2e8f0", overflow: "hidden", width: 140, marginTop: 4 }}>
                <div style={{ height: "100%", borderRadius: 99, background: "#1d4ed8", width: `${confidencePct}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Report */}
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>Radiology Report</p>
        <div
          id="print-report-body"
          style={{ border: "1px solid #dde3ec", borderRadius: 8, padding: "20px 22px", background: "#fff" }}
        />

        {/* Disclaimer */}
        <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef3c7", borderLeft: "3px solid #d97706", borderRadius: 4, fontSize: 11, color: "#92400e", lineHeight: 1.5 }}>
          ⚠️ This report is AI-generated and must be reviewed and signed off by a licensed radiologist before clinical use.
        </div>

        {/* Footer */}
        <div style={{ marginTop: 28, fontSize: 10, color: "#94a3b8", borderTop: "1px solid #e2e8f0", paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
          <span>Dr. Chakshu</span>
          <span>{new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* ── Visible report card ── */}
      <section className={styles.card} aria-label="Diagnosis report">

        {/* Images + Findings row — hidden for invalid uploads */}
        {!isInvalid && (
          <>
            <header className={styles.sectionHeader}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span className={styles.sectionLabel}>Imaging</span>
            </header>

            <div className={styles.imageRow}>
              <div className={styles.imageCell}>
                <span className={styles.imageLabel}>Original X-Ray</span>
                <img id="original-xray" src={originalSrc} alt="Original chest X-ray" className={styles.xrayImage} />
              </div>
              <div className={styles.imageCell}>
                <span className={styles.imageLabel}>Focused Heatmap</span>
                <img id="heatmap-image" src={heatmapSrc} alt="Focused heatmap" className={styles.xrayImage} />
              </div>
            </div>
          </>
        )}

        {/* Findings summary row — hidden for invalid uploads */}
        {!isInvalid && (
          <div className={styles.findingsRow} role="region" aria-label="Findings summary">
            <div className={styles.findingItem}>
              <span className={styles.findingKey}>Finding</span>
              <span className={styles.findingValue} id="finding-disease">{disease}</span>
            </div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={styles.findingItem}>
              <span className={styles.findingKey}>Result</span>
              <span id="finding-result" className={`${styles.pill} ${positive ? styles.pillPositive : styles.pillNegative}`} role="status">
                {positive ? (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.285 6.709a1 1 0 0 0-1.414 0L9 16.586l-3.871-3.871a1 1 0 1 0-1.414 1.414l4.578 4.578a1 1 0 0 0 1.414 0l10.578-10.584a1 1 0 0 0 0-1.414z"/></svg>Positive</>
                ) : (
                  <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Negative</>
                )}
              </span>
            </div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={`${styles.findingItem} ${styles.confidenceMeter}`}>
              <span className={styles.findingKey}>AI Confidence</span>
              <span className={styles.findingValue} id="finding-confidence">{confidencePct}%</span>
              <div className={styles.meterTrack} role="progressbar" aria-valuenow={confidencePct} aria-valuemin={0} aria-valuemax={100}>
                <div className={styles.meterFill} style={{ width: `${confidencePct}%` }} />
              </div>
            </div>
          </div>
        )}

        <div className={styles.reportSection}>
          <div className={styles.reportHeader}>
            <span className={styles.reportTitle}>Radiology Report</span>
            <button
              id="download-pdf-btn"
              className={styles.downloadBtn}
              onClick={handleDownloadPDF}
              disabled={downloading}
              aria-label="Download report as PDF"
            >
              {downloading ? (
                <><span className={styles.btnSpinner} aria-hidden="true" />Generating…</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>Download PDF</>
              )}
            </button>
          </div>

          <div
            ref={editorRef}
            id="report-editor"
            className={styles.reportEditor}
            contentEditable
            suppressContentEditableWarning
            aria-label="Editable radiology report"
            role="textbox"
            aria-multiline="true"
            spellCheck={false}
          />

          <p className={styles.disclaimer} role="note">
            ⚠️ This report is AI-generated and must be reviewed and signed off by a licensed radiologist before clinical use.
          </p>
        </div>

      </section>
    </>
  );
}
