# Phase 18: Real-World Benchmark Evaluation (`REAL_WORLD_BENCHMARK_EVALUATION.md`)

**Mission**: Figma2Word — Phase 18 Argon Deep Engineering Mission  
**Scope**: Comprehensive Benchmark Matrix across Real-World Customer Snapshots (`Report1..3-Live-Snapshot.json`), Real-World Fixtures (`samples/real-world/*`), and Synthetic Benchmarks (`samples/synthetic-figma/*`).

---

## 1. Benchmark Evaluation Matrix (17 Documents)

| # | Document / Fixture | Category | Pages | Elements | Orientation | Key Fidelity Features Verified | DOCX Status | HWPX Status |
| :---: | :--- | :--- | :---: | :---: | :--- | :--- | :---: | :---: |
| 1 | `Report1-Live-Snapshot.json` | Customer Snapshot | 9 | 760 | Portrait (`595.28 × 841.89 pt`) | Cover image crop, Page 4 4-sector KPI Donut Chart (`arcData` → cubic Bezier vectors), Korean typography, tables/cards | **PASS** (Word COM + SSIM `0.8854`) | **PASS** (L1/L2) |
| 2 | `Report2-Live-Snapshot.json` | Customer Snapshot | 11 | 802 | Portrait (`595.28 × 841.89 pt`) | Multi-page layout, Page 4 KPI Donut Chart (`arcData`), embedded images, complex vector badges | **PASS** | **PASS** (L1/L2) |
| 3 | `Report3-Live-Snapshot.json` | Customer Snapshot | 10 | 784 | Portrait (`595.28 × 841.89 pt`) | 10 full-page frames preserved (not collapsed by stray canvas leaves), Page 4 KPI Donut Chart | **PASS** | **PASS** (L1/L2) |
| 4 | `sample-a-proposal-doc.json` | Real-World Sample | 1 | 8 | Portrait (`595.28 × 841.89 pt`) | Auto-Layout child bounds synthesis (`synthesizeMissingChildBounds`), `CROP` image (`croptop="19662f" cropbottom="19662f"`), Korean title/body | **PASS** (Word COM 9 shapes) | **PASS** (L1/L2) |
| 5 | `sample-b-nested-autolayout.json` | Real-World Sample | 1 | 10 | Landscape (`841.89 × 595.28 pt`) | 2-level nested `VERTICAL` + `HORIZONTAL` Auto-Layout without child `absoluteBoundingBox` | **PASS** | **PASS** (L1/L2) |
| 6 | `sample-c-stress-absolute.json` | Real-World Sample | 1 | 12 | Landscape (`841.89 × 595.28 pt`) | Overlapping z-order cards, negative/bleed coordinates, semi-transparent fills | **PASS** | **PASS** (L1/L2) |
| 7 | `sample-d-edge-cases.json` | Real-World Sample | 1 | 1 | Portrait (`595.28 × 841.89 pt`) | Hidden layer filtering (`visible: false`), empty text handling | **PASS** | **PASS** (L1/L2) |
| 8 | `sample-e2e-card-grid.json` | Real-World E2E | 1 | 11 | Portrait (`595.28 × 841.89 pt`) | Single-page section `CANVAS` aggregation + 3-column Auto-Layout cards + `style.fills` text color | **PASS** | **PASS** (L1/L2) |
| 9 | `sample-e2e-complex-layout.json` | Real-World E2E | 1 | 11 | Portrait (`595.28 × 841.89 pt`) | Stacked header/hero/3-column body section `FRAME`s (`height: 120–240px`) aggregated on 1 page | **PASS** | **PASS** (L1/L2) |
| 10 | `sample-e2e-document.json` | Real-World E2E | 1 | 7 | Portrait (`595.28 × 841.89 pt`) | Top-level `TEXT`/`LINE` + Auto-Layout summary & KPI frames aggregated on 1 page | **PASS** | **PASS** (L1/L2) |
| 11 | `single-page-brief.json` | Synthetic Benchmark | 1 | 18 | Portrait (`595.28 × 841.89 pt`) | Executive brief cards, header banner, Korean + English typography | **PASS** (Word COM) | **PASS** (L1/L2) |
| 12 | `multi-page-report.json` | Synthetic Benchmark | 3 | 34 | Portrait (`595.28 × 841.89 pt`) | 3-page pagination, section breaks, consistent page headers/footers | **PASS** (Word COM) | **PASS** (L1/L2) |
| 13 | `image-centric-portfolio.json` | Synthetic Benchmark | 1 | 16 | Portrait (`595.28 × 841.89 pt`) | Embedded PNG resources, `r:id` / `binaryItemIDRef` integrity | **PASS** | **PASS** (L1/L2) |
| 14 | `text-centric-article.json` | Synthetic Benchmark | 1 | 16 | Portrait (`595.28 × 841.89 pt`) | Multi-column text runs, mixed character style overrides (`bold`, `italic`, `underline`, `color`) | **PASS** | **PASS** (L1/L2) |
| 15 | `vector-centric-infographic.json` | Synthetic Benchmark | 1 | 27 | Portrait (`595.28 × 841.89 pt`) | Open & closed SVG vector paths, compound icons, dashed lines | **PASS** | **PASS** (L1/L2) |
| 16 | `complex-nested-dashboard.json` | Synthetic Benchmark | 1 | 40 | Landscape (`841.89 × 595.28 pt`) | Landscape dashboard (`1440 × 900 px` → A4 Landscape), 40 nested KPI elements | **PASS** (Word COM) | **PASS** (L1/L2) |
| 17 | `table-card-hybrid.json` | Synthetic Benchmark | 1 | 47 | Portrait (`595.28 × 841.89 pt`) | Dense tabular grid + summary cards | **PASS** | **PASS** (L1/L2) |

