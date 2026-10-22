# Phase 30 Source Ingest for External Audit (Argon)

> **Document Type**: Read-Only Source Code & XML Verification Ingest  
> **Target Audience**: External Auditor (Argon / GPT Review Engine)  
> **Generation Timestamp**: 2026-10-22T10:25:00+09:00  
> **Scope**: Verifiable source code extracts, call graphs, exact line numbers, and raw DOCX OpenXML inspection.  
> **Integrity Policy**: No mock responses, no truncated critical logic, no Base64 blobs, no unverified claims.

---

## Section 1 — Source Manifest

### 1.1 Git Environment & HEAD Commit
- **Repository Root**: `Figma2Word`
- **Git HEAD Commit**: `77c6ef3f95496b7d2fc253a4853b1ea5036bee65`
- **Commit Message**: `feat(fidelity): Phase 30 production visual fidelity, Word lifecycle safety & E2E verification`
- **Environment**: macOS 15.6 (Darwin 25.6.0 arm64), Node.js v26.7.0, Microsoft Word for Mac 16.114

### 1.2 Target Source Files & Verification Hashes

| Relative Path | Role in Architecture | File Size | Line Count | SHA-256 Digest | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `src/canvas/renderer/docxCanvasRenderer.ts` | Production DOCX / VML Renderer | 34,800 B | 891 | `6be31ca948647fb30d1a969ed5af2170d423555c6e49c13155a570440739370d` | Included (Extracts) |
| `tools/visual-regression/safe_word_automation.ts` | Word Automation Lifecycle & Safety | 25,587 B | 777 | `ff6649672bb13e5850cc3b6abc64256278ff515dae3bfab3c3b0df4003829278` | Included (Extracts) |
| `tools/visual-regression/pipeline.ts` | Visual Pipeline Orchestrator | 4,903 B | 144 | `d2480e7608dc3da25196a7737e078a52700b77e514de04bb2fe234b0d7ac92f5` | Included (Extracts) |
| `src/canvas/renderer/hwpxCanvasRenderer.ts` | Production HWPX / KS X 6101 Renderer | 50,438 B | 1,216 | `9c9d2d69c0a74ba44216aac4955b494eb049ea06aedf66ce61d6923cf20814e5` | Included (Extracts) |
| `scripts/generate_phase30_synthetic_fixture.ts` | Benchmark Fixture Generator | 13,015 B | 307 | `f628ca5370b41202933425497a34e2afc2670340d1a1780304ddb4f13c208be5` | Included (Extracts) |
| `debug/phase30-evidence/run/phase30_rendered.docx` | Phase 30 Native Rendered DOCX | 5,894 B | N/A | `fddf2191973dcfe542de1617648be69d3321539795fc4b932266c20f26aceb94` | Inspected (XML) |

---

## Section 2 — DOCX Renderer

**File**: `src/canvas/renderer/docxCanvasRenderer.ts`  
**Total Lines**: 891  
**Key Responsibilities**:
- Emits OpenXML packaging structure (`[Content_Types].xml`, `word/_rels/document.xml.rels`, `word/document.xml`, `word/media/*`).
- Serializes `CanvasElement` nodes into Microsoft Word VML objects (`<v:rect>`, `<v:roundrect>`, `<v:shape>`, `<v:line>`, `<v:textbox>`).
- Binds image assets via relationship IDs (`r:id`) and manages VML image attributes (`<v:imagedata>`, `arcsize`, `filled`, `stroked`, `<v:shadow>`).

### 2.1 Call Graph & Component Relationships

```
renderToBuffer(doc) / renderToUint8Array(doc)
 └─► buildZip(doc)
      ├─► buildContentTypesXml()
      ├─► buildDocumentRelsXml(imageRelMap)
      │    └─► Binds rId (e.g. rId2) to Target "media/${resId}"
      ├─► Store image binaries: zip.file(`word/media/${resId}`, res.data)
      └─► buildDocumentXml(doc, imageRelMap)
           └─► Loop over doc.pages
                ├─► buildBackgroundRect()
                └─► Loop over page.elements
                     └─► renderElement(pageIdx, elemIdx, elem, imageRelMap, resources)
                          ├─► Image branch (elem.type === "image"): lines 564–705
                          │    ├─ Computes FIT/Cover crop margins (croptop, cropbottom, cropleft, cropright)
                          │    ├─ Computes arcsize for rounded corners: Math.min(0.5, (2 * imgRadius) / minImgDim)
                          │    ├─ Chooses tag: imgRadius > 0 ? "v:roundrect" : "v:shape"
                          │    ├─ Emits <v:shadow> if elem.style.shadow is present
                          │    ├─ Emits <v:stroke> if elem.style.strokeDashed is present
                          │    └─ Emits <v:imagedata r:id="${relId}" ... />
                          └─► Shape / Textbox branch: lines 707–889
                               ├─ Chooses tag: "v:roundrect", "v:shape" (asymmetric), "v:rect", "v:oval"
                               ├─ Emits <v:textbox> with <w:txbxContent><w:p><w:pPr>
                               ├─ Emits <w:wordWrap w:val="0"/> for single-line text
                               ├─ Emits <w:autoSpaceDE w:val="0"/> and <w:autoSpaceDN w:val="0"/>
                               └─ Emits text runs with <w:rFonts>, <w:color>, <w:t>
```

### 2.2 Source Code Extracts with Exact Line Numbers

#### Extract 2.2.1: Media Packaging & Relationship Generation (Lines 82–102, 210–222)
```typescript
// [docxCanvasRenderer.ts: lines 82–102]
    // 5. word/media/
    const imageRelMap = new Map<string, string>(); // resourceId -> rId
    let rIdCounter = 2; // rId1 is styles.xml

    for (const [resId, res] of Object.entries(doc.resources || {})) {
      const rId = `rId${rIdCounter++}`;
      imageRelMap.set(resId, rId);
      zip.file(`word/media/${resId}`, res.data);
    }

    // 6. word/_rels/document.xml.rels
    zip.file(
      "word/_rels/document.xml.rels",
      this.buildDocumentRelsXml(imageRelMap)
    );

    // 7. word/document.xml
    zip.file("word/document.xml", this.buildDocumentXml(doc, imageRelMap));

    return zip;
  }

// [OMITTED: lines 103–209: renderToUint8Array, buildContentTypesXml, buildRootRelsXml, buildCorePropsXml, buildStylesXml, buildSettingsXml]

// [docxCanvasRenderer.ts: lines 210–222]
  private buildDocumentRelsXml(imageRelMap: Map<string, string>): string {
    let rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`;

    for (const [resId, rId] of imageRelMap.entries()) {
      rels += `\n  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${resId}"/>`;
    }

    rels += "\n</Relationships>";
    return rels.trim();
  }
