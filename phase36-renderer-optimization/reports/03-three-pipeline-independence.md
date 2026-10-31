# Phase 36 Report 03: Three-Pipeline Independence Architecture

## Overview

To guarantee that measurements are authentic and not artificially synchronized or shared, Phase 36 implements three strictly isolated pipelines:

1. **Pipeline 1: Baseline (`13df75f`)**
2. **Pipeline 2: Current (`77fea13`)**
3. **Pipeline 3: Candidate (Phase 36 Optimized)**

Each pipeline operates from its own dedicated source tree, builds its own Canvas IR, writes its own DOCX buffer, invokes its own Microsoft Word conversion, rasterizes its own PNG pages, and evaluates its own pixel comparison metrics.

---

## Architecture Diagram

```
[Real Customer Figma JSON (186.52 MB)]
         |
         +------------------------------------+------------------------------------+
         |                                    |                                    |
         v                                    v                                    v
 [Baseline Parser (13df75f)]          [Current Parser (77fea13)]           [Candidate Parser (Phase 36)]
         |                                    |                                    |
         v                                    v                                    v
 [Baseline Canvas IR]                 [Current Canvas IR]                  [Candidate Canvas IR]
         |                                    |                                    |
         v                                    v                                    v
 [Baseline Renderer (13df75f)]        [Current Renderer (77fea13)]         [Candidate Renderer (Phase 36)]
         |                                    |                                    |
         v                                    v                                    v
 [baseline/actual.docx]               [current/actual.docx]                [candidate/actual.docx]
 (SHA: 38dd5dea07...)                 (SHA: ead96931b5...)                 (SHA: c5468ec280...)
         |                                    |                                    |
         v                                    v                                    v
 [Word Isolated COM -> PDF]           [Word Isolated COM -> PDF]           [Word Isolated COM -> PDF]
 (SHA: 28849cd2d3...)                 (SHA: 0e61726926...)                 (SHA: b8a83dbe5d...)
         |                                    |                                    |
         v                                    v                                    v
 [17 Baseline PNGs]                   [17 Current PNGs]                    [17 Candidate PNGs]
         |                                    |                                    |
         +------------------------------------+------------------------------------+
                                              |
                                              v
                              [16 Figma Reference PNG Images]
                                              |
                                              v
                           [Independent Benchmark Comparisons]
```

---

## Cryptographic Artifact Manifest

| Pipeline | Source Worktree | Renderer Path | DOCX SHA-256 | PDF SHA-256 | Average SSIM |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Baseline** | `debug/worktree-baseline` (`13df75f`) | `.../docxCanvasRenderer.ts` | `38dd5dea07ca7c2ebef89894843838a85acffd7f316e2154908430b66552b538` | `28849cd2d378cfed12ebab25fd72a6c0b074570183e6e1018624ad0d8005da32` | **0.8972** |
| **Current** | `debug/worktree-current` (`77fea13`) | `.../docxCanvasRenderer.ts` | `ead96931b51bb7797ab1f251205800c19bf9772a86f0abaef5953bc679408d5c` | `0e617269261d6ebc7c5acea42b939a6c9f9ce9b2f9e83ac9ce8066137d7f30d5` | **0.9186** |
| **Candidate** | Working Tree (`Phase 36`) | `src/canvas/renderer/docxCanvasRenderer.ts` | `c5468ec2806f9b2591045b49cbf53609e9a3d509f46b71c944ebd31ff3f4551b` | `b8a83dbe5d5ca55f446fca4d5a95bfe06c71290f6313160cf885daae61091bd1` | **0.9479** |

---

## Verifiable Non-Collusion Proof

1. **DOCX Buffers**: All three DOCX files have completely distinct SHA-256 hashes, differing in internal XML structures, styling attributes, and image crop parameters.
2. **Native PDF Documents**: Each PDF exported by Microsoft Word has a distinct SHA-256 hash.
3. **Rasterized PNGs**: Output images are written to independent directory trees (`baseline/pages`, `current/pages`, `candidate/pages`).
4. **Calculations**: All metrics and deltas are derived from direct pixel comparisons against `debug/cache/figma_references/PQADsFQSbkiVHFWeJQavEf/`.
