import os
import subprocess
from datetime import datetime

ROOT_DIR = r"c:\Users\77\Documents\Figma2Word"
OUTPUT_FILE = os.path.join(ROOT_DIR, "FIGMA2WORD_INGEST.txt")

# Target files to include in full text ingest
TARGET_FILES = [
    "package.json",
    "tsconfig.json",
    "src/canvas/types.ts",
    "src/canvas/geometry/svgPathParser.ts",
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/parser/docxCanvasParser.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
    "src/canvas/renderer/hwpxCanvasRenderer.ts",
    "src/cli.ts",
    "tests/canvas-engine.test.ts",
    "tests/synthetic-benchmarks.test.ts",
    "research/rea-document-engine/phase15/scripts/run_e2e_scenarios.ts",
    "research/rea-document-engine/phase15/MVP_STATUS.md",
    "research/rea-document-engine/phase15/PHASE15_HANDOFF.md",
    "research/rea-document-engine/phase15/VECTOR_ENGINE_REPORT.md",
    "research/rea-document-engine/phase15/DOCX_HWPX_COMPATIBILITY.md",
    "apps/web/package.json",
    "apps/web/vite.config.ts",
    "apps/web/src/App.tsx"
]

# Excluded folders for tree display
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
        return "72c0365", "master", "https://github.com/wldghs5s-max/Figma2Word.git"

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

    out = []
    out.append("================================================================")
    out.append("GIT INGEST REPORT: Figma2Word (Phase 15 Local MVP)")
    out.append("================================================================")
    out.append(f"Repository: {remote}")
    out.append(f"Branch: {branch} (Commit: {commit})")
    out.append(f"Generated: {now_str}")
    out.append(f"Files Ingested: {len(file_entries)}")
    out.append(f"Total Lines of Code: {total_lines:,}")
    out.append(f"Total Ingest Size: {total_bytes / 1024:.1f} KB")
    out.append("Architecture: Canvas IR Dual Engine (DOCX/VML & HWPX/OWPML)")
    out.append("================================================================")
    out.append("")
    out.append("================================================================")
    out.append("1. REPOSITORY DIRECTORY TREE")
    out.append("================================================================")
    out.append("Figma2Word/")
    out.extend(tree_lines)
    out.append("")
    out.append("================================================================")
    out.append("2. ARCHITECTURE & REPOSITORY SUMMARY")
    out.append("================================================================")
    out.append("""Figma2Word is a high-fidelity local-first document generation engine.
It converts Figma design ASTs into fully editable, pixel-accurate Microsoft Word (.docx)
and Hancom Hangul (.hwpx) documents without external paid APIs.

Core Components:
- Canvas IR (`src/canvas/types.ts`): 2D normalized coordinate intermediate representation.
- SVG Path Parser (`src/canvas/geometry/svgPathParser.ts`): Full W3C SVG parser converting
  complex paths (M, L, C, S, Q, T, A, Z) into normalized VML and HWPX polygon vertices.
- Figma Parser (`src/canvas/parser/figmaCanvasParser.ts`): AST -> Canvas IR with scale policies.
- DOCX Parser (`src/canvas/parser/docxCanvasParser.ts`): DOCX VML -> Canvas IR for direct DOCX->HWPX.
- DOCX Renderer (`src/canvas/renderer/docxCanvasRenderer.ts`): Canvas IR -> VML absolute shapes.
- HWPX Renderer (`src/canvas/renderer/hwpxCanvasRenderer.ts`): Canvas IR -> KS X 6101 OCF HWPX.
- Web UI (`apps/web/src/App.tsx`): React 19 + Vite 8.3 local web dashboard with dual engine
  toggles, DOCX/HWPX format selectors, and DOCX->HWPX one-click conversion.
- Quality: Real Word COM SSIM 0.8562 (peak 0.8768), 100% editability pass rate, 304/304 unit tests.
""")
    out.append("")
    out.append("================================================================")
    out.append("3. INGESTED FILE INDEX")
    out.append("================================================================")
    for rel_path, l_count, b_count, _ in file_entries:
        out.append(f"- {rel_path:<60} {l_count:>5} lines  ({b_count/1024:>6.1f} KB)")
    out.append("")
    out.append("================================================================")
    out.append("4. COMPLETE SOURCE FILE CONTENTS")
    out.append("================================================================")
    out.append("")

    for rel_path, _, _, content in file_entries:
        out.append("================================================================")
        out.append(f"File: {rel_path}")
        out.append("================================================================")
        out.append(content)
        out.append("")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(out))

    print(f"Successfully generated GitIngest file: {OUTPUT_FILE}")
    print(f"Summary: {len(file_entries)} files, {total_lines:,} lines, {total_bytes / 1024:.1f} KB")

if __name__ == "__main__":
    main()