```

#### Extract 2.2.2: Image Node VML Rendering (Lines 563–705)
```typescript
// [docxCanvasRenderer.ts: lines 563–705]
    // 2. Image
    if (elem.type === "image" && elem.imageRef) {
      const relId = imageRelMap.get(elem.imageRef) || "rId1";
      let cropAttr = "";
      let imgX = x;
      let imgY = y;
      let imgBoxW = width;
      let imgBoxH = height;

      const res = resources && elem.imageRef ? resources[elem.imageRef] : undefined;
      let imgW = 0;
      let imgH = 0;
      if (res && res.data && res.data.length > 24) {
        const d = res.data;
        const readU32 = (off: number) =>
          ((d[off] << 24) >>> 0) + (d[off + 1] << 16) + (d[off + 2] << 8) + d[off + 3];
        const readU16 = (off: number) =>
          (d[off] << 8) | d[off + 1];

        // PNG check: 89 50 4E 47
        if (
          d[0] === 0x89 &&
          d[1] === 0x50 &&
          d[2] === 0x4e &&
          d[3] === 0x47
        ) {
          imgW = readU32(16);
          imgH = readU32(20);
        } else if (d[0] === 0xff && d[1] === 0xd8) {
          // Basic JPEG SOF0/SOF2 marker parser
          let offset = 2;
          while (offset < d.length - 8) {
            const marker = readU16(offset);
            offset += 2;
            if (marker === 0xffc0 || marker === 0xffc2) {
              imgH = readU16(offset + 3);
              imgW = readU16(offset + 5);
              break;
            }
            const len = readU16(offset);
            offset += len;
          }
        }
      }

      if (elem.imageCrop) {
        const ct = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.top)) * 65536);
        const cb = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.bottom)) * 65536);
        const cl = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.left)) * 65536);
        const cr = Math.round(Math.max(0, Math.min(0.95, elem.imageCrop.right)) * 65536);
        const parts: string[] = [];
        if (ct > 0) parts.push(`croptop="${ct}f"`);
        if (cb > 0) parts.push(`cropbottom="${cb}f"`);
        if (cl > 0) parts.push(`cropleft="${cl}f"`);
        if (cr > 0) parts.push(`cropright="${cr}f"`);
        if (parts.length > 0) {
          cropAttr = " " + parts.join(" ");
        }
      } else if (elem.imageScaleMode === "FIT" && imgW > 0 && imgH > 0 && width > 0 && height > 0) {
        const arImg = imgW / imgH;
        const arBox = width / height;
        if (arImg > arBox) {
          imgBoxW = width;
          imgBoxH = width / arImg;
          imgY = y + (height - imgBoxH) / 2;
        } else {
          imgBoxH = height;
          imgBoxW = height * arImg;
          imgX = x + (width - imgBoxW) / 2;
        }
      } else if (imgW > 0 && imgH > 0 && width > 0 && height > 0) {
        const arImg = imgW / imgH;
        const arBox = width / height;
        if (arImg < arBox * 0.99) {
          // Image is taller than container box: crop top & bottom (object-fit: cover)
          const cropY = (1.0 - arImg / arBox) / 2.0;
          const cropVal = Math.round(cropY * 65536);
          cropAttr = ` croptop="${cropVal}f" cropbottom="${cropVal}f"`;
        } else if (arImg > arBox * 1.01) {
          // Image is wider than container box: crop left & right
          const cropX = (1.0 - arBox / arImg) / 2.0;
          const cropVal = Math.round(cropX * 65536);
          cropAttr = ` cropleft="${cropVal}f" cropright="${cropVal}f"`;
        }
      }

      const imgStyle = `position:absolute;left:0;top:0;margin-left:${imgX.toFixed(
        3
      )}pt;margin-top:${imgY.toFixed(3)}pt;width:${imgBoxW.toFixed(
        3
      )}pt;height:${imgBoxH.toFixed(
        3
      )}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none${rotStyle}`;

      const imgStyleObj = elem.style || {};
      const imgRadii = imgStyleObj.cornerRadii;
      const imgRadius = (imgRadii && imgRadii[0] > 0 ? imgRadii[0] : imgStyleObj.cornerRadius) || 0;
      const minImgDim = Math.max(1e-3, Math.min(imgBoxW, imgBoxH));

      let imgTag = "v:shape";
      let imgShapeExtraAttrs = "";
      if (imgRadius > 0) {
        imgTag = "v:roundrect";
        imgShapeExtraAttrs = `arcsize="${Math.min(0.5, (2 * imgRadius) / minImgDim).toFixed(3)}" `;
      }

      const imgHasStroke = !!imgStyleObj.strokeColor && (imgStyleObj.strokeWidth || 0) > 0;
      const imgStrokedAttr = imgHasStroke ? 'stroked="t"' : 'stroked="f"';
      const imgStrokecolorAttr = imgHasStroke ? `strokecolor="#${cleanHex(imgStyleObj.strokeColor)}"` : "";
      const imgStrokeweightAttr = imgHasStroke
        ? `strokeweight="${(imgStyleObj.strokeWidth || 1).toFixed(2)}pt"`
        : "";

      const imgShadowChild = imgStyleObj.shadow
        ? `<v:shadow on="t" type="single" color="#${cleanHex(
            imgStyleObj.shadow.color,
            "000000"
          )}" offset="${(imgStyleObj.shadow.offsetX || 0).toFixed(2)}pt,${(
            imgStyleObj.shadow.offsetY || 0
          ).toFixed(2)}pt"${
            typeof imgStyleObj.shadow.opacity === "number"
              ? ` opacity="${imgStyleObj.shadow.opacity.toFixed(2)}"`
              : ""
          }/>`
        : "";

      const imgDashChild = imgHasStroke && imgStyleObj.strokeDashed ? '<v:stroke dashstyle="dash"/>' : "";

      return `<w:r>
  <w:pict>
    <${imgTag} id="${shapeId}"
             ${altAttr}
             ${titleAttr}
             style="${imgStyle}"
             ${imgShapeExtraAttrs}filled="f"
             ${imgStrokedAttr}
             ${imgStrokecolorAttr}
             ${imgStrokeweightAttr}>${imgDashChild}${imgShadowChild}
      <v:imagedata r:id="${relId}"${cropAttr} o:title="${escapeXml(elem.name || "image")}"/>
    </${imgTag}>
  </w:pict>
</w:r>`;
    }
```

#### Extract 2.2.3: Textbox & Korean Typography Wrapping Defense (Lines 827–855)
```typescript
// [docxCanvasRenderer.ts: lines 827–855]
      const hasHardNewline = elem.textRuns.some((r) => r.text && /[\r\n]/.test(r.text));
      const isSingleLine =
        !hasHardNewline &&
        (elem.textAutoResize === "WIDTH_AND_HEIGHT" ||
          (elem.bounds.height > 0 &&
            firstLineHeight &&
            elem.bounds.height <= firstLineHeight * 1.45) ||
          (elem.bounds.height > 0 &&
            maxFontSize &&
            elem.bounds.height <= maxFontSize * 1.6));
      // In OpenXML ECMA-376 Part 1 §17.3.1.44, disabling word wrap in paragraph properties is <w:wordWrap w:val="0"/>
      // (Note: <w:noWrap/> is only valid in table cell properties w:tcPr per §17.4.38 and causes Word corruption dialogs)
      const wordWrapXml = isSingleLine ? '<w:wordWrap w:val="0"/>\n              ' : "";
      textboxContentXml = `
      <v:textbox style="${fitTextAttr};mso-next-textbox:none;${vAnchor}" ${insetAttr}>
        <w:txbxContent>
          <w:p>
            <w:pPr>
              ${wordWrapXml}<w:jc w:val="${jcVal}"/>
              ${spacingXml}
              <w:contextualSpacing w:val="0"/>
              <w:autoSpaceDE w:val="0"/>
              <w:autoSpaceDN w:val="0"/>
            </w:pPr>
            ${runsXml.join("\n            ")}
          </w:p>
        </w:txbxContent>
      </v:textbox>`;
