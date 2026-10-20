# Phase 29: Before vs After Fidelity & Safety Progression

## 1. Longitudinal Feature Matrix

| Feature / Invariant | Phase 25 (Baseline) | Phase 27 | Phase 28 | Phase 29 (Current) |
| :--- | :--- | :--- | :--- | :--- |
| **Word Automation Isolation** | Shared active document | File name match | UUID isolated directory | UUID folder + HMAC crypto signature + Atomic AppleScript |
| **Doc Index Race Defense** | Vulnerable | Vulnerable | Multi-step query | **Atomic single-loop execution (find $\rightarrow$ verify $\rightarrow$ export $\rightarrow$ close)** |
| **Snapshot Untitled Docs** | Swallowed errors | Swallowed errors | Fail-closed on error | **Total count parity check + explicit `<UNTITLED>` detection** |
| **Handle Spoofing Defense** | None | None | Directory check only | **HMAC-SHA256 signature with session secret** |
| **Section Isolation** | Single combined section | 17 sections | 17 sections | **17 sections with dynamic SHA-256 verification** |
| **Drop Shadow Support** | None | None | None | **Full Canvas IR, VML `<v:shadow>`, and HWPX `<hp:shadow>`** |
| **Korean Ascender Clipping** | Potential (`exact`) | Potential (`exact`) | Potential (`exact`) | **Resolved via `w:lineRule="atLeast"`** |
| **Button Text Wrapping** | Fixed width only | `<w:wordWrap w:val="0"/>` | `<w:wordWrap w:val="0"/>` | **`<w:wordWrap w:val="0"/>` + 2.5% tolerance buffer** |
| **Pill & Asymmetric Corners** | Symmetric scalar only | Symmetric scalar | `<v:shape>` path | **`<v:shape>` path + arcsize 0.500 pill button** |
| **Test Suite Size** | 350 tests | 390 tests | 420 tests | **430 tests passing (68 test files)** |
