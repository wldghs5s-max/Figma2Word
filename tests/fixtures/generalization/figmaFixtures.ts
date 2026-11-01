import { FigmaNode } from "../../../src/parser/types.js";

/**
 * Fixture 1: Business Data Table
 * A structured AutoLayout table with header row, data rows, alternating fills, and a merged cell.
 */
export function createBusinessDataTableFixture(): FigmaNode {
  return {
    id: "frame_data_table",
    name: "Business Report - Data Table Screen",
    type: "FRAME",
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
    children: [
      {
        id: "tbl_container_001",
        name: "Monthly Audit Summary Table",
        type: "FRAME",
        visible: true,
        layoutMode: "VERTICAL",
        absoluteBoundingBox: { x: 50, y: 50, width: 700, height: 200 },
        fills: [{ type: "SOLID", visible: true, color: { r: 0.98, g: 0.98, b: 0.99, a: 1 } }],
        strokes: [{ type: "SOLID", visible: true, color: { r: 0.82, g: 0.84, b: 0.86, a: 1 } }],
        strokeWeight: 1,
        children: [
          // Row 0: Header Row
          {
            id: "row_header",
            name: "Table Header Row",
            type: "FRAME",
            visible: true,
            layoutMode: "HORIZONTAL",
            absoluteBoundingBox: { x: 50, y: 50, width: 700, height: 40 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.12, g: 0.23, b: 0.54, a: 1 } }],
            children: [
              {
                id: "c_h1",
                name: "Header_Col1",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 50, y: 50, width: 175, height: 40 },
                children: [
                  {
                    id: "t_h1",
                    name: "Title1",
                    type: "TEXT",
                    visible: true,
                    characters: "진단 항목",
                    style: { fontSize: 13, fontWeight: 700, textAlignHorizontal: "CENTER" },
                    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
                  },
                ],
              },
              {
                id: "c_h2",
                name: "Header_Col2",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 225, y: 50, width: 175, height: 40 },
                children: [
                  {
                    id: "t_h2",
                    name: "Title2",
                    type: "TEXT",
                    visible: true,
                    characters: "세부 기준",
                    style: { fontSize: 13, fontWeight: 700, textAlignHorizontal: "CENTER" },
                    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
                  },
                ],
              },
              {
                id: "c_h3",
                name: "Header_Col3",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 400, y: 50, width: 175, height: 40 },
                children: [
                  {
                    id: "t_h3",
                    name: "Title3",
                    type: "TEXT",
                    visible: true,
                    characters: "측정치",
                    style: { fontSize: 13, fontWeight: 700, textAlignHorizontal: "CENTER" },
                    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
                  },
                ],
              },
              {
                id: "c_h4",
                name: "Header_Col4",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 575, y: 50, width: 175, height: 40 },
                children: [
                  {
                    id: "t_h4",
                    name: "Title4",
                    type: "TEXT",
                    visible: true,
                    characters: "판정 결과",
                    style: { fontSize: 13, fontWeight: 700, textAlignHorizontal: "CENTER" },
                    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
                  },
                ],
              },
            ],
          },
          // Row 1: Data Row 1
          {
            id: "row_1",
            name: "Table Data Row 1",
            type: "FRAME",
            visible: true,
            layoutMode: "HORIZONTAL",
            absoluteBoundingBox: { x: 50, y: 90, width: 700, height: 40 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
            children: [
              {
                id: "c_r1_1",
                name: "Cell_1_1",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 50, y: 90, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r1_1",
                    name: "Text_1_1",
                    type: "TEXT",
                    visible: true,
                    characters: "1. 기둥 균열",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "LEFT" },
                  },
                ],
              },
              {
                id: "c_r1_2",
                name: "Cell_1_2",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 225, y: 90, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r1_2",
                    name: "Text_1_2",
                    type: "TEXT",
                    visible: true,
                    characters: "균열폭 0.3mm 이하",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "LEFT" },
                  },
                ],
              },
              {
                id: "c_r1_3",
                name: "Cell_1_3",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 400, y: 90, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r1_3",
                    name: "Text_1_3",
                    type: "TEXT",
                    visible: true,
                    characters: "0.12mm 측정",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "CENTER" },
                  },
                ],
              },
              {
                id: "c_r1_4",
                name: "Cell_1_4",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 575, y: 90, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r1_4",
                    name: "Text_1_4",
                    type: "TEXT",
                    visible: true,
                    characters: "양호 (A)",
                    style: { fontSize: 11, fontWeight: 600, textAlignHorizontal: "CENTER" },
                  },
                ],
              },
            ],
          },
          // Row 2: Data Row 2 (with colSpan = 2 for long description in cols 2 & 3)
          {
            id: "row_2",
            name: "Table Data Row 2 Merged",
            type: "FRAME",
            visible: true,
            layoutMode: "HORIZONTAL",
            absoluteBoundingBox: { x: 50, y: 130, width: 700, height: 40 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.97, g: 0.98, b: 0.99, a: 1 } }],
            children: [
              {
                id: "c_r2_1",
                name: "Cell_2_1",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 50, y: 130, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r2_1",
                    name: "Text_2_1",
                    type: "TEXT",
                    visible: true,
                    characters: "2. 기초 침하",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "LEFT" },
                  },
                ],
              },
              {
                id: "c_r2_2_merged",
                name: "Cell_2_2_Spanned",
                type: "FRAME",
                visible: true,
                // Spans column 2 and 3 (175 + 175 = 350)
                absoluteBoundingBox: { x: 225, y: 130, width: 350, height: 40 },
                children: [
                  {
                    id: "t_r2_2",
                    name: "Text_2_2",
                    type: "TEXT",
                    visible: true,
                    characters: "부등침하 및 수평변위 육안 및 레이저 계측 결과 변위 없음 확인",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "LEFT" },
                  },
                ],
              },
              {
                id: "c_r2_4",
                name: "Cell_2_4",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 575, y: 130, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r2_4",
                    name: "Text_2_4",
                    type: "TEXT",
                    visible: true,
                    characters: "양호 (A)",
                    style: { fontSize: 11, fontWeight: 600, textAlignHorizontal: "CENTER" },
                  },
                ],
              },
            ],
          },
          // Row 3: Data Row 3
          {
            id: "row_3",
            name: "Table Data Row 3",
            type: "FRAME",
            visible: true,
            layoutMode: "HORIZONTAL",
            absoluteBoundingBox: { x: 50, y: 170, width: 700, height: 40 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
            children: [
              {
                id: "c_r3_1",
                name: "Cell_3_1",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 50, y: 170, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r3_1",
                    name: "Text_3_1",
                    type: "TEXT",
                    visible: true,
                    characters: "3. 강재 도장",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "LEFT" },
                  },
                ],
              },
              {
                id: "c_r3_2",
                name: "Cell_3_2",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 225, y: 170, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r3_2",
                    name: "Text_3_2",
                    type: "TEXT",
                    visible: true,
                    characters: "녹 발생률 5% 미만",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "LEFT" },
                  },
                ],
              },
              {
                id: "c_r3_3",
                name: "Cell_3_3",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 400, y: 170, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r3_3",
                    name: "Text_3_3",
                    type: "TEXT",
                    visible: true,
                    characters: "국소 녹 발생 (2%)",
                    style: { fontSize: 11, fontWeight: 400, textAlignHorizontal: "CENTER" },
                  },
                ],
              },
              {
                id: "c_r3_4",
                name: "Cell_3_4",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 575, y: 170, width: 175, height: 40 },
                children: [
                  {
                    id: "t_r3_4",
                    name: "Text_3_4",
                    type: "TEXT",
                    visible: true,
                    characters: "보통 (B)",
                    style: { fontSize: 11, fontWeight: 600, textAlignHorizontal: "CENTER" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Fixture 2: Management Dashboard
 * Contains metric stat cards, navigation, and charts.
 * MUST NOT be misclassified as a table!
 */
export function createManagementDashboardFixture(): FigmaNode {
  return {
    id: "frame_dashboard",
    name: "Analytics Management Dashboard Screen",
    type: "FRAME",
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 1200, height: 800 },
    children: [
      // Top Navigation
      {
        id: "nav_top",
        name: "Top Navigation Bar",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 0, y: 0, width: 1200, height: 60 },
        fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.15, b: 0.25, a: 1 } }],
        children: [
          {
            id: "nav_logo",
            name: "Brand Logo",
            type: "TEXT",
            visible: true,
            characters: "CloudOps Console",
            style: { fontSize: 18, fontWeight: 700 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
          },
        ],
      },
      // 3 Stat Cards Row
      {
        id: "stat_cards_container",
        name: "KPI Stat Cards Row",
        type: "FRAME",
        visible: true,
        layoutMode: "HORIZONTAL",
        absoluteBoundingBox: { x: 50, y: 100, width: 1100, height: 120 },
        children: [
          {
            id: "card_stat_1",
            name: "Metric Card - Total Active Users",
            type: "FRAME",
            visible: true,
            absoluteBoundingBox: { x: 50, y: 100, width: 340, height: 120 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.95, g: 0.97, b: 1, a: 1 } }],
            strokes: [{ type: "SOLID", visible: true, color: { r: 0.8, g: 0.85, b: 0.95, a: 1 } }],
            strokeWeight: 1,
            children: [
              {
                id: "stat_lbl_1",
                name: "Label",
                type: "TEXT",
                visible: true,
                characters: "총 활성 사용자",
                style: { fontSize: 13, fontWeight: 500 },
              },
              {
                id: "stat_val_1",
                name: "Big Metric",
                type: "TEXT",
                visible: true,
                characters: "128,450명",
                style: { fontSize: 28, fontWeight: 700 },
              },
            ],
          },
          {
            id: "card_stat_2",
            name: "Metric Card - Monthly Revenue",
            type: "FRAME",
            visible: true,
            absoluteBoundingBox: { x: 430, y: 100, width: 340, height: 120 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.95, g: 1, b: 0.96, a: 1 } }],
            strokes: [{ type: "SOLID", visible: true, color: { r: 0.7, g: 0.9, b: 0.75, a: 1 } }],
            strokeWeight: 1,
            children: [
              {
                id: "stat_lbl_2",
                name: "Label",
                type: "TEXT",
                visible: true,
                characters: "월간 매출액",
                style: { fontSize: 13, fontWeight: 500 },
              },
              {
                id: "stat_val_2",
                name: "Big Metric",
                type: "TEXT",
                visible: true,
                characters: "₩ 48,200,000",
                style: { fontSize: 28, fontWeight: 700 },
              },
            ],
          },
          {
            id: "card_stat_3",
            name: "Metric Card - System Uptime",
            type: "FRAME",
            visible: true,
            absoluteBoundingBox: { x: 810, y: 100, width: 340, height: 120 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0.97, b: 0.95, a: 1 } }],
            strokes: [{ type: "SOLID", visible: true, color: { r: 0.95, g: 0.85, b: 0.75, a: 1 } }],
            strokeWeight: 1,
            children: [
              {
                id: "stat_lbl_3",
                name: "Label",
                type: "TEXT",
                visible: true,
                characters: "가동률 (Uptime)",
                style: { fontSize: 13, fontWeight: 500 },
              },
              {
                id: "stat_val_3",
                name: "Big Metric",
                type: "TEXT",
                visible: true,
                characters: "99.98 %",
                style: { fontSize: 28, fontWeight: 700 },
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Fixture 3: Input Form
 * Contains input fields, labels, and submit button.
 * MUST NOT be misclassified as a table!
 */
export function createInputFormFixture(): FigmaNode {
  return {
    id: "frame_form_screen",
    name: "User Account Registration Form Screen",
    type: "FRAME",
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 700 },
    children: [
      {
        id: "form_container",
        name: "Signup Form Container",
        type: "FRAME",
        visible: true,
        layoutMode: "VERTICAL",
        absoluteBoundingBox: { x: 100, y: 80, width: 400, height: 500 },
        children: [
          {
            id: "form_title",
            name: "Form Heading",
            type: "TEXT",
            visible: true,
            characters: "신규 관리자 계정 생성",
            style: { fontSize: 20, fontWeight: 700 },
          },
          // Input 1: Name
          {
            id: "input_group_name",
            name: "Field - Name",
            type: "FRAME",
            visible: true,
            absoluteBoundingBox: { x: 100, y: 140, width: 400, height: 70 },
            children: [
              {
                id: "lbl_name",
                name: "Label",
                type: "TEXT",
                visible: true,
                characters: "성명 (Full Name)",
                style: { fontSize: 12, fontWeight: 600 },
              },
              {
                id: "box_name",
                name: "Input Box",
                type: "RECTANGLE",
                visible: true,
                absoluteBoundingBox: { x: 100, y: 165, width: 400, height: 42 },
                strokes: [{ type: "SOLID", visible: true, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
                strokeWeight: 1,
              },
            ],
          },
          // Input 2: Email
          {
            id: "input_group_email",
            name: "Field - Email",
            type: "FRAME",
            visible: true,
            absoluteBoundingBox: { x: 100, y: 230, width: 400, height: 70 },
            children: [
              {
                id: "lbl_email",
                name: "Label",
                type: "TEXT",
                visible: true,
                characters: "업무용 이메일 주소",
                style: { fontSize: 12, fontWeight: 600 },
              },
              {
                id: "box_email",
                name: "Input Box",
                type: "RECTANGLE",
                visible: true,
                absoluteBoundingBox: { x: 100, y: 255, width: 400, height: 42 },
                strokes: [{ type: "SOLID", visible: true, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
                strokeWeight: 1,
              },
            ],
          },
          // Submit Button
          {
            id: "btn_submit",
            name: "Submit Button",
            type: "FRAME",
            visible: true,
            absoluteBoundingBox: { x: 100, y: 340, width: 400, height: 48 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.15, g: 0.45, b: 0.95, a: 1 } }],
            children: [
              {
                id: "btn_txt",
                name: "Button Text",
                type: "TEXT",
                visible: true,
                characters: "계정 생성 완료",
                style: { fontSize: 14, fontWeight: 600 },
                fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Fixture 4: Mobile UI
 * Portrait frame (390x844), nested vertical AutoLayout, search bar, list items.
 */
export function createMobileUIFixture(): FigmaNode {
  return {
    id: "frame_mobile_app",
    name: "Mobile Inspection List Screen",
    type: "FRAME",
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 390, height: 844 },
    children: [
      // Header
      {
        id: "m_header",
        name: "Mobile App Header",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 0, y: 0, width: 390, height: 88 },
        children: [
          {
            id: "m_title",
            name: "Screen Title",
            type: "TEXT",
            visible: true,
            characters: "현장 점검 목록",
            style: { fontSize: 18, fontWeight: 700 },
          },
        ],
      },
      // Search Bar
      {
        id: "m_search_bar",
        name: "Search Bar Container",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 20, y: 100, width: 350, height: 44 },
        fills: [{ type: "SOLID", visible: true, color: { r: 0.94, g: 0.95, b: 0.96, a: 1 } }],
        children: [
          {
            id: "m_search_ph",
            name: "Placeholder",
            type: "TEXT",
            visible: true,
            characters: "시설물 명칭 검색...",
            style: { fontSize: 13, color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
          },
        ],
      },
      // List Card 1
      {
        id: "m_card_1",
        name: "Inspection Item Card 1",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 20, y: 160, width: 350, height: 90 },
        fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
        strokes: [{ type: "SOLID", visible: true, color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } }],
        strokeWeight: 1,
        children: [
          {
            id: "m_card1_t1",
            name: "Building Name",
            type: "TEXT",
            visible: true,
            characters: "서울 마포구 제3교량",
            style: { fontSize: 15, fontWeight: 600 },
          },
          {
            id: "m_card1_t2",
            name: "Date & Status",
            type: "TEXT",
            visible: true,
            characters: "2026.10.28 · 점검 완료 (정상)",
            style: { fontSize: 12, color: { r: 0.2, g: 0.6, b: 0.3, a: 1 } },
          },
        ],
      },
    ],
  };
}

/**
 * Holdout Fixture 5: Document Layout
 * Long text, multi-paragraph content, callout quote card, figure caption.
 * Used exclusively for post-implementation holdout verification!
 */
export function createDocumentLayoutHoldoutFixture(): FigmaNode {
  return {
    id: "frame_document_holdout",
    name: "Engineering Technical Whitepaper Screen",
    type: "FRAME",
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 1100 },
    children: [
      {
        id: "doc_title",
        name: "Paper Title",
        type: "TEXT",
        visible: true,
        characters: "초고층 건축물의 내진 안전성 평가 및 구조 해석 기법",
        style: { fontSize: 24, fontWeight: 700 },
      },
      {
        id: "doc_para_1",
        name: "Introduction Paragraph",
        type: "TEXT",
        visible: true,
        characters: "본 기술 백서는 지진 하중에 따른 고층 건축물의 동적 응답 특성을 분석하고, 비선형 정적 해석(Pushover)을 적용한 내진 성능 평가 절차를 체계적으로 기술한다.",
        style: { fontSize: 11, lineHeightPx: 18, color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } },
      },
      // Callout Box
      {
        id: "callout_box",
        name: "Key Insight Callout Card",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 50, y: 180, width: 700, height: 80 },
        fills: [{ type: "SOLID", visible: true, color: { r: 0.94, g: 0.97, b: 1, a: 1 } }],
        strokes: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.5, b: 0.9, a: 1 } }],
        strokeWeight: 2,
        children: [
          {
            id: "callout_text",
            name: "Callout Text",
            type: "TEXT",
            visible: true,
            characters: "주요 결론: 구조 감쇠장치(TMD) 적용 시 최상층 최대 가속도 응답이 평균 34.2% 저감되는 것으로 확인됨.",
            style: { fontSize: 12, fontWeight: 600, color: { r: 0.1, g: 0.3, b: 0.7, a: 1 } },
          },
        ],
      },
      {
        id: "doc_para_2",
        name: "Body Paragraph 2",
        type: "TEXT",
        visible: true,
        characters: "시간이력해석 결과와 한계상태설계법을 비교 검토한 결과, 허용 층간변위비 1.5% 기준을 모든 지진파에 대해 안정적으로 만족하였다.",
        style: { fontSize: 11, lineHeightPx: 18, color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } },
      },
    ],
  };
}

