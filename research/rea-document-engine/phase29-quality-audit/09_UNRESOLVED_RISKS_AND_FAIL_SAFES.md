# Phase 29: Unresolved Risks & Fail-Safe Defenses

## 1. Identified Environmental Constraints

1. **macOS Word Sandboxing / TCC Permissions**:
   - `osascript` requires Automation permission under macOS System Settings $\rightarrow$ Privacy & Security $\rightarrow$ Automation.
   - **Fail-Safe**: If permissions are revoked or prompt is dismissed, `captureWordState()` throws a fail-closed error immediately before any document operations are attempted.
2. **Missing `FIGMA_ACCESS_TOKEN`**:
   - Live Figma cloud rendering remains unconfigured.
   - **Defense**: All metrics and reports classify references as `offline_local_snapshot` or `synthetic_render_fixture` without making unverified claims.
3. **Word for Mac Dynamic Window Ordering**:
   - Word window focus shifts during user interaction.
   - **Defense**: By binding export and close operations directly to the verified document object reference within a single atomic loop, window focus changes cannot misdirect operations to other documents.
4. **Filesystem Temp Cleanup Grace Window**:
   - If Word holds file descriptors briefly after `close d saving no`, immediate `rmSync` could throw or leave locks.
   - **Defense**: A 150ms sleep grace interval and safe retry-wrapped deletion guarantee non-blocking cleanup.
