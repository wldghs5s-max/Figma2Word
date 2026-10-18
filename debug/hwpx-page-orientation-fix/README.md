# HWPX Page Orientation Fix Deliverables & Verification Guide

## 1. Overview
- **Issue**: Figma source and DOCX were portrait (세로), but HWPX was opening as landscape (가로) in Hancom Office 2024 Viewer.
- **Root Cause**: In OWPML (KS X 6101), `landscape="WIDELY"` denotes **Portrait (세로)** and `landscape="NARROWLY"` denotes **Landscape (가로)**. The renderer code previously had this mapped backwards (`isLandscape ? "WIDELY" : "NARROWLY"`).
- **Fix Applied**:
  - `landscapeAttr = isLandscape ? "NARROWLY" : "WIDELY"`
  - Paper base dimensions strictly bounded in portrait coordinates (`baseWidth <= baseHeight`) as mandated by Hancom schema.

## 2. Deliverable Matrix

| Artifact Name | Format | Orientation | Page Dimensions | OWPML / OpenXML Attributes | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `stage6-portrait.hwpx` | HWPX | Portrait | 595.28 x 841.89 pt | `landscape="WIDELY"`, w=59528, h=84189 | Verified |
| `stage6-portrait.docx` | DOCX | Portrait | 595.28 x 841.89 pt | `w:orient="portrait"`, w=11906, h=16838 | Verified |
| `stage7-portrait.hwpx` | HWPX | Portrait (9pp) | 595.28 x 841.89 pt | `landscape="WIDELY"`, w=59528, h=84189 | Verified |
| `stage7-portrait.docx` | DOCX | Portrait (9pp) | 595.28 x 841.89 pt | `w:orient="portrait"`, w=11906, h=16838 | Verified |
| `diag-a4-portrait.hwpx` | HWPX | Portrait | 595.28 x 841.89 pt | `landscape="WIDELY"`, w=59528, h=84189 | Diagnostic Passed |
| `diag-a4-portrait.docx` | DOCX | Portrait | 595.28 x 841.89 pt | `w:orient="portrait"`, w=11906, h=16838 | Diagnostic Passed |
| `diag-a4-landscape.hwpx` | HWPX | Landscape | 841.89 x 595.28 pt | `landscape="NARROWLY"`, w=59528, h=84189 | Diagnostic Passed |
| `diag-a4-landscape.docx` | DOCX | Landscape | 841.89 x 595.28 pt | `w:orient="landscape"`, w=16838, h=11906 | Diagnostic Passed |

## 3. Hancom Office 2024 Viewer Inspection Checklist

1. Open `stage6-portrait.hwpx` and `stage7-portrait.hwpx` in Hancom Office 2024 Viewer.
2. Confirm the page orientation is vertical (세로형).
3. Observe that the vertical height budget (841.89pt) is fully visible, and previously clipped bottom elements are restored within the page boundary.
4. Open `diag-a4-portrait.hwpx` and verify the blue outer boundary card surrounds the vertical page.
5. Open `diag-a4-landscape.hwpx` and verify the green 3-column layout expands horizontally across the wide page.
