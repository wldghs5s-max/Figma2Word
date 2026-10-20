# Phase 29: Figma Reference Integrity & Ground Truth Classification

## 1. Environment & Figma Access Token Status

To establish complete transparency regarding the provenance of comparison fixtures:

- **`.env` File Status**: Checked — not present in local workspace repository.
- **`FIGMA_ACCESS_TOKEN` Environment Variable**: Unset / Undefined.
- **Impact**: Live Figma REST API endpoints (`GET /v1/images/:file_key`, etc.) cannot be queried dynamically without user credentials.
- **Security Posture**: The project adheres strictly to privacy and safety invariants. No private API tokens or credentials are hardcoded into version control or artifacts.

---

## 2. Four-Tier Ground Truth Classification Hierarchy

To ensure no ambiguous or inflated claims of fidelity, all comparisons adhere to the following four-tier ground truth schema:

| Tier | Label | Definition | Applicability in Phase 29 |
| :--- | :--- | :--- | :--- |
| **Tier 1** | `figma_cloud_render` | Official PNG exported directly from Figma Cloud API via authenticated token. | Unavailable (token unconfigured). |
| **Tier 2** | `offline_local_snapshot` | Verified offline Figma JSON snapshot captured from actual Figma files (`펜테크 3차 디자인.json`). | **Primary Ground Truth for Structure & Geometry.** |
| **Tier 3** | `synthetic_render_fixture` | Deterministic synthetic Figma nodes designed to verify specific rendering invariants (shadows, line rules, arcsize). | **Primary Ground Truth for Visual SSIM Tests.** |
| **Tier 4** | `native_word_export` | PDF/PNG rendered natively by macOS Microsoft Word via sandboxed AppleScript pipeline. | **Output Ground Truth for Word Compatibility.** |

---

## 3. Truth Labeling in Automated Reports

Every metric and visual comparison artifact produced in Phase 29 explicitly carries its ground truth provenance:
- When comparing synthetic designs: `ground_truth_tier: "synthetic_render_fixture"`.
- When inspecting structural counts: `ground_truth_tier: "offline_local_snapshot"`.
- No benchmark or report falsely reports live Figma cloud rendering when `FIGMA_ACCESS_TOKEN` is unavailable.
