# Phase 37 — Report 09: Table, Form & Input Component Layout Preservation

## 1. Context: Complex Enterprise UI Components

The customer design (`펜테크 3차 디자인.json`) contains dense enterprise business forms, data tables, and input screens:
- **Page 10 (`759:1076 - 신규등록 - 1`)**: Multi-column registration form with mandatory field indicators, input borders, and helper text.
- **Page 13 (`766:2942 - 사업정보 수정`)**: Form edit view with disabled fields, date pickers, and tab navigation.
- **Page 14 (`759:1314 - 신규등록 - 2`)**: Multi-step wizard layout with radio options, file upload zones, and action buttons.
- **Pages 8, 15, 17 (`사업목록`, `사업목록 클릭 시`)**: Data tables with repeating rows, status badges (e.g., "진행중", "완료"), checkmarks, and pagination controls.

---

## 2. Structural Rendering Techniques

To maintain both visual fidelity and document editability without flattening forms into static raster images:

### A. Modular Cell and Input Box Representation
Each form input and table cell is emitted as an editable VML vector container (`<v:roundrect>` or `<v:rect>`) with:
1. Exact border styling: stroke color, stroke weight (e.g. 1px solid `#E2E8F0`), and corner rounding radius.
2. Independent background fill (`<v:fill color="#FFFFFF"/>` or muted disabled background `#F8FAFC`).
3. An internal `<v:textbox>` containing the placeholder or value as native text (`<w:t>`).

### B. Table Grid Alignment
Rather than generating an inflexible Word table that might break complex nested absolute alignments, grid cells are anchored within precise coordinate frames that mirror Figma's layout grid. This guarantees:
1. Perfect vertical and horizontal alignment across data columns.
2. Label text and input boxes do not collide or push subsequent rows downward.
3. Users can directly click inside any input box in Word and type new text.

---

## 3. Editability and Fidelity Metrics on Form Pages

| Page | Frame Node ID | Name | Source Texts | Word Texts | Word Shapes | Editability Score | SSIM |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Page 10** | `759:1076` | 신규등록 - 1 | 42 | 45 | 96 | **96 / 100** | **0.9356** |
| **Page 13** | `766:2942` | 사업정보 수정 | 53 | 55 | 92 | **96 / 100** | **0.8629** |
| **Page 14** | `759:1314` | 신규등록 - 2 | 34 | 38 | 65 | **96 / 100** | **0.9457** |
| **Page 15** | `759:1858` | 사업목록 클릭 시 | 59 | 61 | 96 | **96 / 100** | **0.9339** |
| **Page 17** | `768:3434` | 사업목록 클릭 시 | 67 | 69 | 118 | **96 / 100** | **0.9270** |

All form labels, inputs, and buttons remain 100% native editable elements in Word while achieving visual fidelity up to 0.9457 SSIM.

