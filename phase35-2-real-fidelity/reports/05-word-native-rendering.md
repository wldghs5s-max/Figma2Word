# Phase 35.2 Report 05: Microsoft Word Native COM Automation & 1:1 WinRT Rasterization

## Automation Architecture

- Script: `tools/visual-regression/windows_word_automation.ps1`
- Execution: Dedicated `Word.Application` COM instance per document
- Security: Strictly `ReadOnly = true`, zero modifications to user files
- Exit Safety: Always closes document and quits application in `try/finally`, zero `taskkill`

## PDF Export & Rasterization

| Document | Page Count | PDF SHA-256 | Rendered PNGs | Scale Factor |
| :--- | :---: | :--- | :---: | :---: |
| **Baseline DOCX** | 17 | `b1f9d4b1497ad91c06f9896a9d655b410b538f8b19090ac21718cf5d6e26732b` | 17 | 1.0 (96 DPI DIPs) |
| **Candidate DOCX** | 17 | `b9d1e606bb819ee1b13918c6bc86b13799d2dbd408721e6b4461106127ba75a6` | 17 | 1.0 (96 DPI DIPs) |

WinRT's native DIP resolution matches the 96 DPI pixel grid of Figma frames 1:1.
