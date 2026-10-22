# Phase 32: Real Figma Fidelity Benchmark & Conversion Quality Improvement
## 09. Roadmap & Strategic Priorities for Phase 33

### 1. Architectural Foundations Established in Phase 32

Phase 32 proved that the Canonical Canvas IR pipeline can handle full-scale corporate Figma designs (187 MB JSON, 17 pages, 15 MB Word output) with:
1. Zero section collisions in Microsoft Word.
2. Invariant optical alignment on auto-width buttons and right-aligned labels.
3. Sub-point border accuracy via VML stroke inset compensation.
4. Rock-solid automation safety with pre-unlink TOCTOU query and staging lock.

---

### 2. Prioritized Focus Areas for Phase 33

#### Priority 1: Advanced Auto-Layout Table Cell Wrapping & Dynamic Row Sizing
- **Context**: In complex dashboard views (e.g. Page 5, 8, 15), data tables containing variable-length Korean text strings occasionally rely on Word's table auto-fitting.
- **Goal**: Implement deterministic cell height calculation in Canvas IR to synchronize row heights between DOCX `<w:tr>` and HWPX `<hp:tr>` without relying on host-application heuristics.

#### Priority 2: Complex Gradient Fill Approximation
- **Context**: High-fidelity Figma designs occasionally use subtle linear and radial gradients for headers and hero badges. Currently, the parser extracts the primary stop color as a solid fill.
- **Goal**: Add VML `<v:fill type="gradient">` and OWPML `<hc:gradBrush>` serialization to preserve gradient direction and color stops.

#### Priority 3: Cross-Platform HWPX Automated Visual Verification
- **Context**: HWPX native visual rendering remains `NOT_VERIFIED` on macOS due to the absence of native Hancom Office CLI binaries.
- **Goal**: Establish an optional Windows runner or Dockerized wine-hancom test harness for CI/CD environments to capture native HWPX rendering diffs.

#### Priority 4: Direct DrawingML Text Flow Migration
- **Context**: While VML provides robust 2D absolute positioning across legacy and modern Word, DrawingML (`w14:drawing` / `wp:anchor`) offers richer modern typography features.
- **Goal**: Research a hybrid renderer mode that selectively emits DrawingML shapes for modern Word versions while keeping VML fallback for legacy compatibility.