```

---

## Section 3 — Word Automation Safety

**File**: `tools/visual-regression/safe_word_automation.ts`  
**Total Lines**: 777  
**Secondary Caller**: `tools/visual-regression/pipeline.ts` (Lines 76–142)  
**Key Responsibilities**:
- Lifecycle state machine management (`DocumentLifecycleState`).
- Document ownership isolation in `os.tmpdir()` with HMAC verification signatures.
- Rejection of pre-existing documents and zero closing of user workspaces.
- Container-staged PDF export (`~/Library/Containers/com.microsoft.Word/Data/tmp`) bypassing macOS sandbox modal prompts.
- Atomic AppleScript execution with normalized POSIX path checks.
- Fail-closed timeout handling and safe directory pruning.

### 3.1 Call Graph & Execution Sequence

```
runVisualPipeline(options) [pipeline.ts]
 ├─► captureWordState()
 ├─► openTargetDocumentSafely(docxPath, snapshot, 25)
 │    ├─► Creates isolated folder: os.tmpdir()/f2w_word_isolation/vr_${runId}
 │    ├─► Copies docx to isolated path
 │    ├─► Computes HMAC signature (computeHandleSignature)
 │    ├─► Verifies snapshot does NOT already contain isolated path
 │    ├─► transitionLifecycleState(handle, 'open_requested')
 │    ├─► execFileSync('open', ['-a', 'Microsoft Word', isolatedDocxPath])
 │    ├─► Polls Word via runAppleScript(queryScript) comparing normalized POSIX paths
 │    │    └─► On timeout: transitionLifecycleState(handle, 'uncertain')
 │    │         └─► THROWS Error WITHOUT DELETING isolatedDir
 │    └─► On success: transitionLifecycleState(handle, 'open_confirmed')
 ├─► exportAndCloseTargetDocOnly(handle, pdfPath, 600)
 │    ├─► exportTargetDocToPdfOnly(handle, outPdfPath, timeoutSeconds)
 │    │    ├─► validateOwnershipHandle(handle)
 │    │    ├─► Detects Word container tmp path: Library/Containers/com.microsoft.Word/Data/tmp
 │    │    ├─► transitionLifecycleState(handle, 'export_requested')
 │    │    ├─► Executes atomicExportScript: save as d file name "${escapedPdf}" file format format PDF
 │    │    ├─► Verifies exported PDF size > 0
 │    │    ├─► Copies from container tmp to resolved target path & unlinks staged file
 │    │    └─► transitionLifecycleState(handle, 'exported')
 │    ├─► closeTargetDocOnly(handle, 30)
 │    │    ├─► validateOwnershipHandle(handle)
 │    │    ├─► transitionLifecycleState(handle, 'close_requested')
 │    │    ├─► Executes atomicCloseScript: close d saving no
 │    │    ├─► Re-queries captureWordState() to ensure document is no longer listed
 │    │    └─► transitionLifecycleState(handle, 'close_confirmed')
 │    └─► safeCleanupIsolatedDirectory(handle)
 │         ├─► Requires handle.lifecycleState === 'close_confirmed'
 │         ├─► Deletes isolatedDir
 │         └─► transitionLifecycleState(handle, 'cleanup_completed')
 └─► cleanResidualIsolationDirsSafely(maxAgeMs) [Scheduled / Maintenance]
      ├─► Queries captureWordState() -> wordOpenPaths
      └─► Skips any directory whose path matches wordOpenPaths or age < maxAgeMs
```

### 3.2 Source Code Extracts with Exact Line Numbers

#### Extract 3.2.1: Lifecycle State Types & Transition Handler (Lines 10–73)
```typescript
// [safe_word_automation.ts: lines 10–73]
export type DocumentLifecycleState =
  | 'created'           // Isolated copy created on disk
  | 'open_requested'    // open -a Microsoft Word launched
  | 'open_confirmed'    // Verified present in Word document list via normalized POSIX path
  | 'export_requested'  // Export AppleScript called
  | 'exported'          // PDF successfully exported to target path
  | 'close_requested'   // Close AppleScript called
  | 'close_confirmed'   // Document verified closed in Word
  | 'uncertain'         // Timeout, AppleEvent failure, or Word unresponsive; file held on disk
  | 'cleanup_pending'   // Awaiting safe cleanup
  | 'cleanup_completed';// Successfully cleaned up from disk

export interface WordEnvironmentSnapshot {
  wordWasRunning: boolean;
  initialDocumentNames: string[];
  initialDocumentPaths: string[];
  initialDocumentCount: number;
  untitledDocumentsCount: number;
}

export interface AutomatedWordHandle {
  runId: string;
  sourceDocxPath: string;
  isolatedDocxPath: string;
  isolatedDir: string;
  normalizedPosixPath: string;
  docName: string;
  docIndex: number;
  sectionsCount: number;
  isOwned: boolean;
  verificationSignature: string;
  lifecycleState?: DocumentLifecycleState;
  stateHistory?: Array<{
    state: DocumentLifecycleState;
    timestamp: number;
    details?: string;
  }>;
}

/**
 * Backward compatibility alias for earlier pipeline consumers.
 */
export interface OpenedWordDocument extends AutomatedWordHandle {
  fullPath: string;
}

/**
 * Records a transition in the lifecycle of an automated Word document.
 */
