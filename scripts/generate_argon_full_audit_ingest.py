import os
import subprocess
import zipfile
import json
import xml.etree.ElementTree as ET
from datetime import datetime

ROOT_DIR = r"c:\Users\77\Documents\Figma2Word"
OUTPUT_FILES = [
    os.path.join(ROOT_DIR, "ARGON_FULL_AUDIT_INGEST.txt"),
    os.path.join(ROOT_DIR, "research", "rea-document-engine", "argon-independent-audit", "ARGON_FULL_AUDIT_INGEST.txt")
]

TARGET_SOURCE_FILES = [
    # 1. Project Config
    "package.json",
    "tsconfig.json",

    # 2. Core Renderers & Parser
    "src/canvas/renderer/hwpxCanvasRenderer.ts",
    "src/canvas/renderer/docxCanvasRenderer.ts",
    "src/canvas/parser/figmaCanvasParser.ts",
    "src/canvas/types.ts",
    "src/canvas/geometry/svgPathParser.ts",
    "src/canvas/pipeline/canvasPipeline.ts",

    # 3. Diagnostic & Inspection Scripts
    "scripts/inspect_geometry_details.ts",
    "scripts/detect_text_collision.ts",
    "scripts/compare_hwpx_ast.py",

    # 4. Critical Test Suites
    "tests/page-orientation-fidelity.test.ts",
    "tests/phase23-1-text-geometry.test.ts",
    "tests/hwpx-schema-conformance.test.ts",
    "tests/phase18-architecture-fidelity.test.ts",
    "tests/phase17-quality-integration.test.ts",
    "tests/phase16-1-remediation.test.ts",
    "tests/phase16-h2-remediation.test.ts",

    # 5. Independent Audit Reports
    "research/rea-document-engine/argon-independent-audit/01_PROJECT_ARCHITECTURE.md",
    "research/rea-document-engine/argon-independent-audit/02_USER_VERIFIED_TIMELINE.md",
    "research/rea-document-engine/argon-independent-audit/03_TEXT_GEOMETRY_EVIDENCE.md",
    "research/rea-document-engine/argon-independent-audit/04_DOCX_HWPX_RENDERER_COMPARISON.md",
    "research/rea-document-engine/argon-independent-audit/05_OWPML_REFERENCE_EVIDENCE.md",
    "research/rea-document-engine/argon-independent-audit/06_PREVIOUS_FIXES_AND_LIMITATIONS.md",
    "research/rea-document-engine/argon-independent-audit/07_OPEN_QUESTIONS.md",
    "research/rea-document-engine/argon-independent-audit/ARGON_INDEPENDENT_AUDIT_INGEST.md",

    # 6. Page Orientation Forensic Reports
    "research/rea-document-engine/page-orientation-root-cause/01_ROOT_CAUSE.md",
    "research/rea-document-engine/page-orientation-root-cause/02_PAGE_GEOMETRY_COMPARISON.md",
    "research/rea-document-engine/page-orientation-root-cause/03_FIX_AND_REGRESSION.md",
    "research/rea-document-engine/page-orientation-root-cause/04_VISUAL_VERIFICATION_HANDOFF.md",
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
        remote = subprocess.check_output(["git", "config", "--get", "remote.origin.url"], cwd=ROOT_DIR).decode().strip()
        return commit, branch, remote
    except Exception:
        return "HEAD", "master", "https://github.com/wldghs5s-max/Figma2Word.git"

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

def extract_hwpx_xml_section(hwpx_rel_path, target_keywords=None, max_elements=5):
    full_path = os.path.join(ROOT_DIR, hwpx_rel_path)
    if not os.path.exists(full_path):
        return f"[File not found: {hwpx_rel_path}]"
    try:
        results = []
        with zipfile.ZipFile(full_path, "r") as z:
            sec_xml = z.read("Contents/section0.xml").decode("utf-8", errors="replace")
            root = ET.fromstring(sec_xml)

            # Page properties
            page_prs = root.findall(".//{*}pagePr")
            for pp in page_prs:
                results.append(f"<!-- pagePr: landscape='{pp.get('landscape')}' width='{pp.get('width')}' height='{pp.get('height')}' -->")

            # Matched rects
            matched = 0
            for r in root.findall(".//{*}rect"):
                dt = r.find(".//{*}drawText")
                if dt is not None:
                    t_elems = dt.findall(".//{*}t")
                    text_str = "".join([t.text for t in t_elems if t.text])
                    if not target_keywords or any(k in text_str for k in target_keywords):
                        clean_xml = ET.tostring(r, encoding="utf-8").decode("utf-8", errors="replace")
                        results.append(f"<!-- Matched Text: '{text_str}' -->\n{clean_xml}")
                        matched += 1
                        if matched >= max_elements:
                            break
        return "\n\n".join(results)
    except Exception as e:
        return f"[Error extracting from {hwpx_rel_path}: {e}]"

def extract_docx_xml_section(docx_rel_path, target_keywords=None, max_elements=5):
    full_path = os.path.join(ROOT_DIR, docx_rel_path)
    if not os.path.exists(full_path):
        return f"[File not found: {docx_rel_path}]"
    try:
        results = []
        with zipfile.ZipFile(full_path, "r") as z:
            doc_xml = z.read("word/document.xml").decode("utf-8", errors="replace")
            root = ET.fromstring(doc_xml)

            # pgSz
            for pgsz in root.findall(".//{*}pgSz"):
                results.append(f"<!-- w:pgSz: orient='{pgsz.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}orient')}' w='{pgsz.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w')}' h='{pgsz.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}h')}' -->")

            matched = 0
            for shape in root.findall(".//*"):
                if shape.tag.endswith("rect") or shape.tag.endswith("shape"):
                    t_elems = shape.findall(".//{*}t")
                    text_str = "".join([t.text for t in t_elems if t.text])
                    if text_str and (not target_keywords or any(k in text_str for k in target_keywords)):
                        clean_xml = ET.tostring(shape, encoding="utf-8").decode("utf-8", errors="replace")
                        results.append(f"<!-- DOCX Shape Text: '{text_str}' -->\n{clean_xml}")
                        matched += 1
                        if matched >= max_elements:
                            break
        return "\n\n".join(results)
    except Exception as e:
        return f"[Error extracting from {docx_rel_path}: {e}]"

def generate_minimal_repro_json():
    mre = {
        "title": "Minimal Reproduction: Single-line Label Vertical Collision",
        "pageSize": {
            "name": "A4",
            "widthPt": 595.28,
            "heightPt": 841.89,
            "orientation": "portrait",
            "unit": "pt"
        },
        "marginsPt": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
        "pages": [{
            "pageNumber": 1,
            "bounds": { "x": 0, "y": 0, "width": 595.28, "height": 841.89 },
            "elements": [
                {
                    "id": "label_cdi",
                    "name": "균열밀도 (CDI)",
                    "type": "text",
                    "bounds": { "x": 52.48, "y": 457.30, "width": 53.98, "height": 9.75 },
                    "zIndex": 15,
                    "textRuns": [{
                        "text": "균열밀도 (CDI)",
                        "fontSizePt": 8.25,
                        "lineHeightPt": 11.13,
                        "fontFamily": "맑은 고딕"
                    }]
                },
                {
                    "id": "metric_val",
                    "name": "0.031%",
                    "type": "text",
                    "bounds": { "x": 52.48, "y": 473.06, "width": 55.48, "height": 17.99 },
                    "zIndex": 16,
                    "textRuns": [{
                        "text": "0.031%",
                        "fontSizePt": 14.99,
                        "lineHeightPt": 20.24,
                        "fontFamily": "맑은 고딕",
                        "bold": True
                    }]
                }
            ]
        }]
    }
    return json.dumps(mre, indent=2, ensure_ascii=False)

def main():
    commit, branch, remote = get_git_info()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    tree_lines = build_tree(ROOT_DIR)

    print("Generating comprehensive, uncut master ingest...")

    content_buffer = []

    def w(text=""):
        content_buffer.append(text + "\n")

    w("================================================================================")
    w("FIGMA2WORD — MASTER FORENSIC AUDIT INGEST DOSSIER (COMPLETE UNCUT VERSION)")
    w(f"Generated At: {now_str}")
    w(f"Target Repository: {remote}")
    w(f"Branch: {branch} | Head Commit: {commit}")
    w("Audit Target: HWPX Text Overlap & Cross-Format Rendering Divergence")
    w("Strict Policy: Code Freeze Enforced (0 production lines modified in this phase)")
    w("Ground Truth Standard: Hancom Office 2024 Viewer / Microsoft Word Real Renders")
    w("================================================================================\n")

    w("================================================================================")
    w("SECTION 0: AUDITOR'S EXECUTIVE BRIEFING & MANDATE")
    w("================================================================================")
    w("""
귀하는 Figma2Word 프로젝트의 HWPX 문서 렌더링 엔진 결함을 조사하는 독립 기술 감사관(Web Argon)입니다.

[핵심 당면 과제]
Figma2Word는 Figma 디자인을 중간 표준 규격인 Canonical JSON(Canvas IR)으로 파싱한 후,
이를 DOCX와 HWPX로 동시 변환하는 엔진입니다.
동일한 Canonical JSON을 입력했을 때:
  - Microsoft Word (DOCX): 글자 겹침이 전혀 없이 완벽하게 렌더링됨.
  - 한컴오피스 2024 뷰어 (HWPX): 글자가 두 줄로 쪼개지며 직하단 요소를 침범하여 대규모 글자 겹침(Overlap) 발생.

Phase 20부터 Phase 23.1, 그리고 최근의 페이지 방향 교정까지 여러 차례의 수정이 진행되었으나,
사용자가 실제 한컴 2024 뷰어로 확인한 결과 텍스트 겹침은 여전히 해결되지 않고 있습니다.
따라서 현재 모든 렌더러 소스 코드 수정은 전면 동결(Freeze)되었으며,
추측에 의한 주먹구구식 수정을 영구 중단하고 근본적/아키텍처적 진단을 내리기 위해
본 마스터 Ingest 파일이 작성되었습니다.

본 Ingest에는 다음이 모두 무삭제 원문(Uncut Full Source)으로 포함되어 있습니다:
  1. 실제 충돌이 발생하는 Stage 7의 기하학적 실측 수치와 수학적 증명
  2. 생성된 HWPX / DOCX / 정품 한컴 레퍼런스 HWPX의 실제 XML 추출문
  3. 최소 2-요소 재현 단위(MRE) Canonical JSON
  4. 7개 핵심 소스 코드 및 3개 진단 스크립트 전문
  5. 7개 핵심 회귀 테스트 스위트 전문
  6. 8개 독립 감사 보고서 및 4개 방향 원인 분석 보고서 전문
  7. 감사관(Argon)이 답해야 할 10대 핵심 질문
""")

    w("================================================================================")
    w("SECTION 1: MATHEMATICAL & GEOMETRICAL PROOF OF COLLISION (Stage 7)")
    w("================================================================================")
    w("""
[충돌 메커니즘의 수학적 증명: Case Study - Page 1 '균열밀도 (CDI)' vs '0.031%']

1. 상위 텍스트박스 (ID: '7:980', '균열밀도 (CDI)'):
   - Canonical IR 좌표: x = 52.48 pt, y = 457.30 pt, width = 53.98 pt, height = 9.75 pt
   - 텍스트 속성: 글꼴 8.25 pt, 행간 11.13 pt, 글자 수 10자 ('균열밀도 (CDI)')
   - 글자 물리적 단일행 필요 폭:
     한글 4자(균열밀도) = 4 * 8.25 = 33.0 pt
     공백 1자 = 4.1 pt
     영문/기호 5자((CDI)) = 5 * 0.55 * 8.25 = 22.7 pt
     총 단일행 필요 폭 = 약 59.8 pt
   - 기하학적 모순: 박스 폭(53.98 pt) < 단일행 필요 폭(59.8 pt) -> [5.82 pt 결핍!]

2. 하위 텍스트박스 (ID: '7:981', '0.031%'):
   - Canonical IR 좌표: x = 52.48 pt, y = 473.06 pt, width = 55.48 pt, height = 17.99 pt

3. 두 요소 사이의 물리적 여백 (Vertical Gap):
   - 상위 박스 바닥 = 457.30 + 9.75 = 467.06 pt
   - 하위 박스 상단 = 473.06 pt
   - 물리적 여백 = 473.06 - 467.06 = 6.00 pt (극도로 좁음!)

4. 한컴 2024 뷰어에서의 파국 (lineWrap="BREAK" 적용 시):
   - 한컴 엔진은 박스 폭 53.98 pt에 맞추기 위해 '균열밀도'와 '(CDI)'로 강제 2줄 줄바꿈을 단행함.
   - 2줄 렌더링에 필요한 높이 = 11.13 * 2 = 22.26 pt.
   - 그러나 OWPML <hp:rect>의 높이는 9.75 pt (975 HWPU)로 고정되어 있음.
   - 2번째 줄 '(CDI)' 텍스트는 y = 457.30 + 11.13 = 468.43 pt에서 시작하여 476.68 pt까지 그려짐.
   - 476.68 pt > 473.06 pt 이므로, 정확히 3.62 pt 구간에 걸쳐 '0.031%' 숫자 위로 '(CDI)' 글자가 중첩 인쇄됨!

5. DOCX는 왜 충돌하지 않는가?
   - docxCanvasRenderer.ts는 isMultiLineBox를 통해 단일행 라벨에 mso-wrap-style:none을 강제함!
   - Word는 박스 폭이 53.98 pt여도 글자를 2줄로 쪼개지 않고 1줄로 유지함!
   - 따라서 높이가 9.75 pt로 유지되어 하단 0.031%와의 6.0 pt 여백이 온전히 지켜짐!

6. 정품 한컴 문서는 어떻게 해결했는가?
   - 정품 reference 문서(report-1차-진단-편집가능-최종보정.hwpx)는 lineWrap="SQUEEZE"를 지정함!
   - 한글 엔진이 장평/자간을 미세하게 압축하여 반드시 1줄로 강제 유지함!
   - 따라서 높이가 늘어나지 않아 하단 요소와 절대 충돌하지 않음!
""")

    w("================================================================================")
    w("SECTION 2: MINIMAL REPRODUCIBLE EXAMPLE (MRE) CANONICAL JSON")
    w("================================================================================")
    w("아래 JSON은 전체 복잡한 문서를 배제하고, 오직 충돌을 유발하는 2개 요소만을 추출한 최소 재현 데이터입니다:\n")
    w(generate_minimal_repro_json())
    w("\n")

    w("================================================================================")
    w("SECTION 3: ACTUAL XML EXTRACTIONS (Ground Truth Comparison)")
    w("================================================================================")
    
    w("\n--- [3.1] HWPX GENERATED XML (stage7-portrait.hwpx -> Contents/section0.xml) ---")
    w(extract_hwpx_xml_section("debug/hwpx-page-orientation-fix/stage7-portrait.hwpx", ["균열밀도", "0.031%", "1,248"]))

    w("\n--- [3.2] DOCX GENERATED XML (stage7-portrait.docx -> word/document.xml) ---")
    w(extract_docx_xml_section("debug/hwpx-page-orientation-fix/stage7-portrait.docx", ["균열밀도", "0.031%", "1,248"]))

    w("\n--- [3.3] AUTHENTIC REFERENCE HWPX XML (report-1차-진단-편집가능-최종보정.hwpx) ---")
    w(extract_hwpx_xml_section("완성본-20261012/report-1차-진단-편집가능-최종보정.hwpx", ["균열밀도", "0.031%", "1,248"]))

    w("================================================================================")
    w("SECTION 4: REPOSITORY DIRECTORY TREE (Filtered)")
    w("================================================================================")
    w(".\n" + "\n".join(tree_lines) + "\n")

    w("================================================================================")
    w("SECTION 5: COMPLETE UNCUT SOURCE CODE & TEST SUITES & RESEARCH REPORTS")
    w("================================================================================")

    total_packed = 0
    for rel_path in TARGET_SOURCE_FILES:
        full_path = os.path.join(ROOT_DIR, rel_path)
        if not os.path.exists(full_path):
            print(f"[WARN] Target file not found: {rel_path}")
            continue

        w("\n" + "=" * 80)
        w(f"FILE: {rel_path}")
        w("=" * 80)
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            w(content)
            total_packed += 1
            print(f"[PACKED] {rel_path} ({len(content)} chars)")
        except Exception as e:
            w(f"[Error reading {rel_path}: {e}]")
            print(f"[ERROR] {rel_path}: {e}")

    w("\n================================================================================")
    w("END OF FIGMA2WORD MASTER AUDIT INGEST DOSSIER — READY FOR WEBARGON AUDIT")
    w("================================================================================")

    full_text = "".join(content_buffer)

    for out_path in OUTPUT_FILES:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(full_text)
        size_kb = os.path.getsize(out_path) / 1024.0
        line_cnt = full_text.count("\n")
        print(f"Generated: {out_path} ({size_kb:.1f} KB, {line_cnt} lines)")

if __name__ == "__main__":
    main()

