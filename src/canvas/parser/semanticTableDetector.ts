import {
  CanvasBounds,
  CanvasTableCell,
  CanvasTableData,
  CanvasTextRun,
} from "../types.js";
import { FigmaNode, FigmaColor } from "../../parser/types.js";

export interface DetectedTableResult {
  isTable: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  confidenceScore: number;
  reason: string;
  tableData?: CanvasTableData;
  bounds?: CanvasBounds;
  sourceNodeId?: string;
  sourceNodeType?: string;
  consumedNodeIds: Set<string>;
}

function figmaColorToHex(c?: FigmaColor): string {
  if (!c) return "000000";
  const r = Math.round((c.r ?? 0) * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round((c.g ?? 0) * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round((c.b ?? 0) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${r}${g}${b}`.toUpperCase();
}

/**
 * Recursively collects all text runs from a cell node.
 */
function extractCellTextRuns(node: FigmaNode, scale: number): CanvasTextRun[] {
  const runs: CanvasTextRun[] = [];

  const visit = (n: FigmaNode) => {
    if (n.visible === false) return;
    if (n.type === "TEXT" && n.characters) {
      const fs = (n.style?.fontSize || 12) * scale;
      const lh = n.style?.lineHeightPx ? n.style.lineHeightPx * scale : undefined;
      const ls = n.style?.letterSpacing ? n.style.letterSpacing * scale : undefined;
      const fwRaw = n.style?.fontWeight;
      let fw = 400;
      if (typeof fwRaw === "number") fw = fwRaw;
      else if (typeof fwRaw === "string") {
        if (fwRaw.toLowerCase() === "bold") fw = 700;
        else {
          const parsed = parseInt(fwRaw, 10);
          if (!isNaN(parsed)) fw = parsed;
        }
      }
      const italic = n.style?.italic || false;
      const underline = (n.style as any)?.textDecoration === "UNDERLINE";
      const strike = (n.style as any)?.textDecoration === "STRIKETHROUGH";

      let color = "000000";
      if (n.fills && n.fills.length > 0) {
        const solid = n.fills.find((f: any) => f.type === "SOLID" && f.visible !== false);
        if (solid && solid.color) {
          color = figmaColorToHex(solid.color);
        }
      }

      runs.push({
        text: n.characters,
        fontFamily: n.style?.fontFamily || "맑은 고딕",
        fontSizePt: Math.round(fs * 10) / 10,
        fontWeight: fw,
        italic,
        underline,
        strike,
        color: `#${color}`,
        lineHeightPt: lh ? Math.round(lh * 10) / 10 : undefined,
        letterSpacingPt: ls ? Math.round(ls * 100) / 100 : undefined,
      });
    }

    if (n.children) {
      for (const child of n.children) {
        visit(child);
      }
    }
  };

  visit(node);
  return runs;
}

/**
 * Extracts horizontal text alignment from a cell node.
 */
function extractCellTextAlign(node: FigmaNode): "left" | "center" | "right" | "justify" {
  let align: "left" | "center" | "right" | "justify" = "left";
  const visit = (n: FigmaNode) => {
    if (n.type === "TEXT" && n.style?.textAlignHorizontal) {
      const raw = n.style.textAlignHorizontal;
      if (raw === "CENTER") align = "center";
      else if (raw === "RIGHT") align = "right";
      else if (raw === "JUSTIFIED") align = "justify";
      else align = "left";
    }
    if (n.children) {
      for (const c of n.children) visit(c);
    }
  };
  visit(node);
  return align;
}

/**
 * Detects whether a Figma container represents a semantic data table,
 * rejecting non-table UI patterns (cards, metrics, forms, calendars, navigation).
 */
