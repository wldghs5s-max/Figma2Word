# Phase 28 Quality Audit — Report 04: Figma Reference Integrity & 4-Tier Ground Truth Status

## 1. Context & Figma API Authentication Status

Phase 28 mandated attempting authentic Figma frame PNG export using the project's legitimate configuration, while strictly adhering to data security guidelines:
- No hardcoded tokens.
- No unauthorized external network calls.
- Transparent reporting if credentials are absent.

### Environment Audit

An inspection of the workspace environment and repository confirmed:
- `.env` file: `NOT_EXISTS` (only `.env.example` is present).
- `process.env.FIGMA_ACCESS_TOKEN`: `none` / `undefined`.
- `process.env.FIGMA_TOKEN`: `none` / `undefined`.

In accordance with security principles, no external credentials were spoofed, and no proprietary Figma design files were transmitted off-host.

---

## 2. Transparent 4-Tier Ground Truth Status

To prevent deceptive labeling where self-rendered images are claimed to be "Figma Ground Truth", Phase 28 strictly enforces the 4-tier truth classification:

| Tier | Label | Source Description | Availability in Local Offline Run | Status in Phase 28 |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | `figma_ground_truth` | Authentic PNG exported directly from Figma REST API (`/v1/images/:key`) using official token | Requires active `FIGMA_ACCESS_TOKEN` | **`UNAVAILABLE (Token Unconfigured)`** |
| **Tier 2** | `approximate_reference` | PNG rendered by HTML/Canvas engine from Figma JSON geometry | Locally synthesized | **`EXCLUDED (Honesty Guard)`** — not claimed as ground truth |
| **Tier 3** | `word_baseline` | Native Microsoft Word PDFKit PNG export prior to renderer fixes | Generated via native Word for Mac | **`ACTIVE`** (Stored in baseline artifacts) |
| **Tier 4** | `word_candidate` | Native Microsoft Word PDFKit PNG export after renderer fixes | Generated via native Word for Mac | **`ACTIVE`** (Generated in Phase 28 run) |

---

## 3. Ground Truth Integrity Conclusion

Because Tier 1 `figma_ground_truth` is unavailable locally without user-supplied Figma API credentials, Phase 28:
1. Rejects claiming that approximate HTML/Canvas renders represent Figma ground truth.
2. Evaluates rendering quality via **Differential Native Word Analysis** (comparing `word_baseline` vs `word_candidate`), OpenXML schema conformity, and geometric boundary containment.
3. Documents this distinction clearly so external auditors understand that SSIM comparisons are differential between Word engine states, not against an unauthenticated Figma cloud render.
