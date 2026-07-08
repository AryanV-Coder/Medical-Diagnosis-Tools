# CONTEXT: ui_ux.md
# Covers: index.css, App.css, layout logic, and design tokens

---

## The Design System

The frontend utilizes a custom vanilla CSS design system located in `index.css`. It does not rely on Tailwind or heavy component libraries (like MUI/AntD) to keep the bundle small and the UI bespoke.

### Theme & Colors
The user specifically requested a **Deep Navy Blue** theme.
- **Background (`--color-bg`)**: A subtle radial gradient from `#dbeafe` to `#f0f4f8`.
- **Surface (`--color-surface`)**: Clean `#ffffff` for cards and panels.
- **Primary Accent (`--color-accent`)**: Navy Blue `#1e3a8a`.
- **Accent Hover (`--color-accent-hover`)**: Darker Navy `#172554`.
- **Text (`--color-text-primary`)**: Slate `#0f172a`.
- **Positive/Negative Indicators**: Green (`#15803d`) for benign/negative findings, Red (`#b91c1c`) for positive/disease findings.

### Typography
- **Primary Font**: `Inter` (sans-serif), falling back to system-ui.
- **Hierarchy**: Headers use bold tracking (`font-weight: 700`, `letter-spacing`), while body text optimizes for readability (`line-height: 1.5`, `color: #475569`).
- **WYSIWYG Editor (`#report-editor`)**: Has specific global overrides in `index.css` to format the injected markdown correctly (blue uppercase `h2`, strong lists, muted paragraphs).

---

## Layout Architecture (`App.jsx` + `App.css`)

The application has two primary layout states, controlled by the `showChat` boolean in `App.jsx`.

### State 1: Initial & Loading (No Report)
- The UI features a centered "Hero" landing section (`heroTitle`, `heroSub`, `heroPills`).
- The main column (`.contentCol`) is constrained to a narrow width (`.contentCol--narrow`, `max-width: 560px`).
- The `.pageBody` container uses `justify-content: center`.

### State 2: Results View (Report + Chat)
- The Hero section disappears.
- The `.pageBody` container toggles the `.pageBody--chat` class, shifting `justify-content` to `flex-start`.
- The main column (`.contentCol`) expands to its natural `max-width: 900px`.
- The `.chatCol` appears on the right side, fixed at `420px` width.
- **Critical Requirement**: The chat panel is `position: sticky; top: 80px; height: calc(100vh - 100px);`. This allows the user to scroll through the long radiology report on the left while the chatbot stays fixed in place on the right.

### Responsive Behavior
- At `< 960px` viewport width, the side-by-side layout collapses.
- `.pageBody--chat` switches to `flex-direction: column`.
- The chat panel drops below the report and loses its sticky positioning, acting as a standard block element.

---

## Micro-interactions & Polish

- **Buttons**: The "Analyze X-Ray" button features a subtle `transform: translateY(-1px)` hover lift and shadow for a premium tactile feel.
- **Loading State**: A cycling text array (`LOADING_STEPS`) updates every 1.8 seconds ("Running ML inference...", "Generating Focused Heatmap...", "Composing radiology report...") to keep the user engaged during the ~8 second backend pipeline.
- **Upload Panel**: Uses dashed borders that transition to solid on hover/drag-over (`.dragging` class) to indicate an active dropzone.