export function detectSemanticTable(
  container: FigmaNode,
  scaleX: number,
  scaleY: number,
  frameBox: { x: number; y: number; width: number; height: number },
): DetectedTableResult {
  const emptyResult: DetectedTableResult = {
    isTable: false,
    confidence: "LOW",
    confidenceScore: 0,
    reason: "Not a table",
    consumedNodeIds: new Set(),
  };

  if (!container || !container.children || container.children.length === 0) {
    return emptyResult;
  }

  // Containers must be structural nodes
  const validTypes = ["FRAME", "COMPONENT", "INSTANCE", "GROUP", "TABLE"];
  if (!validTypes.includes(container.type)) {
    return emptyResult;
  }

  const containerBox = container.absoluteBoundingBox;
  if (!containerBox || containerBox.width < 100 || containerBox.height < 50) {
    return emptyResult;
  }

  const visChildren = container.children.filter((c) => c.visible !== false);
  if (visChildren.length < 2) {
    return emptyResult;
  }

  const nameLower = (container.name || "").toLowerCase();
  const isExplicitTable =
    container.type === "TABLE" ||
    (container as any).isTable === true ||
    /\b(table|data-table|grid-table|datagrid|data-grid)\b/i.test(nameLower) ||
    nameLower.includes("표");

  // -------------------------------------------------------------
  // REJECTION 0: Macro Layout Containers (Sidebars, Content limiters, Dialogs, Pages)
  // -------------------------------------------------------------
  if (!isExplicitTable) {
    const isMacroLayout =
      /\b(panel|sidebar|limiter|wrapper|layout|screen|page|modal|dialog|window|drawer|view|container|body|content|header|navbar|nav|footer|grid-limiter)\b/i.test(
        nameLower,
      );
    if (isMacroLayout) {
      return { ...emptyResult, reason: "Macro layout container excluded from table detection" };
    }
  }

  // -------------------------------------------------------------
  // REJECTION 1: Calendar UI
  // 7 columns, day-of-week headers, numbers 1-31
  // -------------------------------------------------------------
  const isCalendarName =
    /\bcalendar\b/i.test(nameLower) ||
    nameLower.includes("달력") ||
    nameLower.includes("월간") ||
    nameLower.includes("주간");
  if (isCalendarName) {
    return { ...emptyResult, reason: "Calendar UI excluded from table detection" };
  }

  // -------------------------------------------------------------
  // REJECTION 2: Form UI (Labels, Input textboxes, Checkboxes, Buttons)
  // -------------------------------------------------------------
  const isFormName =
    /\b(form|login|signup|register)\b/i.test(nameLower) ||
    nameLower.includes("입력") ||
    nameLower.includes("로그인") ||
    nameLower.includes("회원가입");
  const hasButtonChild = visChildren.some((c) => {
    const cn = (c.name || "").toLowerCase();
    return (
      /\b(button|btn|submit)\b/i.test(cn) ||
      cn.includes("버튼") ||
      cn.includes("확인") ||
      cn.includes("취소") ||
      cn.includes("저장")
    );
  });
  if (isFormName && hasButtonChild) {
    return { ...emptyResult, reason: "Input form container excluded from table detection" };
  }

  // -------------------------------------------------------------
  // REJECTION 3: Dashboard Metric Cards (2-4 cards with large numbers)
  // -------------------------------------------------------------
  const isMetricCardRow =
    visChildren.length >= 2 &&
    visChildren.length <= 4 &&
    visChildren.every((c) => {
      const cBox = c.absoluteBoundingBox;
      if (!cBox) return false;
      // Cards have substantial width and height
      const isCardShape = cBox.width >= 100 && cBox.height >= 70;
      // Check if child has a large number (metric)
      let hasLargeMetricText = false;
      const checkText = (n: FigmaNode) => {
        if (n.type === "TEXT" && (n.style?.fontSize || 0) >= 20) {
          hasLargeMetricText = true;
        }
        if (n.children) n.children.forEach(checkText);
      };
      checkText(c);
      return isCardShape && hasLargeMetricText;
    });

  if (isMetricCardRow) {
    return { ...emptyResult, reason: "Dashboard metric card row excluded from table detection" };
  }

  // -------------------------------------------------------------
  // REJECTION 4: Product Card Grid / Gallery (Cards with large images)
  // -------------------------------------------------------------
  const hasLargeImagesInCards = visChildren.some((c) => {
    let hasBigImg = false;
    const checkImg = (n: FigmaNode) => {
      const b = n.absoluteBoundingBox;
      const isImg =
        n.type === "IMAGE" ||
        n.fills?.some((f: any) => f.type === "IMAGE") ||
        (n.name && /\b(image|img|photo|thumbnail|사진)\b/i.test(n.name));
      if (isImg && b && b.width >= 80 && b.height >= 80) {
        hasBigImg = true;
      }
      if (n.children) n.children.forEach(checkImg);
    };
    checkImg(c);
    return hasBigImg;
  });

  if (hasLargeImagesInCards && !isExplicitTable) {
    return { ...emptyResult, reason: "Image card grid/gallery excluded from table detection" };
  }

  // -------------------------------------------------------------
  // TABLE ANALYSIS
  // -------------------------------------------------------------
  let score = 0;
  if (isExplicitTable) {
    score += 60;
  }

  // Case A: Row-based table (AutoLayout vertical or stack of horizontal row frames)
  let candidateRows: FigmaNode[] = [];
  const layoutMode = (container as any).layoutMode;

  if (layoutMode === "VERTICAL" || visChildren.every((c) => c.type === "FRAME" || c.type === "GROUP" || c.type === "COMPONENT")) {
    // Check if children are stacked vertically
    const sortedByY = [...visChildren].sort((a, b) => {
      const ay = a.absoluteBoundingBox?.y ?? 0;
      const by = b.absoluteBoundingBox?.y ?? 0;
      return ay - by;
    });

    let isVerticalStack = true;
    for (let i = 0; i < sortedByY.length - 1; i++) {
      const b1 = sortedByY[i].absoluteBoundingBox;
      const b2 = sortedByY[i + 1].absoluteBoundingBox;
      if (b1 && b2 && b2.y < b1.y + b1.height * 0.5) {
        isVerticalStack = false;
        break;
      }
    }

    if (isVerticalStack && sortedByY.length >= 2) {
      candidateRows = sortedByY;
    }
  }

  if (candidateRows.length >= 2) {
    // -------------------------------------------------------------
    // GUARD A: Row Height Bounds
    // -------------------------------------------------------------
    const rowHeights = candidateRows.map((r) => r.absoluteBoundingBox?.height ?? 0);
    const avgRowHeight = rowHeights.reduce((a, b) => a + b, 0) / (rowHeights.length || 1);
    const maxRowHeight = Math.max(...rowHeights);
    const minRowHeight = Math.min(...rowHeights);

    if (!isExplicitTable && (avgRowHeight > 85 || maxRowHeight > 120 || minRowHeight < 12)) {
      return {
        ...emptyResult,
        reason: `Row heights outside tabular range: avg=${avgRowHeight.toFixed(1)}, max=${maxRowHeight.toFixed(1)}, min=${minRowHeight.toFixed(1)}`,
      };
    }

    // -------------------------------------------------------------
    // GUARD B: Row Width Consistency
    // -------------------------------------------------------------
    const rowWidths = candidateRows.map((r) => r.absoluteBoundingBox?.width ?? 0);
    const minRowWidth = Math.min(...rowWidths);
    const maxRowWidth = Math.max(...rowWidths);
    if (!isExplicitTable && maxRowWidth - minRowWidth > 40) {
      return {
        ...emptyResult,
        reason: `Inconsistent row widths: min=${minRowWidth}, max=${maxRowWidth}`,
      };
    }

    // -------------------------------------------------------------
    // GUARD C: Container Size Thresholds
    // -------------------------------------------------------------
    const containerWidthPt = containerBox.width * scaleX;
    const containerHeightPt = containerBox.height * scaleY;
    if (!isExplicitTable && containerWidthPt < 240) {
      return {
        ...emptyResult,
        reason: `Container dimensions inconsistent with data table: w=${containerWidthPt.toFixed(1)}pt, h=${containerHeightPt.toFixed(1)}pt`,
      };
    }

    // -------------------------------------------------------------
    // GUARD C2: Filter Panel / Selection Chip Group Rejection
    // -------------------------------------------------------------
    const isFilterOrSelectionName =
      /\b(filter|filter-group|selection)\b/i.test(nameLower) ||
      nameLower.includes("필터") ||
      nameLower.includes("조회") ||
      nameLower.includes("조건") ||
      nameLower.includes("진행상태") ||
      nameLower.includes("조회기간") ||
      nameLower.includes("검색조건") ||
      nameLower.includes("선택");
    if (!isExplicitTable && isFilterOrSelectionName) {
      return {
        ...emptyResult,
        reason: "Filter panel / selection chip group excluded from table detection",
      };
    }

    // Analyze rows for consistent column layout
    const rowCellCounts: number[] = [];
    const rowCellWidths: number[][] = [];
    const allRowCells: FigmaNode[][] = [];

    for (const row of candidateRows) {
      const rowChildren = (row.children || []).filter((c) => c.visible !== false);
      // Sort cells horizontally
      rowChildren.sort((a, b) => {
        const ax = a.absoluteBoundingBox?.x ?? 0;
        const bx = b.absoluteBoundingBox?.x ?? 0;
        return ax - bx;
      });

      rowCellCounts.push(rowChildren.length);
      rowCellWidths.push(rowChildren.map((c) => c.absoluteBoundingBox?.width ?? 0));
      allRowCells.push(rowChildren);
    }

    const maxCellsInRow = Math.max(...rowCellCounts);
    const minCellsInRow = Math.min(...rowCellCounts);

    // If rows have multiple cells and generally consistent column structure
    if (maxCellsInRow >= 2 && minCellsInRow >= 1) {
      // -------------------------------------------------------------
      // GUARD D: Form Field Detection (Label + Input)
      // -------------------------------------------------------------
      let formFieldRowCount = 0;
      for (const rowCells of allRowCells) {
        if (rowCells.length === 2) {
          const col1 = rowCells[0];
          const col2 = rowCells[1];
          const col1Text = extractCellTextRuns(col1, 1.0).map((t) => t.text).join(" ");
          const col2Text = extractCellTextRuns(col2, 1.0).map((t) => t.text).join(" ");
          const col2Name = (col2.name || "").toLowerCase();

          const col1IsLabel =
            /\b(필수|선택|이름|명칭|주소|목록|비밀번호|이메일|연락처|아이디|소속|직책|담당자)\b/.test(col1Text) ||
            col1Text.includes("*") ||
            col1Text.includes(":");

          const isInputByName = /\b(input|textfield|text-field|select|dropdown|date|picker|radio|check|box|field|edit|선택|입력|search)\b/i.test(col2Name);
          let col2HasBorder = false;
          if (col2.strokes && col2.strokes.length > 0) col2HasBorder = true;
          if (col2.children?.some((c) => c.strokes && c.strokes.length > 0)) col2HasBorder = true;

          const col2IsInputPlaceholder =
            col2Text.startsWith("예:") ||
            col2Text.includes("입력") ||
            col2Text.includes("검색") ||
            col2Text.includes("선택") ||
            col2Text.includes("placeholder");

          if (
            col1IsLabel ||
            isInputByName ||
            (col2HasBorder && col2IsInputPlaceholder) ||
            (col2HasBorder && col2Text.length === 0)
          ) {
            formFieldRowCount++;
          }
        }
      }
      if (!isExplicitTable && formFieldRowCount >= 2 && formFieldRowCount >= candidateRows.length * 0.4) {
        return {
          ...emptyResult,
          reason: "Form field layout (Label + Input) excluded from table detection",
        };
      }

      // -------------------------------------------------------------
      // GUARD D2: Chip Grid / Tag Group (e.g. Button matrix with short tokens)
      // -------------------------------------------------------------
      if (!isExplicitTable && candidateRows.length >= 3) {
        const allTexts = allRowCells.flatMap((r) =>
          r.map((c) =>
            extractCellTextRuns(c, 1.0)
              .map((t) => t.text)
              .join("")
              .trim(),
          ),
        );
        const validTexts = allTexts.filter((t) => t.length > 0);
        const allShort = validTexts.length >= 6 && validTexts.every((t) => t.length <= 4);
        if (allShort) {
          return {
            ...emptyResult,
            reason: "Chip / Tag button grid excluded from table detection",
          };
        }
      }

      // -------------------------------------------------------------
      // GUARD E: Cell Complexity (Descendants per cell)
      // -------------------------------------------------------------
      let totalCellDescendants = 0;
      let maxCellDescendants = 0;
      const countNodes = (n: FigmaNode): number => {
        let count = 1;
        if (n.children) {
          for (const c of n.children) count += countNodes(c);
        }
        return count;
      };

      let totalCellCount = 0;
      for (const rowCells of allRowCells) {
        for (const cell of rowCells) {
          totalCellCount++;
          const dCount = countNodes(cell);
          totalCellDescendants += dCount;
          if (dCount > maxCellDescendants) maxCellDescendants = dCount;
        }
      }

      const avgDescendantsPerCell = totalCellCount > 0 ? totalCellDescendants / totalCellCount : 0;
      if (!isExplicitTable && (avgDescendantsPerCell > 7 || maxCellDescendants > 14)) {
        return {
          ...emptyResult,
          reason: `Cell internal complexity too high for table: avg=${avgDescendantsPerCell.toFixed(1)}, max=${maxCellDescendants}`,
        };
      }

      const rowCount = candidateRows.length;
      score += 20;

      // Check column alignment consistency
      const mostFrequentCount = getMode(rowCellCounts);
      if (mostFrequentCount >= 2) {
        score += 20;
      }

      // Check text ratio in cells
      let totalCells = 0;
      let textDenseCells = 0;
      for (const rowCells of allRowCells) {
        for (const cell of rowCells) {
          totalCells++;
          const runs = extractCellTextRuns(cell, 1.0);
          if (runs.length > 0) textDenseCells++;
        }
      }

      const textRatio = totalCells > 0 ? textDenseCells / totalCells : 0;
      if (textRatio >= 0.7) {
        score += 25;
      }

      // Check header row distinction
      const headerRow = allRowCells[0];
      const dataRow = allRowCells[1];
      if (headerRow && dataRow && headerRow.length > 0 && dataRow.length > 0) {
        const headerFills = headerRow[0].fills || candidateRows[0].fills;
        const dataFills = dataRow[0].fills || candidateRows[1].fills;
        const headerHasBg = headerFills && headerFills.length > 0;
        const dataHasBg = dataFills && dataFills.length > 0;
        if (headerHasBg !== dataHasBg || (headerHasBg && dataHasBg)) {
          score += 15;
        }
      }

      // Name keyword bonus
      if (/\b(table|grid|표|목록|현황|내역|리스트)\b/i.test(nameLower)) {
        score += 15;
      }

      if (score >= 60) {
        // Build CanvasTableData
        const colCount = Math.max(2, mostFrequentCount || maxCellsInRow);

        // Find reference row with the most cells to determine canonical column widths
        const refRowIdx = rowCellCounts.findIndex((cnt) => cnt === colCount);
        const refCells = refRowIdx >= 0 ? allRowCells[refRowIdx] : allRowCells[0];

        const colWidthsPt: number[] = [];
        for (let c = 0; c < colCount; c++) {
          const wFigma = refCells[c]?.absoluteBoundingBox?.width ?? (containerBox.width / colCount);
          colWidthsPt.push(Math.round(wFigma * scaleX * 10) / 10);
        }

        const rowHeightsPt: number[] = [];
        for (let r = 0; r < rowCount; r++) {
          const hFigma = candidateRows[r].absoluteBoundingBox?.height ?? (containerBox.height / rowCount);
          rowHeightsPt.push(Math.round(hFigma * scaleY * 10) / 10);
        }

        const consumedNodeIds = new Set<string>();
        consumedNodeIds.add(container.id);

        const cellsMatrix: CanvasTableCell[][] = [];

        // Determine baseline column starting positions in Figma coordinates
        const colStartXFigma: number[] = [refCells[0]?.absoluteBoundingBox?.x ?? containerBox.x];
        for (let c = 0; c < colCount - 1; c++) {
          const curW = refCells[c]?.absoluteBoundingBox?.width ?? (containerBox.width / colCount);
          colStartXFigma.push(colStartXFigma[c] + curW);
        }

        for (let r = 0; r < rowCount; r++) {
          const rowNode = candidateRows[r];
          consumedNodeIds.add(rowNode.id);
          const rowCells = allRowCells[r];
          const rowResultCells: CanvasTableCell[] = [];

          let colCursor = 0;
          for (let cIdx = 0; cIdx < rowCells.length && colCursor < colCount; cIdx++) {
            const cellNode = rowCells[cIdx];
            consumedNodeIds.add(cellNode.id);

            // Add all descendants of cellNode to consumedNodeIds
            const markDescendants = (n: FigmaNode) => {
              consumedNodeIds.add(n.id);
              if (n.children) n.children.forEach(markDescendants);
            };
            markDescendants(cellNode);

            const cellBox = cellNode.absoluteBoundingBox || {
              x: containerBox.x,
              y: containerBox.y,
              width: containerBox.width / colCount,
              height: containerBox.height / rowCount,
            };

            // Calculate colSpan by comparing cell width to column widths
            let colSpan = 1;
            let spannedWidthPt = colWidthsPt[colCursor] || 50;
            const cellWidthPt = cellBox.width * scaleX;

            while (
              colCursor + colSpan < colCount &&
              cellWidthPt > spannedWidthPt + (colWidthsPt[colCursor + colSpan] || 50) * 0.6
            ) {
              spannedWidthPt += colWidthsPt[colCursor + colSpan] || 50;
              colSpan++;
            }

            // Cell styling
            let cellBgColor: string | undefined;
            const fills = cellNode.fills || rowNode.fills;
            if (fills && fills.length > 0) {
              const solid = fills.find((f: any) => f.type === "SOLID" && f.visible !== false);
              if (solid && solid.color) {
                cellBgColor = `#${figmaColorToHex(solid.color)}`;
              }
            }

            let cellBorderColor = "#D0D5DD";
            let cellBorderWidth = 1;
            const strokes = cellNode.strokes || rowNode.strokes;
            if (strokes && strokes.length > 0) {
              const solidStroke = strokes.find((s: any) => s.type === "SOLID" && s.visible !== false);
              if (solidStroke && solidStroke.color) {
                cellBorderColor = `#${figmaColorToHex(solidStroke.color)}`;
              }
              const sw = (cellNode as any).strokeWeight ?? (rowNode as any).strokeWeight;
              if (typeof sw === "number") {
                cellBorderWidth = Math.max(0.5, Math.round(sw * scaleX * 10) / 10);
              }
            }

            const textRuns = extractCellTextRuns(cellNode, scaleX);
            const align = extractCellTextAlign(cellNode);

            rowResultCells.push({
              row: r,
              col: colCursor,
              colSpan: colSpan > 1 ? colSpan : undefined,
              rowSpan: 1,
              widthPt: Math.round(spannedWidthPt * 10) / 10,
              heightPt: rowHeightsPt[r] || 35,
              backgroundColor: cellBgColor,
              borderColor: cellBorderColor,
              borderWidth: cellBorderWidth,
              textRuns,
              align,
              verticalAlign: "center",
            });

            colCursor += colSpan;
          }

          cellsMatrix.push(rowResultCells);
        }

        const tableBounds: CanvasBounds = {
          x: (containerBox.x - frameBox.x) * scaleX,
          y: (containerBox.y - frameBox.y) * scaleY,
          width: containerBox.width * scaleX,
          height: containerBox.height * scaleY,
        };

        const tableData: CanvasTableData = {
          rowCount,
          colCount,
          colWidthsPt,
          rowHeightsPt,
          cells: cellsMatrix,
        };

        return {
          isTable: true,
          confidence: "HIGH",
          confidenceScore: score,
          reason: `AutoLayout/Stacked row table recognized with ${rowCount} rows and ${colCount} cols`,
          tableData,
          bounds: tableBounds,
          sourceNodeId: container.id,
          sourceNodeType: container.type,
          consumedNodeIds,
        };
      }
    }
  }

  return {
    ...emptyResult,
    confidenceScore: score,
    reason: `Confidence score (${score}) below threshold (60)`,
  };
}

function getMode(arr: number[]): number {
  if (arr.length === 0) return 0;
  const counts = new Map<number, number>();
  let maxCount = 0;
  let mode = arr[0];
  for (const n of arr) {
    const c = (counts.get(n) || 0) + 1;
    counts.set(n, c);
    if (c > maxCount) {
      maxCount = c;
      mode = n;
    }
  }
  return mode;
}
