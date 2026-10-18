import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { CanvasDocument, CanvasElement } from "../src/canvas/types.js";
import { HwpxCanvasRenderer } from "../src/canvas/renderer/hwpxCanvasRenderer.js";

async function main() {
  console.log("=== FIGMA2WORD HWPX OVERLAP MRE GENERATOR ===");

  const raw = JSON.parse(fs.readFileSync("debug/customer/Report1-Live-Snapshot.json", "utf-8"));
  const parser = new FigmaCanvasParser();
  const fullDoc = parser.parse(raw);

  const p1Elements = fullDoc.pages[0].elements;
  const p2Elements = fullDoc.pages[1].elements;

  // IDs for Group 1 (Metric Cards) & Group 2 (Summary Card) on Page 1
  const p1TargetIds = [
    "7:978", // Card background
    "7:979", // Metric 1 card
    "7:980", // 균열밀도 (CDI) - single line label
    "7:981", // 0.031% - single line metric
    "7:982", // 안전 기준선 이하 - single line subtext
    "7:987", // Metric 2 card
    "7:988", // 정제 검출 균열 - single line label
    "7:989", // 1,248 개 - single line metric
    "7:990", // 노이즈 정제 완료 - single line subtext
    "7:995", // Summary card background
    "7:996", // Badge card
    "7:997", // A 등급 text
    "7:998", // Multi-line summary text
    "7:999", // Spacer / card below summary
  ];

  // IDs for Group 3 (Center-Aligned Banner) on Page 2
  const p2TargetIds = [
    "7:1080", // Banner card background
    "7:1081", // Icon
    "7:1082", // Center-aligned banner text
  ];

  const selectedP1 = p1Elements.filter(e => p1TargetIds.includes(e.id));
  const selectedP2 = p2Elements.filter(e => p2TargetIds.includes(e.id));

  // Diagnostic visual header for Page 1
  const p1Header: CanvasElement = {
    id: "diag:header:p1",
    name: "Diagnostic Header Page 1",
    type: "text",
    bounds: { x: 40.49, y: 40, width: 514.31, height: 24 },
    textAutoResize: "HEIGHT",
    verticalAlign: "top",
    style: { opacity: 1 },
    textRuns: [
      {
        text: "[MRE DIAGNOSTIC PAGE 1] 단일행 라벨/수치 충돌 (7:980 vs 7:981) 및 다중행 본문 (7:998)",
        fontSizePt: 11,
        fontFamily: "Inter",
        colorHex: "1E2022",
        bold: true,
      },
    ],
  };

  // Diagnostic visual header for Page 2
  const p2Header: CanvasElement = {
    id: "diag:header:p2",
    name: "Diagnostic Header Page 2",
    type: "text",
    bounds: { x: 40.49, y: 40, width: 514.31, height: 24 },
    textAutoResize: "HEIGHT",
    verticalAlign: "top",
    style: { opacity: 1 },
    textRuns: [
      {
        text: "[MRE DIAGNOSTIC PAGE 2] 중앙 정렬 배너 기하학 및 수직 정렬 왜곡 (7:1082)",
        fontSizePt: 11,
        fontFamily: "Inter",
        colorHex: "1E2022",
        bold: true,
      },
    ],
  };

  // Filter resources to avoid embedding unused 14MB images
  const usedResourceKeys = new Set<string>();
  for (const el of [...selectedP1, ...selectedP2]) {
    if (el.imageRef) usedResourceKeys.add(el.imageRef);
    if (el.style.fillImageRef) usedResourceKeys.add(el.style.fillImageRef);
  }
  const filteredResources: Record<string, any> = {};
  if (fullDoc.resources) {
    for (const [k, v] of Object.entries(fullDoc.resources)) {
      if (usedResourceKeys.has(k)) {
        filteredResources[k] = v;
      }
    }
  }

  const mreDoc: CanvasDocument = {
    id: "hwpx-overlap-mre-doc",
    title: "HWPX Overlap Root Cause Isolation MRE",
    version: "1.0",
    pageSize: {
      widthPt: 595.28,
      heightPt: 841.89,
      orientation: "portrait",
    },
    pages: [
      {
        pageNumber: 1,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: fullDoc.pages[0].backgroundColor || "FFFFFF",
        elements: [p1Header, ...selectedP1],
      },
      {
        pageNumber: 2,
        bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
        backgroundColor: fullDoc.pages[1].backgroundColor || "FFFFFF",
        elements: [p2Header, ...selectedP2],
      },
    ],
    resources: filteredResources,
  };

  const renderer = new HwpxCanvasRenderer();
  const baselineBuf = await renderer.renderToBuffer(mreDoc);

  const outDir = "debug/hwpx-overlap-mre";
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Save Baseline A
  fs.writeFileSync(path.join(outDir, "mre-A-baseline.hwpx"), baselineBuf);
  console.log(`Saved mre-A-baseline.hwpx (${baselineBuf.length} bytes)`);

  // Load baseline zip for mutations
  const zipA = await JSZip.loadAsync(baselineBuf);
  const sec0XmlA = await zipA.file("Contents/section0.xml")!.async("string");
  const hdrXmlA = await zipA.file("Contents/header.xml")!.async("string");

  // Helper to clone zip
  const cloneZip = async (zip: JSZip): Promise<JSZip> => {
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    return await JSZip.loadAsync(buf);
  };

  // Tracking diffs for variant-diff.json
  const diffs: Record<string, any> = {
    "mre-A-baseline": {
      description: "Current baseline produced by HwpxCanvasRenderer without modification.",
      isolatedVariable: "None (Control Group)",
      mutations: [],
    },
    "mre-B-wrap-only": {
      description: "Conditionally changes lineWrap from BREAK to SQUEEZE for single-line textboxes. Multi-line body paragraph (7:998) remains BREAK.",
      isolatedVariable: "lineWrap attribute on hp:subList in Contents/section0.xml",
      mutations: [],
    },
    "mre-C-lineheight-only": {
      description: "Changes fallback lineSpacing from PERCENT 160% to FIXED 1125 HWPUNIT (matching authentic Hancom standard).",
      isolatedVariable: "hh:lineSpacing in Contents/header.xml",
      mutations: [],
    },
    "mre-D-font-only": {
      description: "Changes fontRef mapping for HANGUL from Inter (font id 1) to Malgun Gothic (font id 0), matching DOCX East Asia dual-font model.",
      isolatedVariable: "hh:fontRef in Contents/header.xml",
      mutations: [],
    },
    "mre-E-geometry-only": {
      description: "Restores center-aligned banner (7:1082) box height from inflated 37.48 pt to authentic text geometry 11.99 pt with top vertical alignment.",
      isolatedVariable: "hp:rect dimensions and vertAlign on 7:1082 in Contents/section0.xml",
      mutations: [],
    },
    "mre-F-combined": {
      description: "Holistic combination of B (single-line SQUEEZE), C (authentic fixed lineSpacing 1125 HWPU), and D (Hangul font mapping).",
      isolatedVariable: "Combined B + C + D",
      mutations: [],
    },
  };

  // --- VARIANT B: Single-line lineWrap="SQUEEZE" ---
  // In section0.xml, find all <hp:drawText ... name="...">.
  // If the textbox is NOT the multi-line text (7:998), change lineWrap="BREAK" to lineWrap="SQUEEZE".
  let sec0XmlB = sec0XmlA;
  const multiLineSnippet = "전반적인 외벽 균열 상태는 안전 범주에 있습니다";
  
  // Regex to match drawText blocks
  const drawTextRegex = /(<hp:drawText[^>]*name="([^"]*)"[^>]*>[\s\S]*?<hp:subList[^>]*lineWrap=")(BREAK)("[\s\S]*?<\/hp:drawText>)/g;
  let wrapMutatedCount = 0;
  sec0XmlB = sec0XmlB.replace(drawTextRegex, (match, prefix, name, wrapVal, suffix) => {
    if (name.includes(multiLineSnippet) || match.includes(multiLineSnippet)) {
      // Keep BREAK for multi-line body
      return match;
    }
    wrapMutatedCount++;
    return `${prefix}SQUEEZE${suffix}`;
  });

  diffs["mre-B-wrap-only"].mutations.push({
    file: "Contents/section0.xml",
    target: "hp:subList lineWrap attribute",
    mutatedTextboxesCount: wrapMutatedCount,
    multiLineRetainedAsBreak: "7:998 (전반적인 외벽 균열 상태는...)",
    beforeSnippet: '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" ...>',
    afterSnippet: '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="SQUEEZE" ...>',
  });

  const zipB = await cloneZip(zipA);
  zipB.file("Contents/section0.xml", sec0XmlB);
  const bufB = await zipB.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(path.join(outDir, "mre-B-wrap-only.hwpx"), bufB);
  console.log(`Saved mre-B-wrap-only.hwpx (${bufB.length} bytes, mutated ${wrapMutatedCount} textboxes)`);

  // --- VARIANT C: Base line spacing changed from 160% to authentic FIXED 1125 HWPU ---
  let hdrXmlC = hdrXmlA;
  const lineSpacingRegex = /<hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"\/>/g;
  let lsMutatedCount = 0;
  hdrXmlC = hdrXmlC.replace(lineSpacingRegex, () => {
    lsMutatedCount++;
    return '<hh:lineSpacing type="FIXED" value="1125" unit="HWPUNIT"/>';
  });

  diffs["mre-C-lineheight-only"].mutations.push({
    file: "Contents/header.xml",
    target: "hh:lineSpacing on default paraPr (ids 0, 1, 2, 3)",
    mutatedParaPrCount: lsMutatedCount,
    beforeSnippet: '<hh:lineSpacing type="PERCENT" value="160" unit="PERCENT"/>',
    afterSnippet: '<hh:lineSpacing type="FIXED" value="1125" unit="HWPUNIT"/>',
  });

  const zipC = await cloneZip(zipA);
  zipC.file("Contents/header.xml", hdrXmlC);
  const bufC = await zipC.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(path.join(outDir, "mre-C-lineheight-only.hwpx"), bufC);
  console.log(`Saved mre-C-lineheight-only.hwpx (${bufC.length} bytes, mutated ${lsMutatedCount} paraPr)`);

  // --- VARIANT D: Korean font mapping changed to match DOCX (hangul="0" -> Malgun Gothic) ---
  let hdrXmlD = hdrXmlA;
  // In charPr, replace hangul="1" with hangul="0"
  const fontRefRegex = /(<hh:fontRef\s+hangul=")1(".*?\/>)/g;
  let fontMutatedCount = 0;
  hdrXmlD = hdrXmlD.replace(fontRefRegex, (match, prefix, suffix) => {
    fontMutatedCount++;
    return `${prefix}0${suffix}`;
  });

  diffs["mre-D-font-only"].mutations.push({
    file: "Contents/header.xml",
    target: "hh:fontRef hangul attribute across charPr entries",
    mutatedCharPrCount: fontMutatedCount,
    beforeSnippet: '<hh:fontRef hangul="1" latin="1" .../> (Font 1 = Inter)',
    afterSnippet: '<hh:fontRef hangul="0" latin="1" .../> (Font 0 = 맑은 고딕)',
  });

  const zipD = await cloneZip(zipA);
  zipD.file("Contents/header.xml", hdrXmlD);
  const bufD = await zipD.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(path.join(outDir, "mre-D-font-only.hwpx"), bufD);
  console.log(`Saved mre-D-font-only.hwpx (${bufD.length} bytes, mutated ${fontMutatedCount} charPr)`);

  // --- VARIANT E: Center-aligned banner (7:1082) geometry restored ---
  // Restore height from 3748 HWPU to 1199 HWPU, vertAlign from CENTER to TOP, and vertOffset centered in card (50978 HWPU)
  const bannerNameIdx = sec0XmlA.indexOf('품질 가공 단계');
  const rectStart = sec0XmlA.lastIndexOf('<hp:rect', bannerNameIdx);
  const rectEnd = sec0XmlA.indexOf('</hp:rect>', bannerNameIdx) + '</hp:rect>'.length;
  const fullRect = sec0XmlA.slice(rectStart, rectEnd);
  
  let mutatedRect = fullRect;
  mutatedRect = mutatedRect.replace(/height="3748"/g, 'height="1199"');
  mutatedRect = mutatedRect.replace(/y="3748"/g, 'y="1199"');
  mutatedRect = mutatedRect.replace(/centerY="1874"/g, 'centerY="600"');
  mutatedRect = mutatedRect.replace(/vertAlign="CENTER"/g, 'vertAlign="TOP"');
  mutatedRect = mutatedRect.replace(/vertOffset="49704"/g, 'vertOffset="50978"');
  
  const sec0XmlE = sec0XmlA.slice(0, rectStart) + mutatedRect + sec0XmlA.slice(rectEnd);

  diffs["mre-E-geometry-only"].mutations.push({
    file: "Contents/section0.xml",
    target: "7:1082 (품질 가공 단계) hp:rect geometry and alignment",
    beforeSnippet: '<hp:rect ... height="3748" ... vertAlign="CENTER" vertOffset="49704">',
    afterSnippet: '<hp:rect ... height="1199" ... vertAlign="TOP" vertOffset="50978">',
  });

  const zipE = await cloneZip(zipA);
  zipE.file("Contents/section0.xml", sec0XmlE);
  const bufE = await zipE.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(path.join(outDir, "mre-E-geometry-only.hwpx"), bufE);
  console.log(`Saved mre-E-geometry-only.hwpx (${bufE.length} bytes, restored 7:1082 geometry)`);

  // --- VARIANT F: Combined (B + C + D) ---
  const zipF = await cloneZip(zipA);
  zipF.file("Contents/section0.xml", sec0XmlB); // from B
  // Combine C and D on header.xml
  let hdrXmlF = hdrXmlC; // has C lineSpacing
  hdrXmlF = hdrXmlF.replace(fontRefRegex, (match, prefix, suffix) => `${prefix}0${suffix}`); // add D fontRef
  zipF.file("Contents/header.xml", hdrXmlF);

  diffs["mre-F-combined"].mutations.push(
    ...diffs["mre-B-wrap-only"].mutations,
    ...diffs["mre-C-lineheight-only"].mutations,
    ...diffs["mre-D-font-only"].mutations
  );

  const bufF = await zipF.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(path.join(outDir, "mre-F-combined.hwpx"), bufF);
  console.log(`Saved mre-F-combined.hwpx (${bufF.length} bytes, B+C+D combined)`);

  // Write variant-diff.json
  fs.writeFileSync(path.join(outDir, "variant-diff.json"), JSON.stringify(diffs, null, 2), "utf-8");
  console.log("Saved variant-diff.json");

  // Write README.md in debug/hwpx-overlap-mre/
  const readmeContent = `# HWPX Text Overlap Minimal Reproducible Example (MRE) Suite

## 1. 개요 및 목적
본 디렉토리의 파일들은 **한컴오피스 2024 뷰어에서 발생하는 HWPX 텍스트 겹침 현상의 4대 원인 가설을 과학적으로 분리 검증**하기 위한 최소 재현(MRE) 문서 모음입니다.

Stage 7 실제 고객 보고서(\`Report1-Live-Snapshot.json\`)에서 겹침 결함이 발생하는 대표 요소들을 정밀 추출하여 2페이지 진단 문서로 구성하였으며, 프로덕션 렌더러 코드는 일절 수정하지 않은 상태에서 XML 변이만을 통해 각 변수를 완전히 격리하였습니다.

---

## 2. 진단 페이지 구성
- **Page 1 [단일행 라벨/수치 및 다중행 요약]**
  - **단일행 지표 세트 1**: \`7:980\` ("균열밀도 (CDI)", 8.25pt) vs 직하단 \`7:981\` ("0.031%", 15.0pt, 세로 간격 6.0pt) vs \`7:982\` ("안전 기준선 이하")
  - **단일행 지표 세트 2**: \`7:988\` ("정제 검출 균열", 8.25pt) vs 직하단 \`7:989\` ("1,248 개", 15.0pt) vs \`7:990\` ("노이즈 정제 완료")
  - **다중행 본문 세트**: \`7:998\` ("전반적인 외벽 균열 상태는 안전 범주에 있습니다...") vs 배경 카드 \`7:995\` vs 직하단 객체 \`7:999\`
- **Page 2 [중앙 정렬 배너 기하학]**
  - **중앙 정렬 배너**: \`7:1082\` ("품질 가공 단계: AI 원검출 → 노이즈 제거 → 중첩 보정 → 정제 1,248개 기준") vs 배경 카드 \`7:1080\` vs 아이콘 \`7:1081\`

---

## 3. 실험 파일 목록 (A ~ F)

| 파일명 | 변이 변수 (Isolated Variable) | 대상 XML 속성 | 검증 가설 |
|---|---|---|---|
| **\`mre-A-baseline.hwpx\`** | **기준 대조군 (Control)** | 변경 없음 (현재 엔진 직렬화) | 현재 뷰어에서 7:980/7:981 충돌 및 7:1082 수직 왜곡 재현 |
| **\`mre-B-wrap-only.hwpx\`** | **조건부 \`lineWrap\`만 변이** | \`section0.xml\`의 단일행 \`hp:subList lineWrap="SQUEEZE"\`<br>*(다중행 7:998은 BREAK 유지)* | 단일행 폭 부족에 따른 2줄 강제 개행 및 직하단 수치 침범 차단 여부 검증 |
| **\`mre-C-lineheight-only.hwpx\`** | **기본 행간만 변이** | \`header.xml\`의 \`hh:lineSpacing\`을 \`PERCENT 160%\`에서 \`FIXED 1125 HWPUNIT\`로 변경 | 160% 과다 행간에 따른 수직 팽창 및 객체 하단 충돌 완화 여부 검증 |
| **\`mre-D-font-only.hwpx\`** | **한글 폰트 매핑만 변이** | \`header.xml\`의 \`charPr\` 한글 폰트를 \`Inter\`(font 1)에서 \`맑은 고딕\`(font 0)으로 바인딩 | 한글 글리프 폴백 및 자간/글자폭 계산 차이에 의한 개행 트리거 여부 검증 |
| **\`mre-E-geometry-only.hwpx\`** | **배너 기하학만 변이** | \`section0.xml\`의 \`7:1082\` 높이를 37.48pt에서 11.99pt로 복원, \`vertAlign="TOP"\`, 수직 중심 배치 | 프레임 높이와 텍스트 기하학 혼동으로 인한 수직 밀림 해소 검증 |
| **\`mre-F-combined.hwpx\`** | **종합 복합 처방 (B + C + D)** | \`SQUEEZE\`(B) + \`FIXED 1125\`(C) + \`맑은 고딕\`(D) | 3대 구조적 요인이 모두 해결되었을 때 완벽한 무충돌 렌더링 달성 여부 검증 |

---

## 4. 검증 체크리스트 (한컴오피스 2024 뷰어)

1. **\`mre-A-baseline.hwpx\` 확인**:
   - Page 1에서 "균열밀도 (CDI)"가 2줄로 꺾이면서 아래 "0.031%" 글자를 가리는지 확인.
   - Page 2에서 "품질 가공 단계..." 배너의 글자가 카드 아래쪽으로 치우쳐 보이는지 확인.
2. **\`mre-B-wrap-only.hwpx\` 확인**:
   - "균열밀도 (CDI)"가 한 줄로 수평 유지(자간 압축)되어 아래 "0.031%"와의 6pt 간격이 온전히 유지되는지 확인.
   - "전반적인 외벽 균열 상태..." 다중행 본문은 여전히 정상 개행되는지 확인.
3. **\`mre-C-lineheight-only.hwpx\` 확인**:
   - 행간이 160%에서 11.25pt(고정)로 줄어들었을 때 겹침이 완화되는지 확인.
4. **\`mre-D-font-only.hwpx\` 확인**:
   - 폰트가 맑은 고딕으로 정확히 바인딩되었을 때 텍스트 폭이 줄어들어 개행이 방지되는지 확인.
5. **\`mre-E-geometry-only.hwpx\` 확인**:
   - Page 2 배너의 텍스트가 카드 중앙에 깔끔하게 정렬되는지 확인.
6. **\`mre-F-combined.hwpx\` 확인**:
   - A의 모든 겹침/충돌 현상이 완전히 사라지고 상용 수준의 무결성을 보이는지 최종 판정.
`;

  fs.writeFileSync(path.join(outDir, "README.md"), readmeContent, "utf-8");
  console.log("Saved README.md in debug/hwpx-overlap-mre/");
}

main().catch(console.error);
