# Phase 18: HWPX Schema & Compatibility Audit (`HWPX_SCHEMA_AND_COMPATIBILITY_AUDIT.md`)

**Mission**: Figma2Word — Phase 18 Argon Deep Engineering Mission  
**Scope**: KS X 6101 (OWPML) Level 1 & Level 2 Deep Structural/Semantic Audit across 17 Fixtures (`validate_hwpx_phase18.ts`) + Level 3 Hancom Host Environment Assessment.

---

## 1. Three-Level HWPX Verification Methodology

### Level 1 — Archive & XML Well-Formedness (`L1_Zip`, `L1_Xml`)
- Validates ZIP packaging and mandatory KS X 6101 entries:
  - `mimetype` (`application/hwp+zip`)
  - `META-INF/manifest.xml`
  - `Contents/content.hpf`
  - `Contents/header.xml`
  - `Contents/section0.xml`
  - `BinData/*` binary image payloads
- Validates XML declaration, root tags (`</hs:sec>`, `</hh:head>`), and balanced `<hp:run>` / `</hp:run>` tags.

### Level 2 — KS X 6101 Semantic & Cross-Reference Integrity (`L2_*`)
- **`L2_CharPr`**: Every `charPrIDRef="N"` in `Contents/section0.xml` resolves to an existing `<hh:charPr id="N">` in `Contents/header.xml` (including Phase 18 dynamic `underline`, `strikeout`, and `spacing` character properties).
- **`L2_ParaPr`**: Every `paraPrIDRef="N"` in `Contents/section0.xml` resolves to an existing `<hh:paraPr id="N">` in `Contents/header.xml` (including Phase 18 dynamic fixed `lineHeightPt` paragraph properties).
- **`L2_BinRef`**: Every `binaryItemIDRef="BINxxxx"` and `binRef="BINxxxx"` resolves to a `<opf:item id="BINxxxx" href="BinData/..." isEmbeded="1"/>` in `Contents/content.hpf` and an existing binary payload in `BinData/`.
- **`L2_Ratio`**: Every `<hp:rect ratio="R">` satisfies $0 \le R \le 50$ per KS X 6101 schema.
- **`L2_ImgClip`**: Every `<hp:pic>` includes both `<hp:imgDim>` and `<hp:inImgDim>` at `75 HWPU/px` intrinsic scale (`96 DPI → 7200 HWPU/inch`) and valid `<hp:imgClip left="..." right="..." top="..." bottom="..."/>` where `0 <= left < right <= dimwidth` and `0 <= top < bottom <= dimheight`.
- **`L2_InstId`**: Every drawing object (`<hp:rect>`, `<hp:line>`, `<hp:ellipse>`, `<hp:polygon>`, `<hp:pic>`, `<hp:tbl>`) has matching `id` and `instid` attributes (`id === instid`), preventing Hancom Office object ID collisions.
- **Open Vector Subpath Integrity**: Open SVG paths (`!sp.closed`) are emitted as native `<hp:line>` segments rather than closed `<hp:polygon>`, eliminating spurious closing lines in Hancom Office.

### Level 3 — Host Viewer Environment Assessment
- **Host Inspection**: On this Windows workstation, only legacy **Hancom Office Hwp 2010 (`v8.0.0.466`, `HWP.exe`)** is installed (`C:\Program Files (x86)\HNC\Hwp80\Hwp.exe`).
- Because Hancom Office 2010 predates the KS X 6101 `.hwpx` OWPML standard (introduced in Hancom Office 2014+), **Level 3 native `.hwpx` GUI/COM rendering was not executed on this host** and is explicitly marked **Not Executed (Host Lacks Hancom 2014+ Viewer)** in strict compliance with audit rules.

---

## 2. HWPX Level 1 & Level 2 Audit Results (17 / 17 Fixtures PASS)

Executed via [`research/rea-document-engine/phase18/scripts/validate_hwpx_phase18.ts`](file:///c:/Users/77/Documents/Figma2Word/research/rea-document-engine/phase18/scripts/validate_hwpx_phase18.ts):

| # | Fixture | Pages | Elements | `L1_Zip` | `L1_Xml` | `L2_CharPr` | `L2_ParaPr` | `L2_BinRef` | `L2_Ratio` | `L2_ImgClip` | `L2_InstId` |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `single-page-brief` | 1 | 18 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 | `multi-page-report` | 3 | 34 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | `image-centric-portfolio` | 1 | 16 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 4 | `text-centric-article` | 1 | 16 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 5 | `vector-centric-infographic` | 1 | 27 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 6 | `complex-nested-dashboard` | 1 | 40 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 7 | `table-card-hybrid` | 1 | 47 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 8 | `sample-a-proposal-doc` | 1 | 8 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 9 | `sample-b-nested-autolayout` | 1 | 10 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 10 | `sample-c-stress-absolute` | 1 | 12 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 11 | `sample-d-edge-cases` | 1 | 1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 12 | `sample-e2e-card-grid` | 1 | 11 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 13 | `sample-e2e-complex-layout` | 1 | 11 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 14 | `sample-e2e-document` | 1 | 7 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 15 | `Report1-Live-Snapshot` | 9 | 760 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 16 | `Report2-Live-Snapshot` | 11 | 802 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 17 | `Report3-Live-Snapshot` | 10 | 784 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