export function transitionLifecycleState(
  handle: AutomatedWordHandle,
  nextState: DocumentLifecycleState,
  details?: string
): void {
  handle.lifecycleState = nextState;
  if (!handle.stateHistory) {
    handle.stateHistory = [];
  }
  handle.stateHistory.push({
    state: nextState,
    timestamp: Date.now(),
    details,
  });
}
```

#### Extract 3.2.2: Ownership Validation & HMAC Verification (Lines 95–146)
```typescript
// [safe_word_automation.ts: lines 95–146]
export function computeHandleSignature(
  runId: string,
  isolatedDir: string,
  isolatedDocxPath: string
): string {
  const payload = `${runId}|${normalizeWordPath(isolatedDir)}|${normalizeWordPath(isolatedDocxPath)}`;
  return crypto
    .createHmac('sha256', RUNTIME_VERIFICATION_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Validates that an object is an authentic AutomatedWordHandle created by this process.
 * Throws a TypeError/Error if handle is invalid, untrusted, or unowned.
 */
export function validateOwnershipHandle(handle: unknown): asserts handle is AutomatedWordHandle {
  if (!handle || typeof handle !== 'object') {
    throw new TypeError(
      '[WordAutomationSecurity] Operation rejected: handle must be a non-null object'
    );
  }

  const h = handle as Partial<AutomatedWordHandle>;

  if (typeof h.runId !== 'string' || !h.runId.startsWith('vr_')) {
    throw new Error('[WordAutomationSecurity] Rejected: invalid or missing runId');
  }

  if (typeof h.isolatedDir !== 'string' || typeof h.isolatedDocxPath !== 'string') {
    throw new Error('[WordAutomationSecurity] Rejected: invalid or missing isolated paths');
  }

  if (h.isOwned !== true) {
    throw new Error('[WordAutomationSecurity] Rejected: handle is not marked as owned');
  }

  const expectedSig = computeHandleSignature(
    h.runId,
    h.isolatedDir,
    h.isolatedDocxPath
  );

  if (
    typeof h.verificationSignature !== 'string' ||
    h.verificationSignature.length !== expectedSig.length ||
    !crypto.timingSafeEqual(
      Buffer.from(h.verificationSignature),
      Buffer.from(expectedSig)
    )
  ) {
    throw new Error('[WordAutomationSecurity] Rejected: HMAC verification signature mismatch');
  }
}
```

#### Extract 3.2.3: Safe Document Open & Timeout Handling (Lines 330–465)
```typescript
// [safe_word_automation.ts: lines 330–465]
export async function openTargetDocumentSafely(
  docxPath: string,
  snapshot: WordEnvironmentSnapshot,
  maxWaitSeconds: number = 25
): Promise<OpenedWordDocument> {
  const resolvedSource = path.resolve(docxPath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Target DOCX does not exist: ${resolvedSource}`);
  }

  // 1. Create unique execution run folder in os.tmpdir() with UUID
  const runId = 'vr_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
  const isolatedDir = path.join(os.tmpdir(), 'f2w_word_isolation', runId);
  fs.mkdirSync(isolatedDir, { recursive: true });

  const isolatedDocxPath = path.join(isolatedDir, path.basename(resolvedSource));
  fs.copyFileSync(resolvedSource, isolatedDocxPath);

  const normalizedTargetPosix = normalizeWordPath(isolatedDocxPath);
  const verificationSignature = computeHandleSignature(
    runId,
    isolatedDir,
    isolatedDocxPath
  );

  const handle: OpenedWordDocument = {
    runId,
    sourceDocxPath: resolvedSource,
    isolatedDocxPath,
    isolatedDir,
    normalizedPosixPath: normalizedTargetPosix,
    docName: path.basename(resolvedSource),
    docIndex: 0,
    sectionsCount: 0,
    isOwned: true,
    verificationSignature,
    fullPath: resolvedSource,
    lifecycleState: 'created',
    stateHistory: [{ state: 'created', timestamp: Date.now() }],
  };

  // 2. Reject ownership if this exact path is already open in Word
  if (snapshot.initialDocumentPaths.includes(normalizedTargetPosix)) {
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
    throw new Error(
      `[WordAutomation] Target document path is already open in Word prior to automation: ${normalizedTargetPosix}. Automation refuses to claim ownership.`
    );
  }

  // 3. Open ONLY the isolated copy via macOS LaunchServices without shell injection
  transitionLifecycleState(handle, 'open_requested', 'LaunchServices open command invoked');
  try {
    execFileSync('open', ['-a', 'Microsoft Word', isolatedDocxPath]);
  } catch (err: any) {
    transitionLifecycleState(handle, 'uncertain', `Failed to launch Word: ${err.message}`);
    // Safe to clean up since launch itself threw before Word saw the path
    try {
      fs.rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
    throw new Error(
      `[WordAutomation] Failed to launch Word for isolated document: ${err.message}`
    );
  }

  // 4. Poll for the document matching normalizedTargetPosix strictly
  let matchedDoc: { index: number; name: string; sectionsCount: number } | null = null;

  for (let i = 0; i < maxWaitSeconds; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const queryScript = `
tell application "Microsoft Word"
  set out to {}
  repeat with i from 1 to (count of documents)
    set d to document i
    try
      set p to (posix full name of d as text)
      set s to (saved of d as boolean)
      set n to (name of d as text)
      set sCount to (count of sections of d)
      set end of out to (i as text) & "<#SEP#>" & n & "<#SEP#>" & p & "<#SEP#>" & (s as text) & "<#SEP#>" & (sCount as text)
    on error
    end try
  end repeat
  set AppleScript's text item delimiters to "<#ROW#>"
  return out as text
end tell
`;
      const raw = runAppleScript(queryScript, 5000);
      if (raw) {
        const rows = raw.split('<#ROW#>');
        for (const row of rows) {
          const parts = row.split('<#SEP#>');
          if (parts.length >= 5) {
            const idx = parseInt(parts[0], 10);
            const name = parts[1];
            const p = normalizeWordPath(parts[2]);
            const sCount = parseInt(parts[4], 10) || 0;
            // STRICT normalized POSIX path match ONLY. No name or prefix matching!
            if (p === normalizedTargetPosix) {
              matchedDoc = { index: idx, name, sectionsCount: sCount };
              break;
            }
          }
        }
      }
      if (matchedDoc) break;
    } catch {
      // transient polling error, keep polling
    }
  }

  if (!matchedDoc) {
    // P0 Safety Fix: Mark as 'uncertain' and DO NOT delete isolatedDir!
    // Word might still be loading or waiting on an OS dialog.
    transitionLifecycleState(
      handle,
      'uncertain',
      `Timeout after ${maxWaitSeconds}s waiting for Word confirmation`
    );
    throw new Error(
      `[WordAutomation] Timeout waiting for target document "${path.basename(
        resolvedSource
      )}" to load at isolated path: ${normalizedTargetPosix}. (Lifecycle state: uncertain; isolated directory preserved at "${isolatedDir}" to protect Word stability)`
    );
  }

  handle.docName = matchedDoc.name;
  handle.docIndex = matchedDoc.index;
  handle.sectionsCount = matchedDoc.sectionsCount;
  transitionLifecycleState(handle, 'open_confirmed', `Confirmed open in Word at index ${matchedDoc.index}`);

  return handle;
}
```

#### Extract 3.2.4: PDF Export via Sandbox Container Staging (Lines 471–556)
```typescript
// [safe_word_automation.ts: lines 471–556]
export function exportTargetDocToPdfOnly(
  handle: AutomatedWordHandle,
  outPdfPath: string,
  timeoutSeconds: number = 600
): { exportSuccess: boolean; pdfPath: string } {
  validateOwnershipHandle(handle);

  const resolvedPdf = path.resolve(outPdfPath);

  // macOS App Sandbox strategy:
  // Microsoft Word for Mac is sandboxed and displays a blocking modal dialog ("파일 액세스 부여")
  // when AppleScript directs it to write to project directories outside its sandbox.
  // Writing to Word's container tmp folder (~/Library/Containers/com.microsoft.Word/Data/tmp)
  // succeeds immediately with zero permission dialogs, after which we safely copy to resolvedPdf.
  const wordContainerTmp = path.join(os.homedir(), 'Library/Containers/com.microsoft.Word/Data/tmp');
  let targetExportPath = resolvedPdf;
  let useContainerStaging = false;

  if (fs.existsSync(path.dirname(wordContainerTmp))) {
    fs.mkdirSync(wordContainerTmp, { recursive: true });
    targetExportPath = path.join(wordContainerTmp, `vr_${handle.runId}_${Date.now()}.pdf`);
    useContainerStaging = true;
  }

  const escapedPdf = escapeAppleScript(targetExportPath);
  const escapedTarget = escapeAppleScript(handle.normalizedPosixPath);

  transitionLifecycleState(handle, 'export_requested', `Exporting PDF via Word (target: ${targetExportPath})`);

  const atomicExportScript = `
with timeout of ${timeoutSeconds} seconds
  tell application "Microsoft Word"
    set targetFound to false
    repeat with i from 1 to (count of documents)
      set d to document i
      set matchConfirmed to false
      try
        set p to (posix full name of d as text)
        if p is equal to "${escapedTarget}" then
          set matchConfirmed to true
        end if
      end try

      if matchConfirmed then
        save as d file name "${escapedPdf}" file format format PDF
        set targetFound to true
        exit repeat
      end if
    end repeat

    if targetFound then
      return "OK"
    else
      return "TARGET_NOT_FOUND"
    end if
  end tell
end timeout
`;

  let res = '';
  try {
    res = runAppleScript(atomicExportScript, (timeoutSeconds + 10) * 1000);
  } catch (err: any) {
    transitionLifecycleState(handle, 'uncertain', `Export script failed: ${err.message}`);
    throw new Error(`[WordAutomation] AppleScript error during PDF export: ${err.message}`);
  }

  const exportCreated = fs.existsSync(targetExportPath) && fs.statSync(targetExportPath).size > 0;
  if (res !== 'OK' || !exportCreated) {
    transitionLifecycleState(handle, 'uncertain', `Export failed with status "${res}", file created=${exportCreated}`);
    throw new Error(
      `[WordAutomation] Failed to export target document to PDF: result was "${res}".`
    );
  }

  if (useContainerStaging) {
    fs.mkdirSync(path.dirname(resolvedPdf), { recursive: true });
    fs.copyFileSync(targetExportPath, resolvedPdf);
    try {
      fs.rmSync(targetExportPath, { force: true });
    } catch {}
  }

  transitionLifecycleState(handle, 'exported', `PDF successfully exported (${fs.statSync(resolvedPdf).size} bytes)`);
  return { exportSuccess: true, pdfPath: resolvedPdf };
}
```

#### Extract 3.2.5: Document Close & Safe Cleanup (Lines 562–666, 695–710)
```typescript
// [safe_word_automation.ts: lines 562–666, 695–710]
export function closeTargetDocOnly(
  handle: AutomatedWordHandle,
  timeoutSeconds: number = 30
): { closeSuccess: boolean } {
  validateOwnershipHandle(handle);

  const escapedTarget = escapeAppleScript(handle.normalizedPosixPath);
  transitionLifecycleState(handle, 'close_requested', 'Requesting document close in Word saving no');

  const atomicCloseScript = `
with timeout of ${timeoutSeconds} seconds
  tell application "Microsoft Word"
    set targetFound to false
    repeat with i from 1 to (count of documents)
      set d to document i
      set matchConfirmed to false
      try
        set p to (posix full name of d as text)
        if p is equal to "${escapedTarget}" then
          set matchConfirmed to true
        end if
      end try

      if matchConfirmed then
        close d saving no
        set targetFound to true
        exit repeat
      end if
    end repeat

    if targetFound then
      return "OK"
    else
      return "TARGET_NOT_FOUND"
    end if
  end tell
end timeout
`;

  try {
    runAppleScript(atomicCloseScript, (timeoutSeconds + 5) * 1000);
  } catch (err: any) {
    transitionLifecycleState(handle, 'uncertain', `Close script error: ${err.message}`);
    throw new Error(`[WordAutomation] AppleScript error during document close: ${err.message}`);
  }

  // Confirm document is truly no longer listed in Word
  let stillOpen = false;
  try {
    const checkState = captureWordState();
    stillOpen = checkState.initialDocumentPaths.includes(handle.normalizedPosixPath);
  } catch {
    stillOpen = false;
  }

  if (stillOpen) {
    transitionLifecycleState(handle, 'uncertain', 'Document still reported open in Word after close command');
    throw new Error(
      `[WordAutomation] Document close requested but Word still reports document open. Preserving files at "${handle.isolatedDir}".`
    );
  }

  transitionLifecycleState(handle, 'close_confirmed', 'Confirmed closed in Word');
  return { closeSuccess: true };
}

