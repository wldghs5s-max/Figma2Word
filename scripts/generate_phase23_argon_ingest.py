import os
import subprocess
import zipfile
from datetime import datetime

ROOT_DIR = r"c:\Users\77\Documents\Figma2Word"
OUTPUT_FILE = os.path.join(ROOT_DIR, "research", "rea-document-engine", "phase23-canonical-fidelity", "PHASE23_ARGON_REINGEST.txt")

TARGET_FILES = [
    # 1. Project Configuration
    "package.json",
    "tsconfig.json",

    # 2. Canvas IR Active Core Engine
    "src/canvas/index.ts",
    "src/canvas/types.ts",
    "src/canvas/pipeline/canvasPipeline.ts",
    "src/canvas/geometry/svgPathParser.ts",
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/parser/docxCanvasParser.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
    "src/canvas/renderer/hwpxCanvasRenderer.ts",

    # 3. Verification & Conformance Tests
    "tests/hwpx-schema-conformance.test.ts",
    "tests/phase16-1-remediation.test.ts",
    "tests/phase17-quality-integration.test.ts",
    "tests/canvas-engine.test.ts",
    "tests/phase19-docx-text-fidelity.test.ts",
    "tests/phase18-architecture-fidelity.test.ts",

    # 4. Phase 23 Reports
    "research/rea-document-engine/phase23-canonical-fidelity/01_EXECUTIVE_SUMMARY.md",
    "research/rea-document-engine/phase23-canonical-fidelity/02_REA_SECOND_TARGETED_STUDY.md",
    "research/rea-document-engine/phase23-canonical-fidelity/03_CANONICAL_SEMANTIC_AUDIT.md",
    "research/rea-document-engine/phase23-canonical-fidelity/04_TEXT_OVERLAP_FORENSIC_ANALYSIS.md",
    "research/rea-document-engine/phase23-canonical-fidelity/05_CROSS_FORMAT_FIDELITY_HARNESS.md",
    "research/rea-document-engine/phase23-canonical-fidelity/06_IMPLEMENTATION_AND_REMEDIATION.md",
    "research/rea-document-engine/phase23-canonical-fidelity/07_VERIFICATION_MATRIX.md",
    "research/rea-document-engine/phase23-canonical-fidelity/08_UNRESOLVED_LIMITATIONS.md",
    "research/rea-document-engine/phase23-canonical-fidelity/09_HANDOFF_AND_NEXT_STEPS.md",

    # 5. Verification & AST Comparator Scripts
    "scripts/generate_phase23_deliverables.ts",
    "scripts/run_cross_format_harness.ts",
    "scripts/compare_hwpx_ast.py",
]

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
        status = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT_DIR).decode().strip()
        dirty = " (dirty)" if status else ""
        return f"{commit} on {branch}{dirty}"
    except Exception as e:
        return f"Unknown ({e})"

def get_directory_tree():
    lines = []
    for root, dirs, files in os.walk(ROOT_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        rel_root = os.path.relpath(root, ROOT_DIR)
        if rel_root == ".":
            depth = 0
            lines.append("Figma2Word/")
        else:
            depth = rel_root.count(os.sep) + 1
            lines.append(f"{'  ' * depth}{os.path.basename(root)}/")
        
        for f in sorted(files):
            ext = os.path.splitext(f)[1].lower()
            if ext not in BINARY_EXTENSIONS and not f.endswith(".log"):
                lines.append(f"{'  ' * (depth + 1)}{f}")
    return "\n".join(lines)

def main():
    print(f"Generating Phase 23 Argon Ingest: {OUTPUT_FILE}")
    git_info = get_git_info()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    output_lines = []
    output_lines.append("=" * 80)
    output_lines.append(f"FIGMA2WORD — PHASE 23 CANONICAL FIDELITY REINGEST FOR ARGON AUDIT")
    output_lines.append(f"Generated at: {now_str}")
    output_lines.append(f"Git Reference: {git_info}")
    output_lines.append("=" * 80)
    output_lines.append("\n## PROJECT OVERVIEW")
    output_lines.append("Figma2Word is a production TypeScript compiler that converts Figma designs and Canvas IR")
    output_lines.append("into high-fidelity Microsoft Word (.docx) and Hancom Hangul (.hwpx) documents.")
    output_lines.append("Phase 23 focused on eliminating text overlap and visual border artifacts in Hancom Viewer.")
    output_lines.append("\n" + "=" * 80)
    output_lines.append("## DIRECTORY STRUCTURE")
    output_lines.append("=" * 80)
    output_lines.append(get_directory_tree())
    output_lines.append("\n" + "=" * 80)
    output_lines.append("## CORE ENGINE & VERIFICATION FILES")
    output_lines.append("=" * 80)

    for rel_path in TARGET_FILES:
        full_path = os.path.join(ROOT_DIR, rel_path)
        if not os.path.exists(full_path):
            output_lines.append(f"\n[FILE NOT FOUND: {rel_path}]\n")
            continue

        output_lines.append(f"\n{'=' * 80}")
        output_lines.append(f"FILE: {rel_path}")
        output_lines.append(f"{'=' * 80}\n")

        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
                output_lines.append(content)
        except Exception as e:
            output_lines.append(f"[Error reading file: {e}]")

    output_content = "\n".join(output_lines)
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(output_content)

    file_size_kb = len(output_content.encode("utf-8")) / 1024
    print(f"Successfully generated {OUTPUT_FILE} ({file_size_kb:.1f} KB)")

if __name__ == "__main__":
    main()