---

## 2. Key Real-World Fidelity Breakthroughs

### 2.1 Recovery of Auto-Layout Content in Real-World Samples (`sample-a`, `sample-b`, `sample-e2e-*`)
- **Before Phase 18**:
  - `sample-a-proposal-doc.json` produced only **2 elements** (1 background rect + 1 divider line). All 4 Korean text blocks and the cropped illustration graphic inside the Auto-Layout container were silently dropped because their child nodes omitted explicit `absoluteBoundingBox`.
  - `sample-e2e-card-grid.json`, `sample-e2e-document.json`, and `sample-e2e-complex-layout.json` dropped top-level `TEXT`/`LINE` titles and split short horizontal section frames (`height: 120–340px`) into 2–3 separate distorted pages.
- **After Phase 18**:
  - `sample-a-proposal-doc.json` produces all **8 elements** (including all 4 Korean text boxes, the divider line, and the cropped illustration image with `croptop="19662f" cropbottom="19662f"`) on 1 A4 Portrait page, verified in Microsoft Word COM (`9 shapes`, editable & persistent).
  - `sample-e2e-card-grid.json` (`11 elements`), `sample-e2e-complex-layout.json` (`11 elements`), and `sample-e2e-document.json` (`7 elements`) each render on a single cohesive page with zero dropped text.

### 2.2 Customer Snapshot KPI Donut Chart (`Report1..3-Live-Snapshot.json`, Page 4)
- **Before Phase 18**:
  - The 4 KPI Donut Chart segments (`ELLIPSE` nodes `1:320..1:323` with `arcData.innerRadius = 0.62`) were emitted as 4 overlapping full `<v:oval>` circles in DOCX and `<hp:ellipse>` in HWPX, completely obscuring the chart segments beneath the topmost circle.
- **After Phase 18**:
  - `FigmaCanvasParser.buildEllipseArcSvgPath()` converts each `ELLIPSE` with `arcData` into an exact closed cubic Bezier `vector` ring sector (`M ... C ... L ... C ... Z`), rendering accurate multi-colored donut sectors in both Word VML (`<v:shape>`) and HWPX (`<hp:polygon>`).
