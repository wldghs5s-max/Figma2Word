# DOCX Structure Reverse Engineering Report
**Figma2Word — OpenXML 심층 분석 및 렌더링 엔진 구조 비교**

---

## 1. 개요 및 연구 배경

Figma2Word는 Figma 디자인을 편집 가능한 Microsoft Word(DOCX) 파일로 변환하는 엔진이다. 그러나 이전 버전(Step 11~12C)까지 생성된 DOCX 문서는 실제 A4 업무용 보고서(사업제안서, 진단보고서) 변환 시 심각한 시각적 불일치(수직 팽창, 줄바꿈 왜곡, 여백 왜곡, 카드 겹침)를 겪었다.

본 연구에서는 실제 전문 디자이너/작업자가 완성한 **정답 기준 DOCX**(`완성본-20261012/report-1차-진단-편집가능-Word보정-v3.docx`)와 **Figma2Word 기존 엔진 생성 DOCX**(`debug/quality-audit/live_generated/report-1차-정식개선.docx`)의 내부 OpenXML 패키지를 추출하여 정밀 비교 역공학을 수행하였다.

---

## 2. 정답 DOCX vs 기존 생성 DOCX 정량 비교표

다음은 `inspect_docx_openxml.py` 및 `inspect_vml.py`로 두 문서의 `word/document.xml`, `word/styles.xml`, `word/fonts/` 등을 전수 조사한 결과다.

| 분석 항목 | 인간 완성 정답 DOCX (`report-1차-Word보정-v3.docx`) | 기존 Figma2Word 생성 DOCX (`report-1차-정식개선.docx`) | 차이 원인 및 영향 |
| :--- | :--- | :--- | :--- |
| **파일 크기** | 약 9.96 MB (9,968,291 bytes) | 약 513 KB (525,487 bytes) | 정답 문서는 Inter, JetBrainsMono 등 17종 폰트 완전 임베딩 |
| **페이지 여백 (`w:pgMar`)** | **상/하/좌/우 0 dxa (0 mm)** | 상/하 5mm (284 dxa), 좌/우 8mm (454 dxa) | 정답 문서는 A4 전체를 100% 절대 2D 캔버스로 취급 |
| **페이지 본문 문단 (`w:body > w:p`)** | **정확히 9개** (9페이지 = 9문단) | 200개 이상의 유동 인라인 문단 | 정답 문서는 1페이지당 정확히 1개 앵커 문단으로 격리 |
| **페이지 분할 방식** | 각 문단 `w:pPr/w:pageBreakBefore` | 인라인 `w:br type="page"` | 정답 문서는 높이 누적으로 인한 의도치 않은 페이지 밀림 차단 |
| **테이블 개수 (`w:tbl`)** | **0개 (None)** | **144개** (최대 중첩 깊이 4단계) | 기존 엔진은 2D 배치를 모방하기 위해 중첩 표를 남용 |
| **텍스트박스 / 도형 개수** | **424개** (`v:rect` + `v:textbox`) | **0개** | 정답 문서는 모든 텍스트/카드를 절대좌표 도형으로 배치 |
| **위치 지정 방식** | `position:absolute; mso-position-*-relative:page` | 유동 플로우 테이블 (Flow Layout) | 정답 문서는 인쇄/마진/줄높이 영향 없이 절대좌표 고정 |
| **단위 체계** | 포인트 (`pt`, 1/72 inch) | dxa (1/20 pt) / EMU | 정답 문서는 Figma의 pt 좌표를 1:1로 직접 투영 |
| **인라인/앵커 Drawing** | `wp:anchor`: 0, `wp:inline`: 0 (VML `<w:pict>` 사용) | DrawingML 일부 사용 | 정답 문서는 Word/한글 호환성이 극대화된 VML 구조 채택 |
| **임베디드 폰트** | **17개 `.odttf` 파일** (Inter, Manrope 등) | **0개** (시스템 폰트 의존) | 정답 문서는 수신자 PC 환경과 무관하게 자간/행간 100% 동일 유지 |

---

## 3. 기존 엔진의 시각적 붕괴 원인 분석

