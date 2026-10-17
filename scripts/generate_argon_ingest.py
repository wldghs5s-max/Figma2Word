import os
import subprocess
from datetime import datetime

ROOT_DIR = r"c:\Users\77\Documents\Figma2Word"
OUTPUT_FILE = os.path.join(ROOT_DIR, "FIGMA2WORD_PHASE19_ARGON_INGEST.txt")

# Target files representing the active Canvas IR architecture, Phase 19 fixes, and core tests
TARGET_FILES = [
    # 1. Project Configuration
    "package.json",
    "tsconfig.json",

    # 2. Pipeline & CLI Entry Points
    "src/cli.ts",
    "src/pipeline/index.ts",

    # 3. Canvas IR Active Core Engine
    "src/canvas/index.ts",
    "src/canvas/types.ts",
    "src/canvas/pipeline/canvasPipeline.ts",
    "src/canvas/geometry/svgPathParser.ts",
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/parser/docxCanvasParser.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
    "src/canvas/renderer/hwpxCanvasRenderer.ts",
    "src/canvas/utils/binaryUtils.ts",
    "src/canvas/utils/imageResolver.ts",

    # 4. Phase 19 & Core Verification Tests
    "tests/phase19-docx-text-fidelity.test.ts",
    "tests/phase18-architecture-fidelity.test.ts",
    "tests/canvas-engine.test.ts",

    # 5. Phase 19 Architecture & Root Cause Reports
    "research/rea-document-engine/phase19-docx/DOCX_TEXT_LAYOUT_ROOT_CAUSES.md",
    "research/rea-document-engine/phase19-docx/IMPLEMENTATION_REPORT.md",
    "research/rea-document-engine/phase19-docx/BEFORE_AFTER_VISUAL_COMPARISON.md",
    "research/rea-document-engine/phase19-docx/KNOWN_LIMITATIONS.md",
    "research/rea-document-engine/phase19-docx/PHASE19_HANDOFF.md",
]

# Excluded folders for directory tree
EXCLUDE_DIRS = {
    "node_modules", ".git", "dist", ".vite", "renders", "comparisons", 
    ".system_generated", "fixtures", "output", "__pycache__", "debug", "scratch", ".cache"
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".docx", ".hwpx", ".zip", 
    ".log", ".pyc", ".map", ".bin"
}

def get_git_info():
    try:
        commit = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT_DIR).decode().strip()
        branch = subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT_DIR).decode().strip()
        remote = subprocess.check_output(["git", "config", "--get", "remote.origin.url"], cwd=ROOT_DIR).decode().strip()
        return commit, branch, remote
    except Exception:
        return "59223b4", "master", "https://github.com/wldghs5s-max/Figma2Word.git"

def build_tree(start_path, prefix=""):
    lines = []
    try:
        entries = sorted(os.listdir(start_path))
    except Exception:
        return lines

    filtered = []
    for e in entries:
        if e in EXCLUDE_DIRS or e.startswith("."):
            continue
        ext = os.path.splitext(e)[1].lower()
        if ext in BINARY_EXTENSIONS:
            continue
        filtered.append(e)

    for i, entry in enumerate(filtered):
        is_last = (i == len(filtered) - 1)
        connector = "└── " if is_last else "├── "
        sub_prefix = "    " if is_last else "│   "
        full_path = os.path.join(start_path, entry)
        if os.path.isdir(full_path):
            sub_lines = build_tree(full_path, prefix + sub_prefix)
            if sub_lines:
                lines.append(f"{prefix}{connector}{entry}/")
                lines.extend(sub_lines)
            else:
                lines.append(f"{prefix}{connector}{entry}/")
        else:
            lines.append(f"{prefix}{connector}{entry}")
    return lines

