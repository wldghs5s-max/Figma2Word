# Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Improvement
## 08. HWPX Fidelity Status & Format Parity

### 1. Honest Visual Verification Disclaimer

> **`HWPX_NATIVE_RENDERING: NOT_VERIFIED`**
>
> On the current macOS development host, Hancom Office (한컴오피스 / 한글) native desktop application and CLI tools (`hwp`, `hwpx-cli`) are not available.
> While DOCX native rendering was visually and quantitatively verified in Microsoft Word for Mac (v16.114), HWPX visual verification remains **NOT_VERIFIED** in terms of live OS pixel rendering.
> Figma2Word strictly avoids speculative or synthetic visual fidelity claims for HWPX on macOS.

---

### 2. Structural & Schema Compliance Status

Although native pixel rendering cannot be captured on macOS, the generated HWPX document (`phase32_rendered.hwpx`, **15.04 MB**) was audited against the Korean National Standard **KS X 6101:2019 (OWPML)**:

1. **Package Architecture**:
   - `mimetype`: Strictly first uncompressed file (`application/hwp+zip`).
   - `META-INF/manifest.xml`: Valid ODF/OWPML manifest referencing `Contents/content.hpf` and `Contents/section0.xml`.
   - `Contents/content.hpf`: Proper package spine, metadata, and resource manifests.
2. **Graphic Primitives (`<hp:rect>`, `<hp:line>`, `<hp:polygon>`)**:
   - Z-ordering mapped to `zOrder` attributes.
   - Coordinate units converted to HWPU ($1\text{ pt} = 100\text{ HWPU}$).
   - Solid and dashed strokes serialized via KS X 6101 `<hc:lineShape>`.
3. **Drop Shadows (`<hp:shadow>`)**:
   - Implemented as `<hp:shadow type="DROP" color="#..." offsetX="..." offsetY="..." alpha="..."/>`.
4. **Text Runs & Paragraphs**:
   - Mapped to `<hp:p>` with paragraph properties (`paraPrIDRef`) and character properties (`charPrIDRef`).
   - Font references correctly bind to Hangul and Latin fonts in `header.xml`.

---

### 3. Cross-Format Parity Matrix

| Feature / Attribute | DOCX Renderer (Word) | HWPX Renderer (Hancom) | Parity Status |
| :--- | :--- | :--- | :--- |
| **Output File Size** | 15.00 MB | 15.04 MB | Balanced (both embed full assets) |
| **Section Count** | 17 sections | 17 section divisions | 1:1 Parity |
| **Page Dimensions** | Up to 1440.0 x 877.5 pt | Up to 144,000 x 87,750 HWPU | Exact Unit Conversion |
| **Z-Index Layering** | VML `z-index` | OWPML `zOrder` | Full Parity |
| **Border Sides** | VML individual borders | Thin filled rects / line borders | Full Parity |
| **Drop Shadows** | `<v:shadow type="single">` | `<hp:shadow type="DROP">` | Full Parity |
| **Text Editability** | 100% Native OpenXML | 100% Native OWPML `<hp:p>` | Full Parity |
| **Native Visual Proof** | **VERIFIED** (Word for Mac) | **NOT_VERIFIED** (Requires Windows/Linux Hancom) | Explicitly Noted |
