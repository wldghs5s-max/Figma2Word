# Phase 28 Quality Audit — Report 09: Unresolved Risks & Platform Limitations

## 1. Remaining Architectural Constraints & Residual Risks

While Phase 28 resolves document ownership risks and introduces universal rendering fixes, the following platform limitations remain inherent to Microsoft Word and the VML graphics subsystem:

### 1. VML Deprecation vs. Cross-Platform Compatibility
- **Status**: Microsoft has officially deprecated VML in favor of DrawingML. However, Microsoft Word still supports VML in OpenXML documents for backward compatibility and precise page-coordinate absolute positioning.
- **Risk**: In web-based Office 365 or Word Online, VML shapes may have limited rendering capabilities compared to desktop Word for Windows and Mac.
- **Mitigation**: Future architectural phases should evaluate a gradual transition of vector shapes and cards to DrawingML (`<wp:anchor>`), while retaining VML as a fallback.

### 2. Cross-OS Typography & Font Rendering Variations
- **Status**: Figma designs frequently utilize modern web typography (such as Pretendard, Inter, or Roboto).
- **Risk**: If the end user opening the DOCX on Windows or Mac does not have the specified font installed locally, Word falls back to Arial or Calibri, whose character metrics and line heights differ.
- **Mitigation**: `DocxCanvasRenderer` includes font family fallback mapping and horizontal tolerance buffers, but full 1:1 typographic fidelity on uninstalled fonts requires Word font embedding (`<w:embedTrueTypeFonts/>`).

### 3. macOS Sandbox LaunchServices Dialogs
- **Status**: Using LaunchServices `open -a "Microsoft Word"` grants security-scoped bookmarks without prompting user dialogs.
- **Risk**: If Microsoft Word is running under heavy system load, the initial file load may exceed 20 seconds.
- **Mitigation**: Phase 28 configurable polling timeout defaults to 25 seconds with fail-closed cancellation.

### 4. Figma API Token Dependency for Tier 1 Ground Truth
- **Status**: Authentic Figma REST API export requires a valid Personal Access Token (`FIGMA_ACCESS_TOKEN`).
- **Risk**: In offline environments or air-gapped corporate intranets, Tier 1 ground truth cannot be retrieved.
- **Mitigation**: Transparent 4-tier truth labeling ensures that approximate offline references are never deceptively presented as authentic Figma ground truth.
