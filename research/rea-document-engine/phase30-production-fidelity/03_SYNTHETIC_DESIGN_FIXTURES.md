# 03. Synthetic Design Fixtures & Test Topologies

## 1. Fixture Strategy & Motivation

Visual regression testing in document conversion requires reproducible, deterministic fixtures that exercise complex edge cases without relying on fluctuating external third-party cloud assets.

In Phase 30, we authored `samples/phase30_comprehensive_synthetic_fixture.json`, a comprehensive multi-page Figma JSON fixture engineered to test the entire vector and typography spectrum.

### Fixture Cryptographic Provenance
- **Relative Path**: `samples/phase30_comprehensive_synthetic_fixture.json`
- **File Size**: 17,624 bytes (17.2 KB)
- **SHA-256 Digest**: `45a587e8ed5d7b9e76211c2ecdf07a1042d32d372a1505532d2f35c05c6160eb`
- **Generator Script**: `scripts/generate_phase30_synthetic_fixture.ts`

---

## 2. Structural Composition of the Fixture

The fixture defines 2 canonical canvas pages with 13 rich UI elements:

```mermaid
flowchart TD
    subgraph Fixture["samples/phase30_comprehensive_synthetic_fixture.json"]
        direction TB
        Page1["Page 1: Dashboard Overview (1440x900 px / 1080x675 pt)"]
        Page2["Page 2: Architecture Topology (3200x2400 px / 1584x1188 pt)"]
    end

    subgraph Page1Elements["Page 1 Test Elements"]
        E1["Header Title (Korean Pretendard Bold 28pt)"]
        E2["Subtitle (Korean + English mixed typography)"]
        E3["Metric Card A (VML Rect + Drop Shadow + Border)"]
        E4["Status Pill Badge (arcsize=0.500 full pill)"]
        E5["Metric Value & Sublabel"]
        E6["Action Button (Single-line wrapping buffer defense)"]
        E7["Image Card (Rounded Rect + Border + Drop Shadow)"]
        E8["Image Placeholder Label"]
        E9["Dashed Status Card (dashstyle='dash')"]
        E10["Secondary Action Button"]
    end

    subgraph Page2Elements["Page 2 Test Elements"]
        E11["Topology Title (Clamped 22-inch Page Header)"]
        E12["Backbone Cluster Node (Oversized canvas container)"]
    end

    Page1 --> Page1Elements
    Page2 --> Page2Elements
```

---

## 3. Detailed Component Test Matrix

| Component | Target Stress Feature | Expected OpenXML / VML / HWPX Output |
| :--- | :--- | :--- |
| **Header Title** | Korean text rendering without ascender clipping | `w:lineRule="atLeast"`, `w:line="380"` |
| **Subtitle** | Mixed CJK + Latin/Digits character spacing | `<w:autoSpaceDE w:val="0"/>`, `<w:autoSpaceDN w:val="0"/>` |
| **Metric Card A** | Drop shadow geometry and rounded corners | `<v:roundrect arcsize="0.053">` with `<v:shadow on="t" offset="0pt,3pt"/>` |
| **Status Pill Badge** | Symmetrical semicircular pill button | `arcsize="0.500"` (exact pill shape in Word) |
| **Action Button** | Single-line button label wrapping defense | `w:wordWrap w:val="0"`, `mso-wrap-style:none`, 4pt safety margin |
| **Image Card** | Rounded image clipping with border and shadow | `<v:roundrect arcsize="0.044">` enclosing `<v:imagedata>` + `<v:stroke>` + `<v:shadow>` |
| **Dashed Card** | Vector dashed stroke styling | `<v:stroke dashstyle="dash" weight="1.5pt"/>` |
| **Oversized Page 2** | Word 22-inch (1584 pt) maximum dimension limit | Uniform scale down from $3200 \times 2400\text{ px}$ to $1584 \times 1188\text{ pt}$ ($s = 0.495$) |

---

## 4. Parser & Topology Validation

When loaded into `FigmaCanvasParser`:
- Total pages parsed: 2
- Total Canvas IR elements: 13 (Page 1: 11 elements, Page 2: 2 elements)
- Scale preservation:
  - Page 1: $1440 \times 900\text{ px} \to 1080 \times 675\text{ pt}$ (Scale factor: $0.75\text{ pt/px}$, scale preserved: `true`).
  - Page 2: $3200 \times 2400\text{ px} \to 1584 \times 1188\text{ pt}$ (Scale factor: $0.495\text{ pt/px}$, clamped to Word 22" limit, scale preserved: `false`, structural defect flagged: `OVERSIZED_PAGE_CLAMPED`).

Verified by automated test in `tests/phase30-production-fidelity.test.ts` (Test 8).