export function safeCleanupIsolatedDirectory(handle: AutomatedWordHandle): boolean {
  validateOwnershipHandle(handle);

  if (handle.lifecycleState !== 'close_confirmed') {
    // Re-verify against Word before deleting
    try {
      const state = captureWordState();
      if (state.wordWasRunning && state.initialDocumentPaths.includes(handle.normalizedPosixPath)) {
        transitionLifecycleState(handle, 'uncertain', 'Refusing cleanup: document is still open in Word');
        return false;
      }
    } catch {
      transitionLifecycleState(handle, 'uncertain', 'Refusing cleanup: unable to query Word state');
      return false;
    }
  }

  try {
    execFileSync('sleep', ['0.15']);
  } catch {}

  if (handle.isolatedDir && fs.existsSync(handle.isolatedDir)) {
    try {
      fs.rmSync(handle.isolatedDir, { recursive: true, force: true });
      transitionLifecycleState(handle, 'cleanup_completed', 'Isolated directory deleted');
      return true;
    } catch (err: any) {
      transitionLifecycleState(handle, 'cleanup_pending', `Cleanup failed: ${err.message}`);
      return false;
    }
  }

  transitionLifecycleState(handle, 'cleanup_completed', 'Isolated directory already gone');
  return true;
}

export function cleanupTargetDocOnly(handle: unknown): void {
  if (!handle) return;

  try {
    validateOwnershipHandle(handle);
  } catch {
    // Unowned, invalid, or string handle: safely no-op to guarantee user documents are untouched
    return;
  }

  try {
    closeTargetDocOnly(handle, 10);
  } catch {}

  safeCleanupIsolatedDirectory(handle);
}
```

#### Extract 3.2.6: Residual Directory Cleaner (Lines 719–776)
```typescript
// [safe_word_automation.ts: lines 719–776]
export function cleanResidualIsolationDirsSafely(maxAgeMs: number = 30 * 60 * 1000): {
  scanned: number;
  pruned: number;
  preserved: number;
} {
  const baseDir = path.resolve(os.tmpdir(), 'f2w_word_isolation');
  if (!fs.existsSync(baseDir)) {
    return { scanned: 0, pruned: 0, preserved: 0 };
  }

  let wordOpenPaths: string[] = [];
  try {
    const state = captureWordState();
    if (state.wordWasRunning) {
      wordOpenPaths = state.initialDocumentPaths;
    }
  } catch {
    // Fail-closed: if we cannot query Word, do not prune any directory
    return { scanned: 0, pruned: 0, preserved: 0 };
  }

  const entries = fs.readdirSync(baseDir);
  let scanned = 0;
  let pruned = 0;
  let preserved = 0;
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.startsWith('vr_')) continue;
    scanned++;
    const fullDir = path.join(baseDir, entry);
    try {
      const stats = fs.statSync(fullDir);
      if (!stats.isDirectory()) continue;

      const age = now - stats.mtimeMs;
      if (age < maxAgeMs) {
        preserved++;
        continue;
      }

      // Check if any open document path in Word points to this directory
      const normDir = normalizeWordPath(fullDir);
      const isLockedByWord = wordOpenPaths.some((p) => p.startsWith(normDir));
      if (isLockedByWord) {
        preserved++;
        continue;
      }

      fs.rmSync(fullDir, { recursive: true, force: true });
      pruned++;
    } catch {
      preserved++;
    }
  }

  return { scanned, pruned, preserved };
}
```

---

## Section 4 — HWPX Renderer

**File**: `src/canvas/renderer/hwpxCanvasRenderer.ts`  
**Total Lines**: 1,216  
**Key Responsibilities**:
- Generates KS X 6101 compliant OWPML ZIP packages.
- Stores binary image media in `BinData/BIN0001.png` (or `.jpg`).
- Registers media entries in `META-INF/manifest.xml` and `Contents/content.hpf`.
- Serializes `<hp:pic>` with `<hc:img binaryItemIDRef="...">`, `<hp:lineShape>`, and `<hp:shadow type="DROP">`.
- Maps coordinates from Canvas IR points to HWPU ($1\text{ pt} = 100\text{ HWPU}$).

### 4.1 Call Graph & Component Relationships

```
renderToBuffer(doc) / renderToHwpxBuffer(doc)
 └─► buildZip(doc)
      ├─► mimetype (STORED, 19 bytes)
      ├─► BinData/
      │    └─► Iterates doc.resources: stores `BinData/${binId}.${ext}`
      ├─► META-INF/manifest.xml (buildManifestXml)
      ├─► Contents/content.hpf (buildContentHpf)
      │    └─► Emits <opf:item id="${binId}" href="BinData/${binId}.${ext}" media-type="${mimeType}"/>
      ├─► Contents/header.xml (buildHeaderXml)
      └─► Contents/section0.xml (buildSectionXml)
           └─► Loop over doc.pages
                └─► Loop over page.elements
                     ├─► Image branch (elem.type === "image"): lines 560–645
                     │    ├─ Converts points to HWPU: ptToHwpu(pt) = Math.round(pt * 100)
                     │    └─ Calls renderPicXml(p)
                     │         ├─ Emits <hp:pic id="${p.id}" zOrder="${p.zOrder}" ...>
                     │         ├─ Emits <hp:lineShape color="..." width="..." style="..."/>
                     │         ├─ Emits <hp:imgRect> (<hc:pt0>..<hc:pt3>)
                     │         ├─ Emits <hp:imgClip left="..." right="..." top="..." bottom="..."/>
                     │         ├─ Emits <hc:img binaryItemIDRef="${p.binId}" effect="REAL_PIC" .../>
                     │         ├─ Emits <hp:shadow type="DROP" color="..." offsetX="..." offsetY="..." alpha="..."/>
                     │         └─ Emits <hp:pos ... vertOffset="${p.y}" horzOffset="${p.x}"/>
                     └─► Text / Shape branch: lines 648–1150
