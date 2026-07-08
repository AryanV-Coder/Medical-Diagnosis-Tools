# CONTEXT: overview.md
# Project: ChestXRay Diagnosis Tool (Dr. Chakshu) - Frontend
# Purpose of this file: high-level map of the frontend architecture and UI layer.

---

## What this frontend does (one paragraph)

The frontend is a React single-page application built with Vite. It provides a clean, professional, and accessible user interface for the Dr. Chakshu AI radiology assistant. Users upload a chest X-ray image which is sent to the backend. While processing, the UI displays a skeleton loader. Upon success, the UI splits into a side-by-side layout: on the left, a comprehensive `ReportCard` displays the uploaded image, a Grad-CAM focused heatmap, the AI diagnosis findings, and an editable structured radiology report. On the right, a sticky `ChatPanel` allows the user to converse directly with an AI assistant about their specific report context. The UI features a deep navy blue theme and handles invalid image rejections gracefully.

---

## Component Map

```
App.jsx (Main Layout + State container)
 ├── UploadPanel (Drag & Drop, file selection)
 ├── [API] api/predict.js -> POST /predict
 │
 ├── ReportCard (Left column: 60% width)
 │    ├── Images (Original & Heatmap)
 │    ├── Findings (Confidence meter, positive/negative pills)
 │    └── Editable Markdown Report (contenteditable div)
 │         └── PDF Generation (html2canvas + jsPDF engine)
 │
 └── ChatPanel (Right column: 40% width, sticky)
      ├── [API] api/chat.js -> POST /chat
      ├── Welcome Screen (Suggestions)
      ├── Message List (Markdown rendering, metadata chips)
      └── Textarea Input
```

---

## File index (frontend/src/)

| Directory / File | Role | Read this before editing |
|---|---|---|
| `App.jsx` | Top-level state (file, results, status) and responsive page layout. | Changing global layout (e.g., side-by-side CSS), step sequencing, or global error handling. |
| `index.css` | Global design tokens (CSS variables) for colors, typography, shadows. | Changing the global theme (e.g., navy blue accent), background gradients, or global typography. |
| `App.css` | Layout structure styles (`.pageBody`, `.contentCol`, `.chatCol`, `.hero`). | Modifying responsive breakpoints or grid sizes. |
| `api/` | `predict.js` and `chat.js` fetch wrappers communicating with FastAPI. | Changing backend payload schemas, headers, or URL logic. |
| `components/UploadPanel/` | File drag-and-drop UI component. | Changing the initial upload state design or allowed file types. |
| `components/ReportCard/` | Displays images, findings, and the WYSIWYG report editor. | Modifying the report structure, PDF generation logic, or AI confidence meter. |
| `components/ChatPanel/` | The interactive Dr. Chakshu chat interface. | Tweaking message bubbles, typing indicators, chat layout, or session ID management. |
| `stubs/` | Vite build stubs (e.g., `canvg.stub.js`). | Resolving Vite/Rollup dependency resolution errors for PDF generation. |

---

## Key invariants — do NOT violate these when editing

1. **Side-by-side layout logic:** The `App.jsx` layout shifts based on the `showChat` boolean. Before a report is ready, the content is a centered 560px column. After the report arrives, it shifts left to make room for the 420px sticky chat panel. Do not compress the left column below its 900px design width.
2. **PDF Generation Strategy:** The frontend uses `html2canvas` + `jsPDF` for the "Download PDF" feature. `jsPDF` imports `canvg` under the hood which causes Vite build errors; we use an alias in `vite.config.js` pointing to `stubs/canvg.stub.js` to bypass this. **Do not remove the stub or alias.**
3. **Cross-context Images:** The original uploaded image is converted to a base64 DataURL in `App.jsx` before being passed to `ReportCard`. This is strictly required because `blob:` URLs cannot be drawn onto the canvas used by `html2canvas` for PDF generation due to context contamination.
4. **Chat Context Passing:** `ChatPanel` only sends the `report_context` string on the *first* message of a session (using `reportSentRef`). The backend FastAPI router persists it. Do not send the heavy report string on every single chat turn.
5. **Invalid Image Handling:** If the backend LLM decides the image is not a chest X-ray, the report text will contain `## INVALID IMAGE`. `App.jsx` and `ReportCard.jsx` check for this string to hide the visual findings and display a strict error banner.

---

## Status
| Feature | Status |
|---|---|
| Upload UI & File Handling | ✅ Done |
| Loading Skeletons & Transitions | ✅ Done |
| Report Editor & PDF Export | ✅ Done (jsPDF + html2canvas engine with smart pagination) |
| Interactive Chat Panel | ✅ Done (Session persistence, markdown, metadata chips) |
| Responsive Side-by-Side Layout | ✅ Done |
| Theme & Styling | ✅ Done (Navy Blue `1e3a8a` / `0a1930`) |
