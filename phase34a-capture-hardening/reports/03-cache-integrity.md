# Report 03: Cache Integrity & Path Boundary Defense

## 1. Problem Statement
Previously, `getFigmaReference()` in `cacheManifest.ts` only checked whether an entry existed in `manifest.entries` with `sourceType === 'FIGMA_REFERENCE'`. It did not check:
1. Whether the referenced image file actually exists on the filesystem.
2. Whether the SHA-256 hash matches the recorded manifest hash.
3. Whether the file is an authentic PNG binary.
4. Whether the file path escapes the designated cache directory (directory traversal).

This resulted in false cache hits and potentially corrupted fidelity metrics.

---

## 2. Hardened Architecture: `getFigmaReferenceDetailed`
In Phase 34A, [`getFigmaReferenceDetailed`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/cache/cacheManifest.ts#L182) was implemented to provide deterministic, fail-closed verification:

```ts
export type CacheLookupStatus =
  | "VALID"
  | "MISSING"
  | "CORRUPT"
  | "INVALID_FORMAT"
  | "SOURCE_MISMATCH"
  | "PATH_TRAVERSAL";
```

### Verification Pipeline:
1. **Source Type Filter**: Rejects any entries whose `sourceType !== 'FIGMA_REFERENCE'`. WORD_RENDERED images are strictly ignored.
2. **Directory Traversal Guard**: Checks whether the resolved image path is strictly inside the authorized cache directory using `isPathInsideDirectory()`. Rejects symlinks pointing outside. Returns `PATH_TRAVERSAL` if out of bounds.
3. **Filesystem Existence**: Checks `fs.existsSync(absPath)`. If absent, returns `MISSING`.
4. **Cryptographic SHA-256 Verification**: Computes `computeFileSha256(absPath)`. If it differs from `entry.sha256Hash`, returns `CORRUPT`.
5. **PNG Binary Verification**: Validates the binary buffer with `validatePngBuffer()`. If invalid or truncated, returns `INVALID_FORMAT`.
6. **Pass Condition**: Returns `status: "VALID"` and attaches the verified `entry`.

[`getFigmaReference`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/cache/cacheManifest.ts#L250) was updated to return non-null ONLY when `status === "VALID"`.

---

## 3. Atomic Cache Persistence
During capture, images are written to a unique temporary file (`.tmp_{nodeId}_{timestamp}.png`) and then moved using `fs.renameSync` into place. If the process is interrupted or network drops, partial or corrupt files are cleaned up in the `finally` block, leaving the cache intact.

---

## 4. Verification Evidence
Unit tests in `tests/phase34a-capture-hardening.test.ts` (Tests 2.1 - 2.5) confirm:
- `MISSING`: non-existent file returns `MISSING` and null reference.
- `CORRUPT`: hash mismatch returns `CORRUPT` and null reference.
- `INVALID_FORMAT`: non-PNG binary returns `INVALID_FORMAT` and null reference.
- `PATH_TRAVERSAL`: path traversing `../../outside.png` returns `PATH_TRAVERSAL`.
- `VALID`: verified entry returns `VALID` and valid reference entry.
