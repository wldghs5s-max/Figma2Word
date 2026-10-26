# Report 07: Crash Recovery & Cache Consistency (GATE-06)

## 1. Context & Identified Vulnerability
In Phase 34A, `executeOneShotCapture` renamed downloaded PNG files to their final destinations (`frame_${safeNodeId}.png`) as each download finished, but only saved the `cache-manifest.json` file once at the very end after all batches completed:
```ts
if (capturedEntries.length > 0) {
  saveCacheManifest(manifest, manifestPath);
}
```
**Vulnerability:** If the process was terminated, crashed, or encountered an unhandled exception midway through (e.g. at frame 10 of 17):
- Frames 1 through 9 existed on disk at `frame_*.png`.
- `cache-manifest.json` on disk contained 0 entries for these frames.
- On the subsequent run, `planOneShotCapture` inspected the manifest, evaluated all frames as `MISSING`, and re-downloaded the identical images again, creating orphan files and wasting API quota.

## 2. Remediated Architecture (`src/cache/cacheManifest.ts` & `src/api/oneShotCapture.ts`)

### 1) Method A: Per-Frame Atomic Commit
For every single image downloaded:
1. Streamed to `.tmp_${safeNodeId}_${Date.now()}.png`.
2. Validated for PNG binary integrity (CRC-32, IDAT zlib inflate, W3C spec).
3. Computed SHA-256 hash.
4. Atomically renamed to `frame_${safeNodeId}.png`.
5. Registered in `manifest.entries[...]`.
6. **Immediately persisted to disk via `saveCacheManifest()`** (atomic write to `.tmp` followed by rename).
If the process crashes at frame 10, frames 1 through 9 are already 100% committed to disk and manifest.

### 2) Method B/C: Transaction Journaling & Orphan File Reconciliation
To protect against crashes occurring in the millisecond window between `fs.renameSync` and `saveCacheManifest`:
- A pending transaction journal `.journal_${safeNodeId}.json` is recorded before rename, containing `{ fileKey, nodeId, expectedSha256, fileSizeBytes, imagePath, status: "PENDING_COMMIT" }`.
- Once `saveCacheManifest()` completes, the journal file is unlinked.
- **On startup (`recoverPendingJournals`):** Scans the cache directory for any pending `.journal_*.json` files. If the corresponding disk PNG exists, matches the expected SHA-256 hash and file size, and passes full PNG validation, it is safely committed to the manifest.
- **Rogue Orphan Protection:** Files on disk without a corresponding transaction journal or manifest entry are **never** auto-promoted to `FIGMA_REFERENCE`.

### 3) Stale Temporary File Cleanup
On startup (`cleanupStaleTempFiles`), scans for leftover `.tmp_*.png` files from aborted download attempts and safely unlinks them.

### 4) Invariant: Zero Deletion of Legitimate Cache
Legitimate cache PNG files and existing manifest entries are never deleted or modified during cleanup or recovery.

## 3. Test Verification (`tests/phase34a1-release-gate.test.ts`)

| Test Case | Description | Result |
|---|---|---|
| `6.1` | Cleans up stale `.tmp_*.png` files while preserving valid cache images | **PASSED** (2 stale tmp files removed, legitimate `frame_1_1.png` preserved) |
| `6.2` | Recovers valid pending journal into manifest following a simulated crash | **PASSED** (Journal verified against disk hash, committed to manifest, journal unlinked) |
| `6.3` | Rejects unproven rogue orphan files without journal | **PASSED** (Manifest unchanged, rogue file not promoted) |
