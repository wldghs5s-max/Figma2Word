import json
import os
import base64

# Simple 1x1 valid PNG base64 for image fixtures
SAMPLE_PNG_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

OUTPUT_DIR = r"c:\Users\77\Documents\Figma2Word\samples\synthetic-figma"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def make_solid_fill(r, g, b, a=1.0):
    return [{"type": "SOLID", "color": {"r": r, "g": g, "b": b}, "opacity": a}]

def make_text_node(node_id, name, text, x, y, w, h, font_size=11, font_weight=400, color=(0.1, 0.1, 0.1), align="LEFT"):
    return {
        "id": node_id,
        "name": name,
        "type": "TEXT",
        "characters": text,
        "absoluteBoundingBox": {"x": x, "y": y, "width": w, "height": h},
        "style": {
            "fontFamily": "맑은 고딕",
            "fontSize": font_size,
            "fontWeight": font_weight,
            "textAlignHorizontal": align
        },
        "fills": make_solid_fill(*color)
    }

def make_rect_node(node_id, name, x, y, w, h, fill_color=(0.95, 0.95, 0.97), border_color=(0.85, 0.85, 0.88), border_width=1, corner_radius=0):
    node = {
        "id": node_id,
        "name": name,
        "type": "RECTANGLE",
        "absoluteBoundingBox": {"x": x, "y": y, "width": w, "height": h},
        "fills": make_solid_fill(*fill_color) if fill_color else [],
        "strokes": make_solid_fill(*border_color) if border_color else [],
        "strokeWeight": border_width if border_color else 0,
    }
    if corner_radius > 0:
        node["cornerRadius"] = corner_radius
    return node

def make_oval_node(node_id, name, x, y, w, h, fill_color=(0.2, 0.4, 0.8)):
    return {
        "id": node_id,
        "name": name,
        "type": "ELLIPSE",
        "absoluteBoundingBox": {"x": x, "y": y, "width": w, "height": h},
        "fills": make_solid_fill(*fill_color)
    }

def make_vector_node(node_id, name, x, y, w, h, svg_path, fill_color=(0.2, 0.4, 0.8), stroke_color=None, stroke_width=0):
    node = {
        "id": node_id,
        "name": name,
        "type": "VECTOR",
        "absoluteBoundingBox": {"x": x, "y": y, "width": w, "height": h},
        "fillGeometry": [{"path": svg_path}],
        "fills": make_solid_fill(*fill_color) if fill_color else [],
        "strokes": make_solid_fill(*stroke_color) if stroke_color else [],
        "strokeWeight": stroke_width
    }
    return node

def make_image_node(node_id, name, x, y, w, h, img_ref):
    return {
        "id": node_id,
        "name": name,
        "type": "RECTANGLE",
        "absoluteBoundingBox": {"x": x, "y": y, "width": w, "height": h},
        "fills": [
            {
                "type": "IMAGE",
                "imageRef": img_ref,
                "scaleMode": "FILL"
            }
        ]
    }

