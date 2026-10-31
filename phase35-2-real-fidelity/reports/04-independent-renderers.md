# Phase 35.2 Report 04: Independent Renderer Setup & Cryptographic Lineage

## Problem Addressed (Audit Defect B-01)

In Phase 35.1, the audit identified that Baseline and Improved DOCX files were generated using identical renderer code.
In Phase 35.2, Baseline was executed from a dedicated Git worktree representing commit `13df75f`, while Candidate was executed with Phase 35.2 optimizations.

## Cryptographic Lineage & Distinct Hashes

| Renderer Variant | Git Commit | Source SHA-256 | Output DOCX SHA-256 | File Size |
| :--- | :---: | :--- | :--- | :--- |
| **Baseline** | `13df75f` | `ad94099fb8bc8462a160370d977bdb62b8abba8acec1a1647da077b0948049db` | `ff55cef637ebfe0bb7d168175fbc5a4725fad269827586b6124fe89fb42d1c00` | 15.36 MB |
| **Candidate** | Phase 35.2 | `a959231e6195df5e4eca273d9ceb61a868cfd862b281cff77f373b774f8479c0` | `3ff09094e53c28ebe2db84be2e4a88f4982a3ead3c3e45913351fc92aea01ee6` | 15.36 MB |

Both renderers are physically distinct files on disk with differing cryptographic hashes, and produce distinct DOCX outputs.
