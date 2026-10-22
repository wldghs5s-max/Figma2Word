# 05. HWPX Drop Shadow Offset & KS X 6101 Compliance (Audit A5 & A8)

## 1. Resolution of the Drop Shadow Zero Offset Bug (Audit A5)

### Defect Analysis
In `src/canvas/renderer/hwpxCanvasRenderer.ts`, drop shadow serialization for rectangles, ellipses, and pictures used logical OR (`||`) with a fallback default of `2`:

```typescript
// Previous Vulnerable Code (lines 964, 1018, 1183):
offsetX="${ptToHwpu(p.shadow.offsetX || 2)}"
offsetY="${ptToHwpu(p.shadow.offsetY || 2)}"
```

In JavaScript/TypeScript, `0` is a falsy value. Consequently:
- If a Figma design specified `offset: { x: 0, y: 8 }` (a vertical drop shadow with zero horizontal drift), `0 || 2` evaluated to `2`.
- `ptToHwpu(2)` converted this to `200 HWPU`.
- In the generated `Contents/section0.xml`, `offsetX="200"` was emitted instead of `offsetX="0"`.

### Phase 31 Fix
All occurrences were replaced with nullish coalescing (`??`):
```typescript
// Hardened Phase 31 Implementation:
offsetX="${ptToHwpu(p.shadow.offsetX ?? 2)}"
offsetY="${ptToHwpu(p.shadow.offsetY ?? 2)}"
```

### Verification Against Actual Generated HWPX
Inspection of `debug/phase30-evidence/run/phase30_rendered.hwpx` (`Contents/section0.xml`):
```xml
<!-- Before Phase 31: -->
<hp:shadow type="DROP" color="#1A3366" offsetX="200" offsetY="600" alpha="224"/>

<!-- After Phase 31: -->
<hp:shadow type="DROP" color="#1A3366" offsetX="0" offsetY="600" alpha="224"/>
```
The explicit horizontal offset of $0$ is now preserved accurately as `offsetX="0"`.
Verified by unit tests in `tests/phase31-audit-verification.test.ts` (Tests 6 & 7).

---

## 2. HWPX Image Corner Radius & Clipping Constraints (Audit A8)

### Architectural Audit
Argon queried whether HWPX supports corner radius clipping on `<hp:pic>` elements.
- **KS X 6101 Schema Analysis**: In the national OWPML standard, `<hp:pic>` contains `<hp:imgRect>`, `<hp:imgClip>`, and `<hp:imgDim>`. However, `<hp:pic>` does **not** define an `arcsize` or `cornerRadius` attribute for rectangular pictures.
- **Comparison with Word DOCX**:
  - In Word DOCX VML, `<v:roundrect>` natively accepts `<v:imagedata>` as a child and clips the bitmap to the corner arcs.
  - In Hancom HWPX, `<hp:pic>` does not provide native vector corner clipping. Simulating corner clipping in Hancom Office requires external bitmap alpha-mask preprocessing or complex vector polygon masking.
- **Reporting Transparency**:
  - Status: `HWPX_ROUNDED_IMAGE_CLIPPING: NOT_SUPPORTED_IN_SCHEMA`
  - On macOS, Hancom Office has no headless CLI or AppleScript automation:
    `HWPX_NATIVE_RENDERING: NOT_VERIFIED` (honest status reporting in accordance with project principles).
