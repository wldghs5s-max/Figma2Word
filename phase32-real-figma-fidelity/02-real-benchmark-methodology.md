# Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Improvement
## 02. Real Benchmark Methodology & Hardware/Software Stack

### 1. Test Environment Specification

- **Host System**: Apple Mac Studio / MacBook Pro
- **Operating System**: macOS 15.6 (Darwin 25.6.0 arm64)
- **Primary Office Suite**: Microsoft Word for Mac v16.114 (Native Apple Silicon build)
- **Runtime Environment**: Node.js v26.7.0, TypeScript 7.0.2, tsx 4.23.15
- **Test Runner**: Vitest v5.0.3 (72 suites, worker threads isolated)
- **Native Rendering Inspection**: Apple Swift 6.4 + AppKit / CoreGraphics (`NSBitmapImageRep`, `PDFDocument`)

---

### 2. Real Design Fixture Inventory

The benchmark was executed against the authentic production snapshot of `펜테크 3차 디자인.json` (187 MB uncompressed Figma REST API snapshot). The snapshot spans **17 target frames**:

| Page # | Frame Name | Figma Dimensions (px) | Output Canvas (pt) | Primary Layout / Purpose |
| :---: | :--- | :---: | :---: | :--- |
| **1** | 디자인 시스템 1 | 1920 x 1080 | 1440.0 x 810.0 | Design tokens, color swatches, typography scale |
| **2** | 디자인 시스템 2 | 1920 x 1080 | 1440.0 x 810.0 | Component primitives, form inputs, buttons |
| **3** | Desktop - 1 | 1122.5 x 793.7 | 841.9 x 595.3 | Login & landing screen |
| **4** | Desktop - 대시보드 (지도뷰) | 1920 x 1170 | 1440.0 x 877.5 | Primary dashboard, map card, action buttons |
| **5** | Desktop - 2 | 1449 x 1580 | 1086.8 x 1185.0 | Data analytics table and KPI summary |
| **6** | 촬영계획 | 1449 x 1083 | 1086.8 x 812.3 | Drone flight mission calendar & timeline |
| **7** | 촬영계획 - 건물을 선택시 | 1449 x 1083 | 1086.8 x 812.3 | Mission details & building target selector |
| **8** | 사업목록 선택된 화면 | 1920 x 1170 | 1440.0 x 877.5 | Master-detail business listing screen |
| **9** | 필터 팝업 | 1178 x 1291 | 883.5 x 968.3 | Modal dialog overlay for multi-select filters |
| **10** | 신규등록 - 1 | 1920 x 1170 | 1440.0 x 877.5 | Complex multi-step form entry (Step 1) |
| **11** | 필터 | 504 x 613 | 378.0 x 459.8 | Compact filter dropdown widget |
| **12** | Frame 1 | 1178 x 1291 | 883.5 x 968.3 | Notification panel & activity timeline |
| **13** | 사업정보 수정 | 504 x 935 | 378.0 x 701.3 | Side-drawer property inspector |
| **14** | 신규등록 - 2 | 1920 x 1170 | 1440.0 x 877.5 | Complex multi-step form entry (Step 2) |
| **15** | 사업목록 클릭 시 | 1920 x 1170 | 1440.0 x 877.5 | Selected business record overview |
| **16** | 사업목록 클릭 시 - 탭디자인1 | 1920 x 1221 | 1440.0 x 915.8 | Tabbed interface with secondary navigation |
| **17** | 사업목록 클릭 시 | 1920 x 1170 | 1440.0 x 877.5 | Full-bleed inspection table view |

---

### 3. Measurement Pipeline Architecture

```
[ Figma JSON Snapshot (187 MB) ]
               │
               ▼
[ FigmaCanvasParser (fit-a4 scale policy) ]
               │
               ▼
[ Canonical Canvas IR (17 CanvasPages) ]
       │                               │
       ▼                               ▼
[ DocxCanvasRenderer ]        [ HwpxCanvasRenderer ]
       │                               │
       ▼                               ▼
[ DOCX Package (15.00 MB) ]    [ HWPX Package (15.04 MB) ]
       │                               │
       ▼                               ▼
[ Safe Word Automation ]       [ KS X 6101 XML Schema Validator ]
  - HMAC isolation token         - hp:p / hc:fillBrush / hp:shadow
  - Pre-unlink TOCTOU guard       (macOS CLI: NOT_VERIFIED)
  - Active run staging lock
       │
       ▼
[ Microsoft Word for Mac v16.114 ]
  - 17 isolated sections confirmed
  - Export to PDF (17 exact pages)
       │
       ▼
[ Swift CoreGraphics Rendering ]
  - 17 high-res PNGs (2160x1316 px)
  - Pixel inspection for text contrast
```