# ==============================================================================
# Sample 1: Single Page Brief (Memo/Brief)
# ==============================================================================
def create_sample1_single_page_brief():
    frame = {
        "id": "frame-p1",
        "name": "Single Page Technical Brief",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            # Top Header Bar
            make_rect_node("box-top-accent", "Top Accent Bar", 40, 40, 515, 6, fill_color=(0.09, 0.38, 0.86), border_color=None),
            make_text_node("txt-title", "Title", "기술 협력 및 차세대 오피스 엔진 도입 검토안", 40, 60, 515, 36, font_size=20, font_weight=700, color=(0.07, 0.12, 0.22)),
            make_text_node("txt-meta", "Metadata", "작성일자: 2026년 10월 15일  |  담당부서: 디지털플랫폼 기술본부  |  보안등급: 대외비 (Class B)", 40, 102, 515, 18, font_size=9.5, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            # Executive Summary Box
            make_rect_node("box-summary", "Summary Card", 40, 135, 515, 95, fill_color=(0.96, 0.98, 1.0), border_color=(0.75, 0.85, 0.98), border_width=1, corner_radius=6),
            make_text_node("txt-sum-title", "Summary Header", "📌 핵심 검토 요약 (Executive Summary)", 56, 148, 483, 20, font_size=12, font_weight=700, color=(0.08, 0.3, 0.7)),
            make_text_node("txt-sum-body", "Summary Body", "본 검토서는 Figma 디자인 자산을 공공 및 엔터프라이즈 업무용 표준 포맷(DOCX 및 HWPX)으로 100% 무손실 변환하는 전용 Canvas 듀얼 엔진 구축의 타당성을 평가합니다. 기존 수작업 문서 작성 대비 소요 시간을 92% 단축하고, 공공 보고서 작성 호환성을 극대화합니다.", 56, 172, 483, 46, font_size=9.5, font_weight=400, color=(0.15, 0.2, 0.28)),
            
            # Section 1
            make_text_node("txt-sec1-title", "Section 1 Title", "1. 추진 배경 및 당면 과제", 40, 250, 515, 24, font_size=14, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("txt-sec1-p1", "Section 1 Paragraph 1", "최근 디지털 업무 환경 전환에 따라 기획 및 디자인 부서에서는 Figma를 기본 프로토타이핑 도구로 사용하는 반면, 결재 및 공문서 유통은 DOCX와 HWPX가 절대적인 비중을 차지하고 있습니다. 이에 따라 디자이너가 완성한 결과물을 문서 편집자가 재입력하는 과정에서 심각한 병목 현상이 발생하고 있습니다.", 40, 280, 515, 48, font_size=10, font_weight=400, color=(0.2, 0.25, 0.3)),
            
            # Bullet list cards
            make_rect_node("box-bullet1", "Bullet 1 Box", 40, 340, 515, 50, fill_color=(0.98, 0.98, 0.99), border_color=(0.88, 0.9, 0.93), border_width=1, corner_radius=4),
            make_text_node("txt-b1-title", "Bullet 1", "• 서식 왜곡 최소화: 2차원 캔버스 절대 좌표 기반 렌더링을 적용하여 문단 밀림 제거", 54, 355, 487, 20, font_size=9.5, font_weight=600, color=(0.15, 0.2, 0.3)),
            
            make_rect_node("box-bullet2", "Bullet 2 Box", 40, 400, 515, 50, fill_color=(0.98, 0.98, 0.99), border_color=(0.88, 0.9, 0.93), border_width=1, corner_radius=4),
            make_text_node("txt-b2-title", "Bullet 2", "• 한글/Word 듀얼 타깃: KS X 6101 HWPX와 ISO/IEC 29500 WordprocessingML 동시 지원", 54, 415, 487, 20, font_size=9.5, font_weight=600, color=(0.15, 0.2, 0.3)),
            
            # Section 2
            make_text_node("txt-sec2-title", "Section 2 Title", "2. 기대 효과 및 향후 일정", 40, 470, 515, 24, font_size=14, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("txt-sec2-p1", "Section 2 Paragraph", "엔진 도입 후 문서 변환 검증 시간은 건당 평균 45분에서 3초 이내로 단축되며, 시각적 유사도(SSIM) 0.87 이상의 품질을 상시 보장합니다. 2026년 4분기 파일럿 검증 후 전사 확대 적용 예정입니다.", 40, 500, 515, 40, font_size=10, font_weight=400, color=(0.2, 0.25, 0.3)),
            
            # Signoff box
            make_rect_node("box-signoff", "Signoff Card", 40, 680, 515, 90, fill_color=(0.97, 0.98, 0.99), border_color=(0.85, 0.88, 0.92), border_width=1, corner_radius=6),
            make_text_node("txt-sign-title", "Signoff Header", "결재 및 승인 확인 (Approval)", 56, 695, 200, 20, font_size=11, font_weight=700, color=(0.2, 0.25, 0.35)),
            make_text_node("txt-sign-left", "Signoff Left", "기안자: 김철수 수석연구원 (인)\n일자: 2026-10-15", 56, 725, 220, 36, font_size=9.5, font_weight=400, color=(0.3, 0.35, 0.4)),
            make_text_node("txt-sign-right", "Signoff Right", "승인자: 이영희 플랫폼본부장 (서명 완료)\n승인일시: 2026-10-15 17:30", 310, 725, 220, 36, font_size=9.5, font_weight=400, color=(0.3, 0.35, 0.4)),
        ]
    }
    return {
        "name": "Synthetic 01 - Single Page Brief",
        "lastModified": "2026-10-15T00:00:00Z",
        "document": {
            "id": "doc-syn-01",
            "name": "Document",
            "type": "DOCUMENT",
            "children": [frame]
        }
    }

# ==============================================================================
# Sample 2: Multi-Page Report (3 Pages: Cover, Executive, Detailed)
# ==============================================================================
def create_sample2_multi_page_report():
    # Page 1: Cover
    p1 = {
        "id": "frame-multi-p1",
        "name": "P1 - Cover Page",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            make_rect_node("p1-bg-accent", "Top Cover Art", 0, 0, 595, 320, fill_color=(0.06, 0.18, 0.38), border_color=None),
            make_text_node("p1-sub", "Cover Subtitle", "ENTERPRISE DOCUMENT AUTOMATION WHITE PAPER", 60, 160, 475, 24, font_size=11, font_weight=700, color=(0.6, 0.8, 1.0)),
            make_text_node("p1-title", "Cover Main Title", "2026 차세대 오피스\n문서 생성 엔진 아키텍처", 60, 190, 475, 80, font_size=28, font_weight=700, color=(1.0, 1.0, 1.0)),
            make_text_node("p1-desc", "Cover Description", "Figma 2차원 디자인에서 Microsoft Word 및 한컴 HWPX로 이어지는\n무손실 Canvas IR 듀얼 파이프라인 심층 기술 분석 보고서", 60, 380, 475, 50, font_size=12, font_weight=400, color=(0.3, 0.35, 0.45)),
            make_rect_node("p1-divider", "Divider", 60, 460, 475, 2, fill_color=(0.85, 0.88, 0.92), border_color=None),
            make_text_node("p1-meta", "Cover Metadata", "발행기관: Figma2Word R&D Center\n발행일자: 2026년 10월 15일\n연구책임: 시스템 아키텍처팀", 60, 700, 475, 60, font_size=10, font_weight=400, color=(0.4, 0.45, 0.55))
        ]
    }
    
    # Page 2: Summary & Metrics
    p2 = {
        "id": "frame-multi-p2",
        "name": "P2 - Executive Summary",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 850, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            make_text_node("p2-header", "P2 Header", "Executive Summary", 50, 890, 495, 28, font_size=18, font_weight=700, color=(0.08, 0.15, 0.3)),
            make_text_node("p2-p1", "P2 Intro", "본 장에서는 신규 Canvas IR 아키텍처 도입을 통해 달성한 핵심 기술 성과 및 정량적 벤치마크 결과를 제시합니다. 기존 플로우 기반 변환기의 한계를 완전히 극복하였습니다.", 50, 930, 495, 40, font_size=10, font_weight=400, color=(0.25, 0.3, 0.35)),
            
            # 3 KPI Cards
            make_rect_node("p2-card1", "Card 1", 50, 990, 155, 100, fill_color=(0.95, 0.98, 1.0), border_color=(0.7, 0.82, 0.98), border_width=1, corner_radius=6),
            make_text_node("p2-c1-t", "Card 1 Label", "시각적 유사도 (SSIM)", 60, 1005, 135, 16, font_size=9, font_weight=600, color=(0.1, 0.35, 0.75)),
            make_text_node("p2-c1-v", "Card 1 Value", "0.87+", 60, 1025, 135, 32, font_size=22, font_weight=700, color=(0.08, 0.3, 0.7)),
            make_text_node("p2-c1-s", "Card 1 Sub", "기존 대비 +48% 향상", 60, 1060, 135, 16, font_size=8.5, font_weight=400, color=(0.3, 0.45, 0.65)),
            
            make_rect_node("p2-card2", "Card 2", 220, 990, 155, 100, fill_color=(0.95, 0.99, 0.95), border_color=(0.7, 0.9, 0.75), border_width=1, corner_radius=6),
            make_text_node("p2-c2-t", "Card 2 Label", "변환 지연 시간 (Latency)", 230, 1005, 135, 16, font_size=9, font_weight=600, color=(0.1, 0.6, 0.25)),
            make_text_node("p2-c2-v", "Card 2 Value", "115ms", 230, 1025, 135, 32, font_size=22, font_weight=700, color=(0.08, 0.5, 0.2)),
            make_text_node("p2-c2-s", "Card 2 Sub", "페이지당 평균 소요 시간", 230, 1060, 135, 16, font_size=8.5, font_weight=400, color=(0.25, 0.55, 0.3)),
            
            make_rect_node("p2-card3", "Card 3", 390, 990, 155, 100, fill_color=(0.99, 0.97, 1.0), border_color=(0.85, 0.75, 0.98), border_width=1, corner_radius=6),
            make_text_node("p2-c3-t", "Card 3 Label", "오피스 상호운용성", 400, 1005, 135, 16, font_size=9, font_weight=600, color=(0.5, 0.2, 0.8)),
            make_text_node("p2-c3-v", "Card 3 Value", "100%", 400, 1025, 135, 32, font_size=22, font_weight=700, color=(0.4, 0.15, 0.7)),
            make_text_node("p2-c3-s", "Card 3 Sub", "Word / 한글 무결성 검증", 400, 1060, 135, 16, font_size=8.5, font_weight=400, color=(0.45, 0.3, 0.6)),
            
            # Deep dive text
            make_text_node("p2-deep-title", "Deep Title", "정밀 좌표계 기반의 렌더링 혁신", 50, 1120, 495, 24, font_size=13, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("p2-deep-p", "Deep Para", "Figma2Word Canvas 엔진은 기존 DOM 플로우 재구성 방식이 가지던 고질적 문제인 줄바꿈 오차와 레이아웃 깨짐을 근본적으로 제거하기 위해, VML 절대 좌표 셰이프와 OWPML 절대 위치 객체를 직접 생성합니다. 이를 통해 디자이너가 의도한 위치 그대로 오피스 문서에 배치됩니다.", 50, 1150, 495, 60, font_size=10, font_weight=400, color=(0.2, 0.25, 0.35))
        ]
    }
    
    # Page 3: Action Plan
    p3 = {
        "id": "frame-multi-p3",
        "name": "P3 - Implementation Roadmap",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 1700, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            make_text_node("p3-header", "P3 Header", "Implementation Roadmap & Milestones", 50, 1740, 495, 28, font_size=18, font_weight=700, color=(0.08, 0.15, 0.3)),
            make_text_node("p3-p1", "P3 Intro", "단계별 마일스톤 및 주요 개발 산출물 일정은 다음과 같습니다.", 50, 1780, 495, 20, font_size=10, font_weight=400, color=(0.25, 0.3, 0.35)),
            
            # Table-like Roadmap cards
            make_rect_node("p3-step1-bg", "Step 1 Card", 50, 1815, 495, 55, fill_color=(0.98, 0.98, 0.99), border_color=(0.88, 0.9, 0.93), border_width=1, corner_radius=4),
            make_text_node("p3-s1-num", "Step 1 Num", "PHASE 1", 65, 1832, 70, 20, font_size=11, font_weight=700, color=(0.09, 0.38, 0.86)),
            make_text_node("p3-s1-text", "Step 1 Text", "Figma AST 파서 고도화 및 네이티브 벡터 (SVG Path) 변환 엔진 완비", 145, 1832, 385, 20, font_size=10, font_weight=600, color=(0.15, 0.2, 0.25)),
            
            make_rect_node("p3-step2-bg", "Step 2 Card", 50, 1885, 495, 55, fill_color=(0.98, 0.98, 0.99), border_color=(0.88, 0.9, 0.93), border_width=1, corner_radius=4),
            make_text_node("p3-s2-num", "Step 2 Num", "PHASE 2", 65, 1902, 70, 20, font_size=11, font_weight=700, color=(0.09, 0.38, 0.86)),
            make_text_node("p3-s2-text", "Step 2 Text", "DOCX/HWPX 듀얼 렌더러 안정화 및 KS X 6101 패키징 완전 검증", 145, 1902, 385, 20, font_size=10, font_weight=600, color=(0.15, 0.2, 0.25)),
            
            make_rect_node("p3-step3-bg", "Step 3 Card", 50, 1955, 495, 55, fill_color=(0.98, 0.98, 0.99), border_color=(0.88, 0.9, 0.93), border_width=1, corner_radius=4),
            make_text_node("p3-s3-num", "Step 3 Num", "PHASE 3", 65, 1972, 70, 20, font_size=11, font_weight=700, color=(0.09, 0.38, 0.86)),
            make_text_node("p3-s3-text", "Step 3 Text", "로컬 Web UI 및 DOCX to HWPX 원클릭 변환기 통합 배포", 145, 1972, 385, 20, font_size=10, font_weight=600, color=(0.15, 0.2, 0.25)),
            
            make_text_node("p3-foot", "P3 Footer", "© 2026 Figma2Word Project. All rights reserved.", 50, 2500, 495, 20, font_size=9, font_weight=400, color=(0.5, 0.55, 0.6), align="CENTER")
        ]
    }
    
    return {
        "name": "Synthetic 02 - Multi-Page Report",
        "lastModified": "2026-10-15T00:00:00Z",
        "document": {
            "id": "doc-syn-02",
            "name": "Document",
            "type": "DOCUMENT",
            "children": [p1, p2, p3]
        }
    }