### 3.1 1차원 플로우(Flow) 테이블 기반 레이아웃의 구조적 한계
기존 Figma2Word의 파이프라인(`FigmaParser` → `LayoutEngine` → `DocxRenderer`)은 Figma의 2D 절대좌표 트리(`x, y, width, height`)를 **Word 표준 표(`w:tbl`)**로 환원하여 변환했다.
- 카드 UI, 배지, 다단 텍스트를 표현하기 위해 1×1 표, 1×N 표를 생성하고, 이를 다시 상위 표 안에 중첩 삽입(최대 4단계 중첩).
- 그러나 Microsoft Word의 레이아웃 엔진은 브라우저(CSS Flex/Grid)와 전혀 다르다:
  1. **셀 패딩 누적 (`w:tcMar`)**: Word 표는 각 셀마다 기본 상하좌우 마진(기본 top/bottom 0~100 dxa, left/right 108~144 dxa)을 가진다. 중첩될수록 여백이 4배로 중첩되어 카드가 비정상적으로 팽창한다.
  2. **줄높이 및 폰트 메트릭 간섭**: 테이블 셀 내 텍스트 줄바꿈 시 기본 문단 간격(`w:spacing`)과 행간(`w:line`)이 셀 높이를 강제로 밀어낸다.
  3. **수직 팽창과 페이지 오버플로우**: 1개 페이지에 들어갈 내용이 1.3~1.5페이지로 늘어나면서 다음 페이지의 요소들이 뒤로 연쇄적으로 밀려나 전체 레이아웃이 붕괴된다.

---

## 4. 정답 DOCX가 채택한 절대 2D 캔버스 아키텍처

### 4.1 제로 마진 A4 캔버스 정의
정답 문서는 `word/document.xml`의 섹션 속성(`w:sectPr`)에서 용지 여백을 0으로 설정한다.
```xml
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
  <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
</w:sectPr>
```
- A4 크기: $11,906 \times 16,838\text{ dxa} = 595.3 \times 841.9\text{ pt} = 210 \times 297\text{ mm}$.
- 여백이 0이므로 문서 좌상단 끝점이 정확히 $(0, 0)$이 된다.

### 4.2 1페이지 = 1문단 앵커링 & 제로 행간
전체 9페이지 문서는 `w:body` 직하위에 오직 9개의 `<w:p>`만을 가진다.
```xml
<w:p>
  <w:pPr>
    <w:pageBreakBefore/>
    <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
    <w:autoSpaceDE w:val="0"/>
    <w:autoSpaceDN w:val="0"/>
  </w:pPr>
  <!-- 해당 페이지에 속한 모든 도형(40~200개)이 이 문단의 런(w:r) 안에 직렬화됨 -->
  <w:r><w:pict>...</w:pict></w:r>
  <w:r><w:pict>...</w:pict></w:r>
</w:p>
```
- `pageBreakBefore`: 이전 페이지 내용의 높이와 무관하게 무조건 새 페이지의 최상단에서 시작.
- `line="20" lineRule="exact"`: 문단 자체의 텍스트 줄높이를 1pt(20 dxa)로 강제 압축하여 인라인 플로우 공간을 0에 수렴시킴.

### 4.3 VML 절대좌표 박스 (`v:rect` + `v:textbox`)
각 텍스트, 카드, 배지, 분할선은 다음과 같이 완벽한 절대좌표와 크기를 가진다:
```xml
<w:pict>
  <v:rect id="s160"
          style="position:absolute;left:0;top:0;margin-left:482.250pt;margin-top:49.125pt;width:71.808pt;height:13.500pt;z-index:160;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none"
          filled="f"
          stroked="f">
    <v:textbox style="mso-fit-shape-to-text:f">
      <w:txbxContent>
        <w:p>
          <w:pPr><w:jc w:val="left"/></w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Inter" w:hAnsi="Inter"/>
              <w:sz w:val="18"/>
              <w:color w:val="2A3D80"/>
            </w:rPr>
            <w:t>외벽 안전진단 AI</w:t>
          </w:r>
        </w:p>
      </w:txbxContent>
    </v:textbox>
  </v:rect>
</w:pict>
```
- `margin-left: 482.250pt`: 페이지 좌측 끝(0)으로부터 정확한 X 위치.
- `margin-top: 49.125pt`: 페이지 상단 끝(0)으로부터 정확한 Y 위치.
- `width`, `height`: 정확한 너비와 높이.
- `mso-position-horizontal-relative: page`: 기준점을 여백이 아닌 **물리적 용지(Paper/Page)**로 설정.
- `z-index`: 레이어 계층 순서를 정수값으로 완벽히 보장.
- `w:txbxContent`: 텍스트박스 내부의 텍스트는 Word의 기본 문단/런 서식을 그대로 사용하여 **100% 네이티브 편집 가능**.

---

## 5. 결론 및 전환 방향

1. **테이블 레이아웃 완전 폐기**: 2D 카드 배치, 다단 레이아웃, 헤더/푸터에 `w:tbl`을 사용하는 기존 방식을 전면 중단해야 한다.
2. **절대 2D 캔버스 엔진 도입**: Figma의 프레임과 요소들을 절대좌표 $(x, y, w, h, z)$ 기반의 독립된 도형/글상자 단위로 변환해야 한다.
3. **완벽한 편집성과 시각 충실도의 양립**: VML `<v:textbox>`(또는 DrawingML `<wps:wsp>`)를 사용하면 텍스트는 완전히 편집 가능하면서도 레이아웃은 DTP 툴(Figma, InDesign) 수준의 픽셀 퍼펙트를 달성할 수 있다.