```

### 4.2 Source Code Extracts with Exact Line Numbers

#### Extract 4.2.1: BinData & Package Manifest Registration (Lines 74–95, 245–275)
```typescript
// [hwpxCanvasRenderer.ts: lines 74–95]
    // 4. BinData/
    const imageBinMap = new Map<string, { binId: string; ext: string; mimeType: string }>();
    let binCounter = 1;

    for (const [resId, res] of Object.entries(doc.resources || {})) {
      const binId = `BIN${binCounter.toString().padStart(4, "0")}`;
      const isJpeg =
        res.mimeType === "image/jpeg" ||
        res.mimeType === "image/jpg" ||
        (res.data && res.data.length >= 3 && res.data[0] === 0xff && res.data[1] === 0xd8);
      const ext = isJpeg ? "jpg" : "png";
      const mimeType = isJpeg ? "image/jpeg" : "image/png";
      const binFileName = `${binId}.${ext}`;
      imageBinMap.set(resId, { binId, ext, mimeType });
      zip.file(`BinData/${binFileName}`, res.data);
      binCounter++;
    }

    // 5. META-INF/manifest.xml & Contents/content.hpf
    zip.file("META-INF/manifest.xml", this.buildManifestXml(imageBinMap));
    zip.file("Contents/content.hpf", this.buildContentHpf(doc, imageBinMap));

// [OMITTED: lines 96–244]

