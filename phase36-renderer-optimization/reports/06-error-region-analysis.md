# Phase 36 Report 06: Error Region Analysis & Root Cause Identification

## 1. Initial State: Lowest Fidelity Frames

At the beginning of Phase 36, benchmark metrics on the customer file `펜테크 3차 디자인.json` revealed that while some screens achieved > 0.96 SSIM (e.g. Page 3, 5, 7), five specific screens suffered significantly lower fidelity:

| Page | Frame ID | Frame Description | Initial SSIM | Initial MAE | Initial Mismatch % |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page 4** | `759:759` | Desktop - 대시보드 (지도뷰) | **0.7882** | 8.57 | 16.41% |
| **Page 17** | `768:3434` | 사업목록 클릭 시 (상세) | **0.7915** | 6.62 | 14.32% |
| **Page 8** | `759:911` | 사업목록 선택된 화면 | **0.8412** | 6.52 | 13.39% |
| **Page 10** | `759:1076` | 신규등록 - 1 | **0.8924** | 4.36 | 6.54% |
| **Page 14** | `759:1314` | 신규등록 - 2 | **0.8969** | 4.01 | 6.53% |

---

## 2. Spatial Sector Analysis

Using `scripts/analyze_diff_sectors.ts`, diff images were divided into a 4x4 sector grid across the 1920x1170 canvas.
The results for Page 4 (지도뷰):

```
Row 0 (y: 0..292):     [C0: 2.6%] [C1: 3.5%]  [C2: 4.3%]  [C3: 1.4%]  <-- Top Header Bar (Almost perfect)
Row 1 (y: 292..584):   [C0: 3.0%] [C1: 19.1%] [C2: 63.0%] [C3: 2.8%]  <-- Map & Dashboard Content
Row 2 (y: 584..876):   [C0: 3.3%] [C1: 15.4%] [C2: 73.8%] [C3: 6.8%]  <-- Map & Dashboard Content
Row 3 (y: 876..1168):  [C0: 0.8%] [C1: 9.2%]  [C2: 43.9%] [C3: 2.7%]  <-- Lower Map Area
```

- **Header Bar (Row 0, y=0..72)**: Only 1.2% - 4.3% mismatch. Logo, server health, language selector, and admin profile rendered accurately.
- **Left Navigation Panel (Column 0, x=0..480)**: Only 0.8% - 3.3% mismatch. The tab toggles, search bar, and site list cards rendered accurately.
- **Map Content Area (Column 1 & 2, x=776..1545, y=284..1041)**: Mismatch density exploded to **63.0% - 73.8%**!

---

## 3. Root Cause: Affine `imageTransform` Ignored for `scaleMode: STRETCH`

Deep inspection of node `759:891` ("map-area") in `펜테크 3차 디자인.json` uncovered the following properties:
```json
{
  "id": "759:891",
  "name": "map-area",
  "type": "FRAME",
  "background": [
    {
      "type": "IMAGE",
      "scaleMode": "STRETCH",
      "imageRef": "92929debb5bcf2ddab48270e1fa5500cd00c8b31",
      "imageTransform": [
        [0.9912344217300415, 0, 0.008765552192926407],
        [0, 0.9512301087379456, 0.00044198884279467165]
      ]
    }
  ]
}
```

### The Transform Matrix Breakdown:
- `sx = 0.991234`, `tx = 0.008766`
- `sy = 0.951230`, `ty = 0.000442`
- In Figma, normalized texture coordinates evaluate to:
  `v_min = ty = 0.00044`
  `v_max = ty + sy = 0.95167`
- Figma only displays the top 95.17% of the image! The bottom **4.83% of the image is cropped**.

### The Renderer Defect:
In `src/canvas/parser/figmaCanvasParser.ts`:
```ts
if (imageScaleMode === "CROP" && Array.isArray(transform) ...)
```
The parser **only extracted `imageCrop` when `imageScaleMode === "CROP"`**!
Because Figma set `scaleMode: "STRETCH"`, `imageTransform` was completely ignored!
As a consequence:
1. `imageCrop` was left `undefined`.
2. `docxCanvasRenderer.ts` generated no `croptop` or `cropbottom` attributes for VML.
3. Microsoft Word stretched the entire 100% of the 1588x1616 image into the box.
4. The map was vertically compressed by ~4.83%, shifting every lake, road, label, and marker by 15-40 pixels!
5. This single defect affected Page 4, Page 8, Page 10, Page 14, and Page 17.