/**
 * Holdout Fixture 6: Complex Design System Component
 * Nested component instances, variants, and embedded table instance.
 * Used exclusively for post-implementation holdout verification!
 */
export function createComplexDesignSystemHoldoutFixture(): FigmaNode {
  return {
    id: "frame_design_system_holdout",
    name: "Design System Specification Screen",
    type: "FRAME",
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 900, height: 750 },
    children: [
      {
        id: "ds_header",
        name: "Component Spec Title",
        type: "TEXT",
        visible: true,
        characters: "디자인 시스템 컴포넌트 규격: Data Grid v2.4",
        style: { fontSize: 20, fontWeight: 700 },
      },
      // Embedded Table Instance
      {
        id: "instance_grid_component",
        name: "ComponentInstance / DataGrid / Standard",
        type: "INSTANCE",
        visible: true,
        layoutMode: "VERTICAL",
        absoluteBoundingBox: { x: 50, y: 80, width: 800, height: 160 },
        children: [
          // Header Row
          {
            id: "inst_hdr_row",
            name: "HeaderRow",
            type: "FRAME",
            visible: true,
            layoutMode: "HORIZONTAL",
            absoluteBoundingBox: { x: 50, y: 80, width: 800, height: 40 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.92, g: 0.94, b: 0.96, a: 1 } }],
            children: [
              {
                id: "ih_c1",
                name: "Cell_Prop",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 50, y: 80, width: 200, height: 40 },
                children: [{ id: "ih_t1", name: "T1", type: "TEXT", visible: true, characters: "속성명 (Property)" }],
              },
              {
                id: "ih_c2",
                name: "Cell_Type",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 250, y: 80, width: 200, height: 40 },
                children: [{ id: "ih_t2", name: "T2", type: "TEXT", visible: true, characters: "타입 (Type)" }],
              },
              {
                id: "ih_c3",
                name: "Cell_Default",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 450, y: 80, width: 200, height: 40 },
                children: [{ id: "ih_t3", name: "T3", type: "TEXT", visible: true, characters: "기본값 (Default)" }],
              },
              {
                id: "ih_c4",
                name: "Cell_Desc",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 650, y: 80, width: 200, height: 40 },
                children: [{ id: "ih_t4", name: "T4", type: "TEXT", visible: true, characters: "설명 (Description)" }],
              },
            ],
          },
          // Data Row 1
          {
            id: "inst_data_row_1",
            name: "DataRow1",
            type: "FRAME",
            visible: true,
            layoutMode: "HORIZONTAL",
            absoluteBoundingBox: { x: 50, y: 120, width: 800, height: 40 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1, a: 1 } }],
            children: [
              {
                id: "id1_c1",
                name: "Cell_1",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 50, y: 120, width: 200, height: 40 },
                children: [{ id: "id1_t1", name: "T1", type: "TEXT", visible: true, characters: "variant" }],
              },
              {
                id: "id1_c2",
                name: "Cell_2",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 250, y: 120, width: 200, height: 40 },
                children: [{ id: "id1_t2", name: "T2", type: "TEXT", visible: true, characters: "'outlined' | 'filled'" }],
              },
              {
                id: "id1_c3",
                name: "Cell_3",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 450, y: 120, width: 200, height: 40 },
                children: [{ id: "id1_t3", name: "T3", type: "TEXT", visible: true, characters: "'outlined'" }],
              },
              {
                id: "id1_c4",
                name: "Cell_4",
                type: "FRAME",
                visible: true,
                absoluteBoundingBox: { x: 650, y: 120, width: 200, height: 40 },
                children: [{ id: "id1_t4", name: "T4", type: "TEXT", visible: true, characters: "표의 테두리 렌더링 스타일" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