# ==============================================================================
# Sample 3: Image-Centric Portfolio (Multi-aspect ratios)
# ==============================================================================
def create_sample3_image_centric_portfolio():
    frame = {
        "id": "frame-img-p1",
        "name": "Image-Centric Design Portfolio",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            make_text_node("txt-img-title", "Title", "2026 디자인 시스템 갤러리 및 비주얼 쇼케이스", 40, 40, 515, 32, font_size=18, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("txt-img-sub", "Subtitle", "다양한 화면 비율과 이미지 배치를 검증하는 포트폴리오 레이아웃", 40, 75, 515, 20, font_size=10, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            # Hero Image (16:9 ratio, width 515, height 180)
            make_image_node("img-hero", "Hero Banner (16:9)", 40, 110, 515, 180, "img_hero"),
            make_text_node("txt-hero-cap", "Hero Caption", "▲ 대표 배너 이미지 (16:9 비율) - 와이드 뷰포트 배색 및 그라데이션 검증", 40, 296, 515, 16, font_size=9, font_weight=400, color=(0.45, 0.5, 0.55)),
            
            # Row 1: Two cards (4:3 ratio: 245 x 160)
            make_image_node("img-card1", "Card Image 1 (4:3)", 40, 330, 245, 160, "img_card1"),
            make_text_node("txt-card1-t", "Card 1 Title", "제품 인터페이스 디자인 #1", 40, 496, 245, 18, font_size=11, font_weight=700, color=(0.15, 0.2, 0.3)),
            make_text_node("txt-card1-d", "Card 1 Desc", "모바일 대시보드 화면 및 그리드 정렬", 40, 516, 245, 16, font_size=9, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            make_image_node("img-card2", "Card Image 2 (4:3)", 310, 330, 245, 160, "img_card2"),
            make_text_node("txt-card2-t", "Card 2 Title", "데이터 시각화 컴포넌트 #2", 310, 496, 245, 18, font_size=11, font_weight=700, color=(0.15, 0.2, 0.3)),
            make_text_node("txt-card2-d", "Card 2 Desc", "인터랙티브 차트 및 원형 게이지", 310, 516, 245, 16, font_size=9, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            # Row 2: 3 square images (1:1 ratio: 155 x 155)
            make_image_node("img-sq1", "Square 1", 40, 560, 155, 155, "img_sq1"),
            make_text_node("txt-sq1-c", "Sq1 Caption", "아이콘 세트 A (1:1)", 40, 720, 155, 16, font_size=9, font_weight=600, color=(0.2, 0.25, 0.35), align="CENTER"),
            
            make_image_node("img-sq2", "Square 2", 220, 560, 155, 155, "img_sq2"),
            make_text_node("txt-sq2-c", "Sq2 Caption", "디자인 토큰 B (1:1)", 220, 720, 155, 16, font_size=9, font_weight=600, color=(0.2, 0.25, 0.35), align="CENTER"),
            
            make_image_node("img-sq3", "Square 3", 400, 560, 155, 155, "img_sq3"),
            make_text_node("txt-sq3-c", "Sq3 Caption", "컬러 팔레트 C (1:1)", 400, 720, 155, 16, font_size=9, font_weight=600, color=(0.2, 0.25, 0.35), align="CENTER"),
        ]
    }
    return {
        "name": "Synthetic 03 - Image-Centric Portfolio",
        "lastModified": "2026-10-15T00:00:00Z",
        "images": {
            "img_hero": SAMPLE_PNG_BASE64,
            "img_card1": SAMPLE_PNG_BASE64,
            "img_card2": SAMPLE_PNG_BASE64,
            "img_sq1": SAMPLE_PNG_BASE64,
            "img_sq2": SAMPLE_PNG_BASE64,
            "img_sq3": SAMPLE_PNG_BASE64
        },
        "document": {
            "id": "doc-syn-03",
            "name": "Document",
            "type": "DOCUMENT",
            "children": [frame]
        }
    }

# ==============================================================================
# Sample 4: Text-Centric Article (Long-form typography, multi-level headings)
# ==============================================================================
def create_sample4_text_centric_article():
    frame = {
        "id": "frame-art-p1",
        "name": "Text-Centric Technical Article",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            make_text_node("art-h1", "H1 Title", "문서 바이너리 역공학과 오피스 상호운용성", 50, 45, 495, 36, font_size=22, font_weight=700, color=(0.08, 0.12, 0.22)),
            make_text_node("art-meta", "Article Metadata", "작성자: 수석 아키텍트  |  게시일: 2026-10-15  |  카테고리: Binary Reverse Engineering", 50, 85, 495, 18, font_size=9.5, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            # Section 1
            make_text_node("art-h2-1", "H2 Section 1", "1. OpenXML과 KS X 6101의 포맷 특성 비교", 50, 125, 495, 24, font_size=14, font_weight=700, color=(0.12, 0.25, 0.55)),
            make_text_node("art-p1", "Para 1", "Microsoft Word의 OpenXML(DOCX)은 OPC(Open Packaging Conventions) 규격을 기반으로 하며, 본문 레이아웃은 주로 문단과 인라인 텍스트 플로우로 정의됩니다. 반면 절대 위치 배치가 요구되는 디자인 변환에서는 VML 및 DrawingML 절대 좌표 셰이프를 활용하는 것이 안정적입니다.", 50, 155, 495, 48, font_size=10, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("art-p2", "Para 2", "한글과컴퓨터의 HWPX는 OCF(Open Container Format) 규격을 따르며, KS X 6101 표준에 정의된 OWPML 엘리먼트를 사용합니다. 특히 hp:shape 개체의 vertRel 및 horzRel 속성을 'page'로 지정하여 2차원 평면 위의 정확한 HWPU 좌표계에 문자를 렌더링합니다.", 50, 210, 495, 48, font_size=10, font_weight=400, color=(0.2, 0.25, 0.3)),
            
            # Callout blockquote box
            make_rect_node("art-quote-bg", "Quote Card", 50, 275, 495, 75, fill_color=(0.96, 0.97, 0.99), border_color=(0.85, 0.88, 0.92), border_width=1, corner_radius=4),
            make_rect_node("art-quote-bar", "Quote Left Bar", 50, 275, 5, 75, fill_color=(0.1, 0.4, 0.9), border_color=None),
            make_text_node("art-quote-t", "Quote Text", "💡 핵심 원칙: '문서의 편집 가능성은 텍스트박스 내부의 텍스트 런(TextRun) 보존에 달려 있으며, 시각적 충실도는 부모 컨테이너의 절대 좌표 불변성에 비례한다.'", 68, 290, 460, 45, font_size=10, font_weight=600, color=(0.15, 0.25, 0.4)),
            
            # Section 2
            make_text_node("art-h2-2", "H2 Section 2", "2. 무손실 Canvas IR 파이프라인의 설계", 50, 375, 495, 24, font_size=14, font_weight=700, color=(0.12, 0.25, 0.55)),
            make_text_node("art-p3", "Para 3", "Figma2Word Canvas IR은 원본 피그마 트리를 1차원 흐름(Flow)으로 무리하게 억압하지 않고, 페이지 단위의 2차원 평면으로 파싱합니다. 주요 처리 단계는 다음과 같습니다.", 50, 405, 495, 32, font_size=10, font_weight=400, color=(0.2, 0.25, 0.3)),
            
            # List items
            make_text_node("art-li-1", "List 1", "① 좌표 정규화: Figma 96 DPI 픽셀 단위를 표준 DTP 포인트(pt) 및 HWPU 단위로 정밀 환산", 65, 445, 480, 20, font_size=9.5, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("art-li-2", "List 2", "② 폰트 매핑: Pretendard, Malgun Gothic 등 주요 한글 서체의 EastAsia 태그 정밀 바인딩", 65, 470, 480, 20, font_size=9.5, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("art-li-3", "List 3", "③ 셰이프 변환: 사각형, 타원, 복합 SVG 경로를 네이티브 VML 및 OWPML 다각형으로 변환", 65, 495, 480, 20, font_size=9.5, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("art-li-4", "List 4", "④ 검증 자동화: Word COM 객체 조작 및 XML 검증을 통한 실시간 편집성 검증", 65, 520, 480, 20, font_size=9.5, font_weight=400, color=(0.2, 0.25, 0.3)),
            
            # Section 3
            make_text_node("art-h2-3", "H2 Section 3", "3. 결론 및 향후 전망", 50, 560, 495, 24, font_size=14, font_weight=700, color=(0.12, 0.25, 0.55)),
            make_text_node("art-p4", "Para 4", "Canvas IR 듀얼 엔진은 피그마의 유려한 디자인을 표준 오피스 문서로 완벽히 재현함으로써 엔터프라이즈 업무 생산성을 비약적으로 향상시킵니다. 향후 다양한 문서 서식 템플릿과의 연계를 통해 생태계를 확장할 계획입니다.", 50, 590, 495, 48, font_size=10, font_weight=400, color=(0.2, 0.25, 0.3)),
        ]
    }
    return {
        "name": "Synthetic 04 - Text-Centric Article",
        "lastModified": "2026-10-15T00:00:00Z",
        "document": {
            "id": "doc-syn-04",
            "name": "Document",
            "type": "DOCUMENT",
            "children": [frame]
        }
    }

# ==============================================================================
# Sample 5: Vector-Centric Infographic (Native Shapes & SVG Paths)
# ==============================================================================
def create_sample5_vector_centric_infographic():
    frame = {
        "id": "frame-vec-p1",
        "name": "Vector-Centric Infographic",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            make_text_node("vec-title", "Title", "네이티브 벡터 셰이프 & 인포그래픽 쇼케이스", 40, 40, 515, 32, font_size=18, font_weight=700, color=(0.08, 0.15, 0.3)),
            make_text_node("vec-sub", "Subtitle", "SVG Path 파서, VML 셰이프, HWPX 폴리곤 변환 검증", 40, 75, 515, 20, font_size=10, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            # Oval / Circle Badges
            make_oval_node("vec-oval-1", "Circle Badge 1", 50, 120, 50, 50, fill_color=(0.1, 0.4, 0.9)),
            make_text_node("vec-o1-t", "O1 Text", "01", 50, 133, 50, 24, font_size=14, font_weight=700, color=(1.0, 1.0, 1.0), align="CENTER"),
            make_text_node("vec-o1-desc", "O1 Desc", "입력 데이터 분석 단계\n(Figma AST & Resource Mapping)", 115, 128, 420, 36, font_size=10, font_weight=600, color=(0.15, 0.2, 0.3)),
            
            make_oval_node("vec-oval-2", "Circle Badge 2", 50, 190, 50, 50, fill_color=(0.1, 0.65, 0.35)),
            make_text_node("vec-o2-t", "O2 Text", "02", 50, 203, 50, 24, font_size=14, font_weight=700, color=(1.0, 1.0, 1.0), align="CENTER"),
            make_text_node("vec-o2-desc", "O2 Desc", "Canvas IR 정규화 단계\n(2D Coordinate Normalization)", 115, 198, 420, 36, font_size=10, font_weight=600, color=(0.15, 0.2, 0.3)),
            
            make_oval_node("vec-oval-3", "Circle Badge 3", 50, 260, 50, 50, fill_color=(0.9, 0.5, 0.1)),
            make_text_node("vec-o3-t", "O3 Text", "03", 50, 273, 50, 24, font_size=14, font_weight=700, color=(1.0, 1.0, 1.0), align="CENTER"),
            make_text_node("vec-o3-desc", "O3 Desc", "듀얼 포맷 렌더링 단계\n(DOCX VML & HWPX OWPML Output)", 115, 268, 420, 36, font_size=10, font_weight=600, color=(0.15, 0.2, 0.3)),
            
            # Vector Path 1: Checkmark Icon in Box
            make_rect_node("vec-icon-bg1", "Icon Box 1", 50, 340, 40, 40, fill_color=(0.9, 0.98, 0.92), border_color=(0.6, 0.88, 0.7), border_width=1, corner_radius=8),
            make_vector_node("vec-check-path", "Checkmark Icon", 58, 348, 24, 24, "M4 12l5 5L20 6", fill_color=None, stroke_color=(0.1, 0.6, 0.3), stroke_width=2),
            make_text_node("vec-c-label", "Check Label", "호환성 100% 통과 (Compliance Verified)", 105, 350, 430, 20, font_size=11, font_weight=700, color=(0.1, 0.5, 0.25)),
            
            # Vector Path 2: Star Shape
            make_vector_node("vec-star-path", "Star Vector", 55, 410, 32, 32, "M12 2l3 7h7l-5.5 4.5 2 7-6.5-4.5-6.5 4.5 2-7L2 9h7z", fill_color=(0.95, 0.75, 0.1)),
            make_text_node("vec-s-label", "Star Label", "최우수 시각 정확도 등급 (Grade AAA SSIM > 0.87)", 105, 416, 430, 20, font_size=11, font_weight=700, color=(0.7, 0.5, 0.05)),
            
            # Vector Path 3: Arrow Indicator
            make_vector_node("vec-arrow-path", "Arrow Vector", 55, 475, 32, 32, "M5 12h14M13 5l7 7-7 7", fill_color=None, stroke_color=(0.2, 0.4, 0.8), stroke_width=2),
            make_text_node("vec-a-label", "Arrow Label", "지속 가능한 확장 파이프라인 (Continuous Pipeline)", 105, 481, 430, 20, font_size=11, font_weight=700, color=(0.15, 0.3, 0.65)),
            
            # Process diagram card with rounded pill tags
            make_rect_node("vec-proc-card", "Process Card", 40, 540, 515, 180, fill_color=(0.97, 0.98, 1.0), border_color=(0.85, 0.88, 0.95), border_width=1, corner_radius=12),
            make_text_node("vec-proc-t", "Process Header", "컴포넌트 렌더링 계층 구조 (Rendering Pipeline Architecture)", 60, 560, 475, 22, font_size=12, font_weight=700, color=(0.1, 0.2, 0.4)),
            
            # Pills
            make_rect_node("vec-pill-1", "Pill 1", 60, 600, 130, 32, fill_color=(0.2, 0.4, 0.9), border_color=None, corner_radius=16),
            make_text_node("vec-p1-txt", "P1 Text", "FigmaParser", 60, 608, 130, 16, font_size=10, font_weight=700, color=(1.0, 1.0, 1.0), align="CENTER"),
            
            make_rect_node("vec-pill-2", "Pill 2", 232, 600, 130, 32, fill_color=(0.1, 0.65, 0.4), border_color=None, corner_radius=16),
            make_text_node("vec-p2-txt", "P2 Text", "Canvas IR Model", 232, 608, 130, 16, font_size=10, font_weight=700, color=(1.0, 1.0, 1.0), align="CENTER"),
            
            make_rect_node("vec-pill-3", "Pill 3", 405, 600, 130, 32, fill_color=(0.8, 0.3, 0.2), border_color=None, corner_radius=16),
            make_text_node("vec-p3-txt", "P3 Text", "DOCX / HWPX", 405, 608, 130, 16, font_size=10, font_weight=700, color=(1.0, 1.0, 1.0), align="CENTER"),
            
            make_text_node("vec-proc-desc", "Process Desc", "각 계층은 독립적인 단위 테스트 및 회귀 테스트를 거치며, 포맷별 바이너리 컨테이너 규격을 100% 준수합니다.", 60, 660, 475, 36, font_size=9.5, font_weight=400, color=(0.3, 0.35, 0.45)),
        ]
    }
    return {
        "name": "Synthetic 05 - Vector-Centric Infographic",
        "lastModified": "2026-10-15T00:00:00Z",
        "document": {
            "id": "doc-syn-05",
            "name": "Document",
            "type": "DOCUMENT",
            "children": [frame]
        }
    }

# ==============================================================================
# Sample 6: Complex Nested Dashboard (Landscape, Sidebar, Top KPI, Charts)
# ==============================================================================
def create_sample6_complex_nested_dashboard():
    # Landscape A4: 842 x 595
    frame = {
        "id": "frame-dash-p1",
        "name": "Complex Nested Dashboard",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 842, "height": 595},
        "fills": make_solid_fill(0.97, 0.98, 0.99),
        "children": [
            # Top Navigation Bar
            make_rect_node("dash-topbar", "Top Bar", 0, 0, 842, 56, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1),
            make_text_node("dash-logo", "Logo Text", "⚡ Enterprise Office Analytics", 24, 18, 250, 24, font_size=14, font_weight=700, color=(0.1, 0.15, 0.3)),
            make_oval_node("dash-user-avatar", "Avatar", 800, 14, 28, 28, fill_color=(0.2, 0.5, 0.9)),
            
            # Left Sidebar
            make_rect_node("dash-sidebar", "Sidebar", 0, 56, 180, 539, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1),
            make_rect_node("dash-menu-act", "Active Menu", 12, 76, 156, 36, fill_color=(0.92, 0.95, 1.0), border_color=None, corner_radius=6),
            make_text_node("dash-m1", "Menu 1", "📊 대시보드 개요", 24, 86, 130, 18, font_size=10.5, font_weight=700, color=(0.1, 0.35, 0.8)),
            make_text_node("dash-m2", "Menu 2", "📁 변환 문서 관리", 24, 130, 130, 18, font_size=10.5, font_weight=400, color=(0.4, 0.45, 0.5)),
            make_text_node("dash-m3", "Menu 3", "⚙️ 엔진 품질 설정", 24, 170, 130, 18, font_size=10.5, font_weight=400, color=(0.4, 0.45, 0.5)),
            make_text_node("dash-m4", "Menu 4", "📈 성능 벤치마크", 24, 210, 130, 18, font_size=10.5, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            # 4 KPI Stat Widgets
            # Widget 1
            make_rect_node("dash-w1-bg", "Widget 1", 204, 76, 145, 90, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1, corner_radius=8),
            make_text_node("dash-w1-lbl", "W1 Label", "총 변환 완료 건수", 218, 90, 120, 16, font_size=9, font_weight=600, color=(0.5, 0.55, 0.6)),
            make_text_node("dash-w1-val", "W1 Value", "12,480", 218, 110, 120, 26, font_size=18, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("dash-w1-sub", "W1 Sub", "▲ 전월대비 24% 증가", 218, 140, 120, 14, font_size=8, font_weight=600, color=(0.1, 0.6, 0.25)),
            
            # Widget 2
            make_rect_node("dash-w2-bg", "Widget 2", 365, 76, 145, 90, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1, corner_radius=8),
            make_text_node("dash-w2-lbl", "W2 Label", "평균 처리 속도", 379, 90, 120, 16, font_size=9, font_weight=600, color=(0.5, 0.55, 0.6)),
            make_text_node("dash-w2-val", "W2 Value", "142 ms", 379, 110, 120, 26, font_size=18, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("dash-w2-sub", "W2 Sub", "▼ 지연시간 35ms 개선", 379, 140, 120, 14, font_size=8, font_weight=600, color=(0.1, 0.6, 0.25)),
            
            # Widget 3
            make_rect_node("dash-w3-bg", "Widget 3", 526, 76, 145, 90, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1, corner_radius=8),
            make_text_node("dash-w3-lbl", "W3 Label", "시각 정밀도 지수", 540, 90, 120, 16, font_size=9, font_weight=600, color=(0.5, 0.55, 0.6)),
            make_text_node("dash-w3-val", "W3 Value", "99.4 %", 540, 110, 120, 26, font_size=18, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("dash-w3-sub", "W3 Sub", "무결성 검증 통과", 540, 140, 120, 14, font_size=8, font_weight=600, color=(0.2, 0.4, 0.8)),
            
            # Widget 4
            make_rect_node("dash-w4-bg", "Widget 4", 687, 76, 135, 90, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1, corner_radius=8),
            make_text_node("dash-w4-lbl", "W4 Label", "시스템 가용성", 701, 90, 110, 16, font_size=9, font_weight=600, color=(0.5, 0.55, 0.6)),
            make_text_node("dash-w4-val", "W4 Value", "99.99 %", 701, 110, 110, 26, font_size=18, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("dash-w4-sub", "W4 Sub", "정상 운영 중", 701, 140, 110, 14, font_size=8, font_weight=600, color=(0.1, 0.6, 0.25)),
            
            # Simulated Chart Card
            make_rect_node("dash-chart-card", "Chart Container", 204, 185, 618, 380, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1, corner_radius=8),
            make_text_node("dash-c-t", "Chart Title", "월별 문서 변환 처리량 추이 (Monthly Conversion Trend)", 224, 205, 400, 22, font_size=12, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("dash-c-sub", "Chart Sub", "2026년 상반기 DOCX 및 HWPX 생성 건수 비교 분석", 224, 228, 400, 16, font_size=9, font_weight=400, color=(0.5, 0.55, 0.6)),
            
            # Bar Chart Columns
            make_rect_node("dash-bar-1", "Bar Jan", 260, 420, 40, 100, fill_color=(0.2, 0.45, 0.85), border_color=None, corner_radius=4),
            make_text_node("dash-b1-lbl", "Jan Lbl", "1월", 260, 526, 40, 16, font_size=9, font_weight=600, color=(0.4, 0.45, 0.5), align="CENTER"),
            
            make_rect_node("dash-bar-2", "Bar Feb", 350, 370, 40, 150, fill_color=(0.2, 0.45, 0.85), border_color=None, corner_radius=4),
            make_text_node("dash-b2-lbl", "Feb Lbl", "2월", 350, 526, 40, 16, font_size=9, font_weight=600, color=(0.4, 0.45, 0.5), align="CENTER"),
            
            make_rect_node("dash-bar-3", "Bar Mar", 440, 330, 40, 190, fill_color=(0.2, 0.45, 0.85), border_color=None, corner_radius=4),
            make_text_node("dash-b3-lbl", "Mar Lbl", "3월", 440, 526, 40, 16, font_size=9, font_weight=600, color=(0.4, 0.45, 0.5), align="CENTER"),
            
            make_rect_node("dash-bar-4", "Bar Apr", 530, 290, 40, 230, fill_color=(0.2, 0.45, 0.85), border_color=None, corner_radius=4),
            make_text_node("dash-b4-lbl", "Apr Lbl", "4월", 530, 526, 40, 16, font_size=9, font_weight=600, color=(0.4, 0.45, 0.5), align="CENTER"),
            
            make_rect_node("dash-bar-5", "Bar May", 620, 270, 40, 250, fill_color=(0.2, 0.45, 0.85), border_color=None, corner_radius=4),
            make_text_node("dash-b5-lbl", "May Lbl", "5월", 620, 526, 40, 16, font_size=9, font_weight=600, color=(0.4, 0.45, 0.5), align="CENTER"),
            
            make_rect_node("dash-bar-6", "Bar Jun", 710, 250, 40, 270, fill_color=(0.09, 0.38, 0.86), border_color=None, corner_radius=4),
            make_text_node("dash-b6-lbl", "Jun Lbl", "6월", 710, 526, 40, 16, font_size=9, font_weight=700, color=(0.09, 0.38, 0.86), align="CENTER"),
        ]
    }
    return {
        "name": "Synthetic 06 - Complex Nested Dashboard",
        "lastModified": "2026-10-15T00:00:00Z",
        "document": {
            "id": "doc-syn-06",
            "name": "Document",
            "type": "DOCUMENT",
            "children": [frame]
        }
    }

# ==============================================================================
# Sample 7: Table-Card Hybrid (Summary Cards + Multi-row Structured Table Grid)
# ==============================================================================
def create_sample7_table_card_hybrid():
    frame = {
        "id": "frame-tbl-p1",
        "name": "Table Card Hybrid Report",
        "type": "FRAME",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 595, "height": 842},
        "fills": make_solid_fill(1.0, 1.0, 1.0),
        "children": [
            make_text_node("tbl-title", "Title", "2026년 3분기 디지털 전환 과제 현황", 40, 40, 515, 30, font_size=18, font_weight=700, color=(0.1, 0.15, 0.25)),
            make_text_node("tbl-sub", "Subtitle", "부서별 프로젝트 진척도 및 예산 집행 현황 요약", 40, 72, 515, 18, font_size=9.5, font_weight=400, color=(0.4, 0.45, 0.5)),
            
            # Top 3 KPI Cards
            make_rect_node("tbl-kpi1", "KPI 1", 40, 105, 160, 75, fill_color=(0.95, 0.98, 1.0), border_color=(0.75, 0.85, 0.98), border_width=1, corner_radius=6),
            make_text_node("tbl-k1-lbl", "K1 Label", "전체 추진 과제", 52, 118, 136, 16, font_size=9, font_weight=600, color=(0.2, 0.4, 0.7)),
            make_text_node("tbl-k1-val", "K1 Value", "48 건", 52, 138, 136, 26, font_size=18, font_weight=700, color=(0.1, 0.25, 0.6)),
            
            make_rect_node("tbl-kpi2", "KPI 2", 217, 105, 160, 75, fill_color=(0.95, 0.99, 0.96), border_color=(0.75, 0.9, 0.8), border_width=1, corner_radius=6),
            make_text_node("tbl-k2-lbl", "K2 Label", "완료 및 결재 완료", 229, 118, 136, 16, font_size=9, font_weight=600, color=(0.15, 0.55, 0.25)),
            make_text_node("tbl-k2-val", "K2 Value", "39 건", 229, 138, 136, 26, font_size=18, font_weight=700, color=(0.1, 0.45, 0.2)),
            
            make_rect_node("tbl-kpi3", "KPI 3", 395, 105, 160, 75, fill_color=(1.0, 0.97, 0.95), border_color=(0.95, 0.8, 0.7), border_width=1, corner_radius=6),
            make_text_node("tbl-k3-lbl", "K3 Label", "평균 달성률", 407, 118, 136, 16, font_size=9, font_weight=600, color=(0.7, 0.35, 0.1)),
            make_text_node("tbl-k3-val", "K3 Value", "88.5 %", 407, 138, 136, 26, font_size=18, font_weight=700, color=(0.6, 0.25, 0.05)),
            
            # Table Header
            make_text_node("tbl-sec-t", "Section Title", "주요 프로젝트 세부 내역 (Project Details)", 40, 205, 515, 22, font_size=12, font_weight=700, color=(0.12, 0.2, 0.35)),
            
            # Table Header Row (Y=235, Height=34)
            make_rect_node("tbl-th-bg", "Header Row BG", 40, 235, 515, 34, fill_color=(0.12, 0.2, 0.35), border_color=None),
            make_text_node("th-c1", "TH 1", "과제 번호", 50, 244, 70, 16, font_size=9.5, font_weight=700, color=(1.0, 1.0, 1.0)),
            make_text_node("th-c2", "TH 2", "프로젝트명", 130, 244, 180, 16, font_size=9.5, font_weight=700, color=(1.0, 1.0, 1.0)),
            make_text_node("th-c3", "TH 3", "담당부서", 320, 244, 75, 16, font_size=9.5, font_weight=700, color=(1.0, 1.0, 1.0)),
            make_text_node("th-c4", "TH 4", "진척률", 405, 244, 50, 16, font_size=9.5, font_weight=700, color=(1.0, 1.0, 1.0)),
            make_text_node("th-c5", "TH 5", "상태", 470, 244, 75, 16, font_size=9.5, font_weight=700, color=(1.0, 1.0, 1.0), align="CENTER"),
            
            # Row 1 (Y=269, Height=36)
            make_rect_node("tr1-bg", "TR1 BG", 40, 269, 515, 36, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1),
            make_text_node("tr1-c1", "TR1 C1", "PJ-2026-01", 50, 279, 70, 16, font_size=9, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("tr1-c2", "TR1 C2", "Figma2Word Canvas 듀얼 엔진 구축", 130, 279, 180, 16, font_size=9, font_weight=600, color=(0.15, 0.2, 0.3)),
            make_text_node("tr1-c3", "TR1 C3", "플랫폼개발팀", 320, 279, 75, 16, font_size=9, font_weight=400, color=(0.3, 0.35, 0.4)),
            make_text_node("tr1-c4", "TR1 C4", "100%", 405, 279, 50, 16, font_size=9, font_weight=600, color=(0.1, 0.55, 0.2)),
            make_rect_node("tr1-chip", "TR1 Chip", 480, 276, 55, 22, fill_color=(0.88, 0.98, 0.92), border_color=None, corner_radius=11),
            make_text_node("tr1-chip-t", "TR1 Chip Text", "완료", 480, 280, 55, 14, font_size=8.5, font_weight=700, color=(0.1, 0.55, 0.2), align="CENTER"),
            
            # Row 2 (Y=305, Height=36, Alternating fill)
            make_rect_node("tr2-bg", "TR2 BG", 40, 305, 515, 36, fill_color=(0.98, 0.98, 0.99), border_color=(0.88, 0.9, 0.92), border_width=1),
            make_text_node("tr2-c1", "TR2 C1", "PJ-2026-02", 50, 315, 70, 16, font_size=9, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("tr2-c2", "TR2 C2", "KS X 6101 HWPX 표준 검증기 개발", 130, 315, 180, 16, font_size=9, font_weight=600, color=(0.15, 0.2, 0.3)),
            make_text_node("tr2-c3", "TR2 C3", "품질보증팀", 320, 315, 75, 16, font_size=9, font_weight=400, color=(0.3, 0.35, 0.4)),
            make_text_node("tr2-c4", "TR2 C4", "95%", 405, 315, 50, 16, font_size=9, font_weight=600, color=(0.15, 0.4, 0.8)),
            make_rect_node("tr2-chip", "TR2 Chip", 480, 312, 55, 22, fill_color=(0.9, 0.95, 1.0), border_color=None, corner_radius=11),
            make_text_node("tr2-chip-t", "TR2 Chip Text", "진행중", 480, 316, 55, 14, font_size=8.5, font_weight=700, color=(0.15, 0.4, 0.8), align="CENTER"),
            
            # Row 3 (Y=341, Height=36)
            make_rect_node("tr3-bg", "TR3 BG", 40, 341, 515, 36, fill_color=(1.0, 1.0, 1.0), border_color=(0.88, 0.9, 0.92), border_width=1),
            make_text_node("tr3-c1", "TR3 C1", "PJ-2026-03", 50, 351, 70, 16, font_size=9, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("tr3-c2", "TR3 C2", "웹 UI 원클릭 변환기 고도화", 130, 351, 180, 16, font_size=9, font_weight=600, color=(0.15, 0.2, 0.3)),
            make_text_node("tr3-c3", "TR3 C3", "UX디자인팀", 320, 351, 75, 16, font_size=9, font_weight=400, color=(0.3, 0.35, 0.4)),
            make_text_node("tr3-c4", "TR3 C4", "80%", 405, 351, 50, 16, font_size=9, font_weight=600, color=(0.8, 0.45, 0.1)),
            make_rect_node("tr3-chip", "TR3 Chip", 480, 348, 55, 22, fill_color=(1.0, 0.95, 0.9), border_color=None, corner_radius=11),
            make_text_node("tr3-chip-t", "TR3 Chip Text", "진행중", 480, 352, 55, 14, font_size=8.5, font_weight=700, color=(0.8, 0.45, 0.1), align="CENTER"),
            
            # Row 4 (Y=377, Height=36, Alternating fill)
            make_rect_node("tr4-bg", "TR4 BG", 40, 377, 515, 36, fill_color=(0.98, 0.98, 0.99), border_color=(0.88, 0.9, 0.92), border_width=1),
            make_text_node("tr4-c1", "TR4 C1", "PJ-2026-04", 50, 387, 70, 16, font_size=9, font_weight=400, color=(0.2, 0.25, 0.3)),
            make_text_node("tr4-c2", "TR4 C2", "전사 보안 인증 및 온프레미스 배포", 130, 387, 180, 16, font_size=9, font_weight=600, color=(0.15, 0.2, 0.3)),
            make_text_node("tr4-c3", "TR4 C3", "인프라보안팀", 320, 387, 75, 16, font_size=9, font_weight=400, color=(0.3, 0.35, 0.4)),
            make_text_node("tr4-c4", "TR4 C4", "40%", 405, 387, 50, 16, font_size=9, font_weight=600, color=(0.5, 0.5, 0.5)),
            make_rect_node("tr4-chip", "TR4 Chip", 480, 384, 55, 22, fill_color=(0.94, 0.94, 0.96), border_color=None, corner_radius=11),
            make_text_node("tr4-chip-t", "TR4 Chip Text", "검토대기", 480, 388, 55, 14, font_size=8.5, font_weight=700, color=(0.4, 0.4, 0.45), align="CENTER"),
            
            # Bottom Summary Note
            make_text_node("tbl-note", "Table Note", "※ 진척률 90% 이상 과제는 차주 정기 회의에서 최종 산출물 시연을 진행합니다.", 40, 430, 515, 20, font_size=9, font_weight=400, color=(0.45, 0.5, 0.55)),
        ]
    }
    return {
        "name": "Synthetic 07 - Table-Card Hybrid",
        "lastModified": "2026-10-15T00:00:00Z",
        "document": {
            "id": "doc-syn-07",
            "name": "Document",
            "type": "DOCUMENT",
            "children": [frame]
        }
    }

def main():
    generators = [
        ("single-page-brief.json", create_sample1_single_page_brief),
        ("multi-page-report.json", create_sample2_multi_page_report),
        ("image-centric-portfolio.json", create_sample3_image_centric_portfolio),
        ("text-centric-article.json", create_sample4_text_centric_article),
        ("vector-centric-infographic.json", create_sample5_vector_centric_infographic),
        ("complex-nested-dashboard.json", create_sample6_complex_nested_dashboard),
        ("table-card-hybrid.json", create_sample7_table_card_hybrid),
    ]

    for fname, gen in generators:
        data = gen()
        fpath = os.path.join(OUTPUT_DIR, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Generated: {fpath} ({len(json.dumps(data))} bytes)")

if __name__ == "__main__":
    main()

