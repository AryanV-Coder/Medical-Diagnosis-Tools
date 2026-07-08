# CONTEXT: report_card.md
# Covers: ReportCard.jsx and PDF generation

---

## What this component does

`ReportCard` is the heavy-lifting UI component on the left side of the results view. It renders:
1. The visual findings (Original image, Focused Heatmap, confidence meter, positive/negative pills).
2. The AI-generated structured radiology report.
3. An inline WYSIWYG editor (via `contenteditable`) allowing the user to modify the report before saving.
4. The PDF generation engine that exports the report.

---

## The AI Confidence Meter

The top of the card shows the predicted disease and a confidence bar.
- The `probability` (e.g., `0.8532`) is multiplied by 100 for a percentage.
- A visual progress bar fills up based on this percentage.
- If `positive` is true, the bar is red (`--color-negative`). If false, it's green (`--color-positive`).

---

## The Report Editor

The backend LangGraph agent returns the report in a structured markdown string.
- `ReportCard` injects this string into a `div` with `contentEditable="true"`.
- This allows the clinician to seamlessly type into the report, fix hallucinations, or add addendums without switching to a different input mode.
- We deliberately **do not** render raw markdown syntax in the editor (as per user request). It renders as WYSIWYG HTML. 
- The styling for this editable content is handled globally in `index.css` under the `#report-editor` selector because `contenteditable` innerHTML cannot be easily styled with CSS Modules.

---

## PDF Generation Engine

The user specifically requested a "Download PDF" button that saves directly to their device (no print dialog, no server-side generation).

### Stack
- `html2canvas`: Renders the DOM into an HTML5 Canvas.
- `jsPDF`: Takes that canvas and drops it into a PDF document.

### The Build Problem
`jsPDF` relies on `canvg` (for SVG rendering). `canvg` causes catastrophic build failures in Vite/Rollup due to Node.js built-ins (`fs`, `path`).
**The Fix**: We created an empty stub at `frontend/src/stubs/canvg.stub.js` and added a `resolve.alias` in `vite.config.js` to map `canvg` to this stub. This fixes the build without breaking jsPDF (since we aren't rendering SVGs to the canvas). **Do not remove this alias.**

### Image Security Contexts
If an `<img>` tag has a `blob:` or external URL, `html2canvas` marks the canvas as "tainted" due to CORS, and `jsPDF` will fail with a security error.
**The Fix**: `App.jsx` reads the user's uploaded file using `FileReader` and converts it to a base64 DataURL (`originalDataUrl`). This is passed down to `ReportCard` instead of the `URL.createObjectURL()`. The backend heatmap is already returned as base64. Both are perfectly safe for canvas rendering.

### Smart Pagination (The Blank Row Scanner)
A common issue with `html2canvas` is that it cuts lines of text in half across PDF pages.
We built a custom pagination algorithm in `generatePDF()`:
1. Render the entire `#pdf-export-container` to one massive canvas.
2. Define a page height (e.g., A4 ratio).
3. At the page break line, scan pixels horizontally.
4. If the row contains dark pixels (text), move the split line *up* pixel-by-pixel until a completely blank row of pixels is found.
5. Slice the canvas at this safe blank space and push it to the PDF page.
6. Repeat until the entire canvas is consumed.