// [hwpxCanvasRenderer.ts: lines 245–275]
  private buildManifestXml(
    imageBinMap: Map<string, { binId: string; ext: string; mimeType: string }>
  ): string {
    let items = "";
    for (const [, { binId, ext, mimeType }] of imageBinMap) {
      items += `\n  <manifest:file-entry manifest:full-path="BinData/${binId}.${ext}" manifest:media-type="${mimeType}"/>`;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/hwp+zip"/>
  <manifest:file-entry manifest:full-path="Contents/content.hpf" manifest:media-type="application/hwpml-package+xml"/>
  <manifest:file-entry manifest:full-path="Contents/header.xml" manifest:media-type="application/xml"/>
  <manifest:file-entry manifest:full-path="Contents/section0.xml" manifest:media-type="application/xml"/>
  <manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="application/xml"/>
  <manifest:file-entry manifest:full-path="version.xml" manifest:media-type="application/xml"/>${items}
</manifest:manifest>`.trim();
  }
```

#### Extract 4.2.2: `<hp:pic>` Picture Serialization with Drop Shadow & LineShape (Lines 1154–1214)
```typescript
// [hwpxCanvasRenderer.ts: lines 1154–1214]
  /**
   * Helper: Serializes <hp:pic> with nested imgRect points, imgClip, inMargin, imgDim, and hc:img
   */
  private renderPicXml(p: {
    id: number;
    zOrder: number;
    x: number;
    y: number;
    w: number;
    h: number;
    binId: string;
    clipLeft: number;
    clipRight: number;
    clipTop: number;
    clipBottom: number;
    dimW: number;
    dimH: number;
    shadow?: CanvasShadow;
    strokeColorHex?: string;
    strokeWidth?: string;
    strokeStyle?: string;
  }): string {
    const safeStrokeColor = cleanHex(p.strokeColorHex, "000000");
    const safeStrokeWidth = /^\d+$/.test(String(p.strokeWidth).trim()) ? String(p.strokeWidth).trim() : "0";
    const safeStrokeStyle = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT"].includes(p.strokeStyle || "")
      ? p.strokeStyle!
      : "NONE";

    const shadowXml = p.shadow
      ? `<hp:shadow type="DROP" color="#${cleanHex(p.shadow.color || "000000")}" offsetX="${ptToHwpu(p.shadow.offsetX || 2)}" offsetY="${ptToHwpu(p.shadow.offsetY || 2)}" alpha="${Math.round((1 - (p.shadow.opacity ?? 0.2)) * 255)}"/>`
      : `<hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>`;

    return `<hp:pic id="${p.id}" zOrder="${p.zOrder}" numberingType="PICTURE" textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${p.id}" reverse="0">
  <hp:offset x="0" y="0"/>
  <hp:orgSz width="${p.w}" height="${p.h}"/>
  <hp:curSz width="${p.w}" height="${p.h}"/>
  <hp:flip horizontal="0" vertical="0"/>
  <hp:rotationInfo angle="0" centerX="${Math.round(p.w / 2)}" centerY="${Math.round(p.h / 2)}" rotateimage="1"/>
  <hp:renderingInfo>
    <hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
    <hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>
  </hp:renderingInfo>
  <hp:lineShape color="#${safeStrokeColor}" width="${safeStrokeWidth}" style="${safeStrokeStyle}" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="0" tailfill="0" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>
  <hp:imgRect>
    <hc:pt0 x="0" y="0"/>
    <hc:pt1 x="${p.w}" y="0"/>
    <hc:pt2 x="${p.w}" y="${p.h}"/>
    <hc:pt3 x="0" y="${p.h}"/>
  </hp:imgRect>
  <hp:imgClip left="${p.clipLeft}" right="${p.clipRight}" top="${p.clipTop}" bottom="${p.clipBottom}"/>
  <hp:inMargin left="0" right="0" top="0" bottom="0"/>
  <hp:imgDim dimwidth="${p.dimW}" dimheight="${p.dimH}"/>
  <hc:img binaryItemIDRef="${p.binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>
  <hp:effects/>
  ${shadowXml}
  <hp:sz width="${p.w}" height="${p.h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="1" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${p.y}" horzOffset="${p.x}"/>
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
</hp:pic>`;
  }
```

---

## Section 5 — Synthetic Fixture Definition

**File**: `scripts/generate_phase30_synthetic_fixture.ts`  
**Total Lines**: 307  
**Output Fixture**: `samples/phase30_comprehensive_synthetic_fixture.json` (17,624 bytes)

### 5.1 Image Asset Definition & Fixture Registration (Lines 4–8, 291–295)
```typescript
// [generate_phase30_synthetic_fixture.ts: lines 4–8]
// Valid 1x1 transparent PNG base64
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
// Valid 2x2 solid blue PNG base64
const BLUE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/AwMDEwMDAwAAAAAUAAXeN9fQAAAAASUVORK5CYII=';

// [OMITTED: lines 9–290]

// [generate_phase30_synthetic_fixture.ts: lines 291–295]
    imageMap: {
      "res-blue-grid": `data:image/png;base64,${BLUE_PNG_BASE64}`,
      "res-tiny-transparent": `data:image/png;base64,${TINY_PNG_BASE64}`,
    },
```

### 5.2 Image Card (`card-img-avatar`) & Overlay Text (`img-overlay-text`) Definition (Lines 166–210)
```typescript
// [generate_phase30_synthetic_fixture.ts: lines 166–210]
                // Metric Card 2: Rounded Image Card with Border & Shadow
                {
                  id: "card-img-avatar",
                  name: "Infra Cluster Snapshot",
                  type: "RECTANGLE",
                  absoluteBoundingBox: { x: 500, y: 120, width: 420, height: 180 },
                  cornerRadius: 12,
                  fills: [
                    {
                      type: "IMAGE",
                      imageRef: "res-blue-grid",
                      scaleMode: "FILL",
                    },
                  ],
                  strokes: [{ type: "SOLID", color: { r: 0.75, g: 0.85, b: 0.98, a: 1 } }],
                  strokeWeight: 2,
                  effects: [
                    {
                      type: "DROP_SHADOW",
                      visible: true,
                      color: { r: 0.1, g: 0.2, b: 0.4, a: 0.12 },
                      offset: { x: 0, y: 8 },
                      radius: 16,
                      spread: 0,
                    },
                  ],
                },
                // Text Overlay on top of image card
                {
                  id: "img-overlay-text",
                  name: "Cluster Region Badge",
                  type: "TEXT",
                  absoluteBoundingBox: { x: 520, y: 250, width: 280, height: 24 },
                  characters: "서울 리전 (ap-northeast-2) 이중화 완료",
                  style: {
                    fontFamily: "Pretendard",
                    fontWeight: 600,
                    fontSize: 12,
                    textAlignHorizontal: "LEFT",
                    lineHeightPx: 16,
                  },
                  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
                  textAutoResize: "WIDTH_AND_HEIGHT",
                },
```

---

## Section 6 — Actual DOCX XML Evidence

**Inspected Binary**: `debug/phase30-evidence/run/phase30_rendered.docx`  
**File Size**: 5,894 bytes  
**SHA-256 Digest**: `fddf2191973dcfe542de1617648be69d3321539795fc4b932266c20f26aceb94`  
**ZIP Package Entries**:
1. `[Content_Types].xml`
2. `_rels/.rels`
3. `docProps/core.xml`
4. `docProps/app.xml`
5. `word/styles.xml`
6. `word/settings.xml`
7. `word/media/image1.png`
8. `word/_rels/document.xml.rels`
9. `word/document.xml`

### 6.1 Package Relationship XML (`word/_rels/document.xml.rels`)
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>
```

### 6.2 Image Resource in Package
- **Relationship ID**: `rId2`
- **Target Path Inside ZIP**: `word/media/image1.png`
- **Data Payload**: 2x2 solid blue PNG bytes from `BLUE_PNG_BASE64`

### 6.3 Actual Raw XML: Central Image Card (Pict #9 in `word/document.xml`)
```xml
<w:pict>
    <v:roundrect id="s_0_7"
             alt="card-img-avatar"
             o:title="Infra Cluster Snapshot"
             style="position:absolute;left:0;top:0;margin-left:375.000pt;margin-top:90.000pt;width:315.000pt;height:135.000pt;z-index:8;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none"
             arcsize="0.133" filled="f"
             stroked="t"
             strokecolor="#BFD9FA"
             strokeweight="1.50pt"><v:shadow on="t" type="single" color="#1A3366" offset="0.00pt,6.00pt" opacity="0.12"/>
      <v:imagedata r:id="rId2" croptop="18725f" cropbottom="18725f" o:title="Infra Cluster Snapshot"/>
    </v:roundrect>
  </w:pict>
```

### 6.4 Actual Raw XML: Overlay Text Node (Pict #10 in `word/document.xml`)
```xml
<w:pict>
    <v:rect id="s_0_8"
            alt="img-overlay-text"
            o:title="Cluster Region Badge"
            style="position:absolute;left:0;top:0;margin-left:390.000pt;margin-top:187.500pt;width:216.300pt;height:18.000pt;z-index:9;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none"
            filled="f"
            
            stroked="f"
            
            >
      <v:textbox style="mso-fit-shape-to-text:t;mso-next-textbox:none;v-text-anchor:top" inset="0.00pt,0.00pt,0.00pt,0.00pt">
        <w:txbxContent>
          <w:p>
            <w:pPr>
              <w:wordWrap w:val="0"/>
              <w:jc w:val="left"/>
              <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/>
              <w:contextualSpacing w:val="0"/>
              <w:autoSpaceDE w:val="0"/>
              <w:autoSpaceDN w:val="0"/>
            </w:pPr>
            <w:r>
  <w:rPr>
    <w:rFonts w:ascii="Pretendard" w:hAnsi="Pretendard" w:eastAsia="Pretendard" w:cs="Pretendard"/>
    <w:sz w:val="18"/>
    <w:szCs w:val="18"/>
    <w:color w:val="FFFFFF"/>
    
    <w:b/>
    
    
    
  </w:rPr>
  <w:t xml:space="preserve">서울 리전 (ap-northeast-2) 이중화 완료</w:t>
</w:r>
          </w:p>
        </w:txbxContent>
      </v:textbox>
    </v:rect>
  </w:pict>
```

### 6.5 Relationship & Layer Ordering Summary
1. **Node Order in Document Stream**: Pict #9 (Image Card `s_0_7`) appears immediately prior to Pict #10 (Text Overlay `s_0_8`).
2. **Z-Index**:
   - `s_0_7` (Image Card): `z-index: 8`
   - `s_0_8` (Text Overlay): `z-index: 9`
3. **Geometry Placement**:
   - `s_0_7` bounds: Left `375.000pt`, Top `90.000pt`, Width `315.000pt`, Height `135.000pt` (Bottom is $225.000\text{ pt}$).
   - `s_0_8` bounds: Left `390.000pt`, Top `187.500pt`, Width `216.300pt`, Height `18.000pt`.
   - The text box sits entirely within the bounding rectangle of the image card ($390 > 375$, $187.5 > 90$, $187.5 + 18 < 225$).
4. **VML Attributes on Image Card**:
   - Element Tag: `<v:roundrect>`
   - Attributes: `arcsize="0.133"`, `filled="f"`, `stroked="t"`, `strokecolor="#BFD9FA"`, `strokeweight="1.50pt"`
   - Children: `<v:shadow .../>`, `<v:imagedata r:id="rId2" croptop="18725f" cropbottom="18725f" .../>`
5. **Text Properties on Overlay**:
   - Font Color: `<w:color w:val="FFFFFF"/>` (Pure white text).

---

## Section 7 — Audit Questions for External Verification

The following 6 questions are structured with direct pointers to the code and XML evidence presented above. External auditors can inspect these points without speculation:

### Question 1: 둥근 이미지 카드의 이미지 바인딩 방식이 Word for Mac에서 정상적으로 동작하는가?
- **Evidence Pointers**:
  - `docxCanvasRenderer.ts` lines 662–704:
    ```typescript
    if (imgRadius > 0) {
      imgTag = "v:roundrect";
      imgShapeExtraAttrs = `arcsize="${Math.min(0.5, (2 * imgRadius) / minImgDim).toFixed(3)}" `;
    }
    ...
    <${imgTag} ... ${imgShapeExtraAttrs}filled="f" ...>
      <v:imagedata r:id="${relId}"${cropAttr} .../>
    </${imgTag}>
    ```
  - `word/document.xml` Pict #9: `<v:roundrect ... arcsize="0.133" filled="f" ...><v:imagedata r:id="rId2" .../></v:roundrect>`.
  - Relationship target: `media/image1.png` present in ZIP.
- **Audit Verification Focus**:
  - Does Microsoft Word's VML engine require `filled="t"` or `<v:fill type="frame" ...>` for `<v:imagedata>` to render its pixel bitmap inside a `<v:roundrect>`, or does `filled="f"` cause Word to treat the shape interior as transparent and ignore `<v:imagedata>`?

### Question 2: 흰색 오버레이 텍스트가 보이지 않는 원인이 배경 소실인가, Z-order인가, 다른 문제인가?
- **Evidence Pointers**:
  - `word/document.xml` Pict #9 has `z-index: 8`, Pict #10 has `z-index: 9`.
  - Pict #10 text has `<w:color w:val="FFFFFF"/>` (White text).
  - Background of Page 1 (Pict #1) is `<v:rect fillcolor="#F5F7FA">` (Very light gray).
  - Pict #9 image card specifies `filled="f"`.
- **Audit Verification Focus**:
  - If Pict #9's image is not rendered (or rendered transparently due to `filled="f"`), the white text (`#FFFFFF`) sits directly over the light gray page background (`#F5F7FA`), making it appear visually missing.
  - Since `z-index: 9` is greater than `z-index: 8` and Pict #10 appears after Pict #9 in document order, is Z-order itself correctly configured?

### Question 3: VML 그림자·테두리·모서리 반경의 결합 방식에 결함이 있는가?
- **Evidence Pointers**:
  - `docxCanvasRenderer.ts` lines 676–704:
    `<v:roundrect ... arcsize="0.133" ...><v:shadow on="t" ... offset="0.00pt,6.00pt"/><v:imagedata .../></v:roundrect>`
  - Pict #9 XML: contains both `<v:shadow>` and `<v:imagedata>` as children of `<v:roundrect>`.
- **Audit Verification Focus**:
  - Does Word VML accurately cast the shadow from the rounded corner silhouette defined by `arcsize`, or does it cast from the rectangular bounding box? Does the stroke border clip the imagedata properly?

### Question 4: Word 자동화가 타임아웃 및 예외 상황에서 임시 파일을 조기 삭제할 수 있는가?
- **Evidence Pointers**:
  - `safe_word_automation.ts` lines 444–457:
    ```typescript
    if (!matchedDoc) {
      transitionLifecycleState(handle, 'uncertain', `Timeout after ${maxWaitSeconds}s waiting for Word confirmation`);
      throw new Error(`[WordAutomation] Timeout ... (Lifecycle state: uncertain; isolated directory preserved at "${isolatedDir}")`);
    }
    ```
  - `safeCleanupIsolatedDirectory` lines 635–647:
    Refuses cleanup and sets state to `uncertain` if `handle.lifecycleState !== 'close_confirmed'` and Word still reports the document path open.
- **Audit Verification Focus**:
  - Are there any error code paths (e.g., AppleScript execution exceptions in `runAppleScript`) where `isolatedDir` could be unlinked while Word is still holding a file lock?

### Question 5: 잔여 격리 디렉터리 정리 중 경쟁 상태가 발생할 수 있는가?
- **Evidence Pointers**:
  - `safe_word_automation.ts` lines 719–776 (`cleanResidualIsolationDirsSafely`):
    1. Captures `wordOpenPaths` via `captureWordState()`.
    2. Reads directory entries in `f2w_word_isolation`.
    3. Checks `age < maxAgeMs` (skips directories younger than 30 minutes).
    4. Checks `isLockedByWord = wordOpenPaths.some(p => p.startsWith(normDir))`.
- **Audit Verification Focus**:
  - If a concurrent process creates a directory that is older than `maxAgeMs` but is about to be opened by Word, can a race condition occur? What is the impact of the 30-minute threshold?

### Question 6: HWPX 이미지 및 그림자 XML의 구조와 참조 관계가 유효한가?
- **Evidence Pointers**:
  - `hwpxCanvasRenderer.ts` lines 1182–1213:
    `<hp:pic id="${p.id}" ...><hc:img binaryItemIDRef="${p.binId}" .../><hp:shadow type="DROP" .../></hp:pic>`
  - Manifest entry: `<manifest:file-entry manifest:full-path="BinData/BIN0001.png" .../>`
  - Unit scaling: `ptToHwpu` ($1\text{ pt} = 100\text{ HWPU}$).
- **Audit Verification Focus**:
  - Does the OWPML schema (KS X 6101) require `<hp:shadow>` to appear inside `<hp:shapeComment>` or directly as a child of `<hp:pic>`? Is `binaryItemIDRef="BIN0001"` correctly resolved by Hancom Office?