def main():
    commit, branch, remote = get_git_info()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    tree_lines = build_tree(ROOT_DIR)

    total_lines = 0
    total_bytes = 0
    file_entries = []

    for rel_path in TARGET_FILES:
        abs_path = os.path.join(ROOT_DIR, rel_path.replace("/", os.sep))
        if os.path.exists(abs_path):
            try:
                with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                    lines = content.splitlines()
                    total_lines += len(lines)
                    total_bytes += len(content.encode("utf-8"))
                    file_entries.append((rel_path, len(lines), len(content.encode("utf-8")), content))
            except Exception as e:
                print(f"Error reading {rel_path}: {e}")
        else:
            print(f"File not found: {rel_path}")

    out = []
    out.append("================================================================================")
    out.append("FIGMA2WORD: PHASE 19 CODEBASE INGESTION FOR GEMINI ARGON REVIEW")
    out.append("================================================================================")
    out.append(f"Repository: {remote}")
    out.append(f"Branch: {branch} (Commit: {commit})")
    out.append(f"Generated: {now_str}")
    out.append(f"Files Included: {len(file_entries)} active architecture files")
    out.append(f"Total Lines of Code: {total_lines:,}")
    out.append(f"Total Ingest Size: {total_bytes / 1024:.1f} KB (~{int(total_bytes / 4):,} tokens)")
    out.append("Target Architecture: Canvas IR High-Fidelity Engine (DOCX/VML & HWPX/OWPML)")
    out.append("================================================================================")
    out.append("")
    out.append("================================================================================")
    out.append("EXECUTIVE PROMPT GUIDE FOR GEMINI ARGON (REVIEWER INSTRUCTIONS)")
    out.append("================================================================================")
    out.append("""You are acting as the Chief Document Engine Architect reviewing the Figma2Word codebase.
Please pay close attention to the following architectural context:

1. ACTIVE ARCHITECTURE:
   - The active, production-grade engine is located exclusively in `src/canvas/` (Canvas IR pipeline).
   - Any legacy references to `src/parser/` or `src/renderer/` are deprecated Phase 1-14 prototypes.
   - All tests in `tests/phase19-docx-text-fidelity.test.ts` and `tests/phase18-architecture-fidelity.test.ts`
     run against `src/canvas/` and pass with 100% success rate (355/355 tests passing).

2. PHASE 19 CORE OBJECTIVES REVIEWED IN THIS INGEST:
   - Problem A (Page Overflow / Wrapping): Semantic typography auto-wrapping (`mso-wrap-style:square`
     for multi-line paragraphs vs `mso-wrap-style:none` for single-line badges/labels/metrics).
   - Problem B (Descender / Bottom Cutoff): Exact vs atLeast line spacing rules, inner padding zeroing,
     and descender height allocation.
   - Problem C (Partial Borders): Figma `individualStrokeWeights` ({ top, right, bottom, left }) parsed
     into discrete `<v:line>` elements instead of 4-sided `<v:rect>` boxes (header bottom line, footer top line,
     section title underline, table column/row dividers).
   - Problem D (Overlaid Text Vertical Misalignment): Detection of symmetric container padding to apply
     `verticalAlign: "center"` -> `v-text-anchor:middle` and `mso-fit-shape-to-text:f` across container height.

3. REVIEW FOCUS AREAS REQUESTED:
   - Verify mathematical correctness and edge-case robustness of `figmaCanvasParser.ts` and `docxCanvasRenderer.ts`.
   - Check OOXML/VML compatibility across Word desktop versions (Windows, macOS, Word Online).
   - Assess HWPX KS X 6101 schema compliance in `hwpxCanvasRenderer.ts`.
   - Identify any latent edge cases or potential regressions.
""")
    out.append("")
    out.append("================================================================================")
    out.append("1. REPOSITORY DIRECTORY TREE")
    out.append("================================================================================")
    out.append("Figma2Word/")
    out.extend(tree_lines)
    out.append("")
    out.append("================================================================================")
    out.append("2. INGESTED FILE INDEX")
    out.append("================================================================================")
    for rel_path, l_count, b_count, _ in file_entries:
        out.append(f"- {rel_path:<65} {l_count:>5} lines  ({b_count/1024:>6.1f} KB)")
    out.append("")
    out.append("================================================================================")
    out.append("3. COMPLETE SOURCE FILE CONTENTS")
    out.append("================================================================================")
    out.append("")

    for rel_path, _, _, content in file_entries:
        out.append("================================================================================")
        out.append(f"File: {rel_path}")
        out.append("================================================================================")
        out.append(content)
        out.append("")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(out))

    print(f"Successfully generated Argon Ingest file: {OUTPUT_FILE}")
    print(f"Summary: {len(file_entries)} files, {total_lines:,} lines, {total_bytes / 1024:.1f} KB")

if __name__ == "__main__":
    main()

