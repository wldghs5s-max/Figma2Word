import {
  CanvasBounds,
  CanvasTableCell,
  CanvasTableData,
  CanvasTextRun,
} from "../types.js";
import { FigmaNode, FigmaColor } from "../../parser/types.js";

export interface CellContentClassification {
  hasText: boolean;
  textCount: number;
  totalTextLength: number;
  hasImage: boolean;
  hasVectorIcon: boolean;
  hasCheckboxOrControl: boolean;
  hasUnsupportedShapes: boolean;
  isLosslessInNativeTable: boolean;
  lossReason?: string;
  consumedDescendantIds: Set<string>;
}

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
 * Recursively collects paragraphs of text runs from a cell node.
 */
function extractCellParagraphs(node: FigmaNode, scale: number): CanvasTextRun[][] {
  const paragraphs: CanvasTextRun[][] = [];

  const visit = (n: FigmaNode) => {
    if (n.visible === false) return;
    if (n.type === "TEXT" && n.characters) {
      const runs = extractCellTextRuns(n, scale);
      if (runs.length > 0) {
        paragraphs.push(runs);
      }
    } else if (n.children) {
      for (const child of n.children) {
        visit(child);
      }
    }
  };

  visit(node);
  return paragraphs;
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
 * Track A: Classifies all contents inside a cell to verify whether it can be
 * represented losslessly in a native table cell (text, background, border)
 * or requires atomic fallback to preserve graphical objects (images, icons, checkboxes, shapes).
 */
export function classifyCellContent(cellNode: FigmaNode, scale: number): CellContentClassification {
  let hasText = false;
  let textCount = 0;
  let totalTextLength = 0;
  let hasImage = false;
  let hasVectorIcon = false;
  let hasCheckboxOrControl = false;
  let hasUnsupportedShapes = false;
  let lossReason: string | undefined;

  const consumedDescendantIds = new Set<string>();
  const cellBox = cellNode.absoluteBoundingBox;

  const visit = (n: FigmaNode, isRoot: boolean) => {
    if (n.visible === false) return;

    if (!isRoot) {
      consumedDescendantIds.add(n.id);
    }

    // 1. Image check
    if (n.type === "IMAGE") {
      hasImage = true;
      lossReason = `Cell contains Image node (${n.name || n.id})`;
    }
    if (n.fills && n.fills.length > 0) {
      const imgFill = n.fills.find(
        (f: any) => f.type === "IMAGE" && f.visible !== false && (f.imageRef || f.url),
      );
      if (imgFill) {
        hasImage = true;
        lossReason = `Cell node contains Image fill (${n.name || n.id})`;
      }
    }

    // 2. Text check
    if (n.type === "TEXT" && n.characters) {
      hasText = true;
      textCount++;
      totalTextLength += n.characters.length;
    }

    // 3. Vector / Icon check
    if (
      n.type === "VECTOR" ||
      n.type === "BOOLEAN_OPERATION" ||
      n.type === "STAR" ||
      n.type === "POLYGON"
    ) {
      // Check if this is just an underline or cell divider line (thickness <= 2)
      const b = n.absoluteBoundingBox;
      const isDivider =
        b &&
        cellBox &&
        ((b.height <= 2.5 && b.width >= cellBox.width * 0.7) ||
          (b.width <= 2.5 && b.height >= cellBox.height * 0.7));
      if (!isDivider) {
        hasVectorIcon = true;
        lossReason = `Cell contains Vector/Icon node (${n.name || n.id})`;
      }
    }

    // 4. Checkbox / Control check
    const nName = (n.name || "").toLowerCase();
    const isControlName =
      /\b(checkbox|check_box|radio|toggle|switch)\b/i.test(nName) ||
      nName.includes("체크박스");
    const b = n.absoluteBoundingBox;
    const isControlSize =
      b && b.width >= 10 && b.width <= 32 && b.height >= 10 && b.height <= 32;
    if (
      isControlName ||
      (isControlSize &&
        !isRoot &&
        (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE") &&
        (n.strokes?.length || n.fills?.length))
    ) {
      if (
        isControlName ||
        n.children?.some(
          (c) => c.type === "VECTOR" || (c.name || "").toLowerCase().includes("check"),
        )
      ) {
        hasCheckboxOrControl = true;
        lossReason = `Cell contains Checkbox/Control (${n.name || n.id})`;
      }
    }

    // 5. Unsupported shapes check
    if (n.type === "ELLIPSE") {
      hasUnsupportedShapes = true;
      lossReason = `Cell contains Ellipse shape (${n.name || n.id})`;
    }

    if (n.type === "RECTANGLE" && !isRoot) {
      if (b && cellBox) {
        const coversCell =
          b.width >= cellBox.width * 0.85 && b.height >= cellBox.height * 0.85;
        if (!coversCell) {
          if (
            b.width < cellBox.width * 0.5 &&
            b.height < cellBox.height * 0.5 &&
            (n.fills?.length || n.strokes?.length)
          ) {
            hasUnsupportedShapes = true;
            lossReason = `Cell contains standalone graphical shape (${n.name || n.id})`;
          }
        }
      }
    }

    if (n.children) {
      for (const child of n.children) {
        visit(child, false);
      }
    }
  };

  visit(cellNode, true);

  const isLosslessInNativeTable =
    !hasImage && !hasVectorIcon && !hasCheckboxOrControl && !hasUnsupportedShapes;

  return {
    hasText,
    textCount,
    totalTextLength,
    hasImage,
    hasVectorIcon,
    hasCheckboxOrControl,
    hasUnsupportedShapes,
    isLosslessInNativeTable,
    lossReason,
    consumedDescendantIds,
  };
}

function getMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Track B & C: Structural check to distinguish macro screen/layout wrappers
 * from real data tables based on relative dimensions, row height disparity,
 * and page proportions rather than brittle name lists.
 */
function checkStructuralMacroLayout(
  container: FigmaNode,
  candidateRows: FigmaNode[],
  frameBox: { width: number; height: number },
): { isMacro: boolean; reason?: string } {
  const cBox = container.absoluteBoundingBox;
  if (!cBox) return { isMacro: false };

  // 1. Extreme Page Coverage with small row count (Screen wrapper)
  const coversFullHeight = cBox.height >= frameBox.height * 0.68;
  const coversFullWidth = cBox.width >= frameBox.width * 0.82;
  if (coversFullHeight && coversFullWidth && candidateRows.length <= 3) {
    return {
      isMacro: true,
      reason: "Container covers full page area with <= 3 rows (page/screen layout wrapper)",
    };
  }

  // 2. Row Height Disparity (Heterogeneous layout sections vs uniform table rows)
  const rHeights = candidateRows
    .map((r) => r.absoluteBoundingBox?.height ?? 0)
    .filter((h) => h > 0);

  if (rHeights.length >= 2) {
    const maxH = Math.max(...rHeights);
    const medianH = getMedian(rHeights);
    if (medianH > 0 && maxH / medianH > 3.8) {
      return {
        isMacro: true,
        reason: `Extreme row height disparity: max=${maxH.toFixed(1)}, median=${medianH.toFixed(1)} (ratio ${(maxH / medianH).toFixed(1)} > 3.8)`,
      };
    }
  }

  // 3. Excessive average row height for table rows
  const avgH = rHeights.reduce((a, b) => a + b, 0) / (rHeights.length || 1);
  if (avgH > 160 || (cBox.height > frameBox.height * 0.45 && candidateRows.length <= 2)) {
    return {
      isMacro: true,
      reason: `Row height too large for tabular data: avg=${avgH.toFixed(1)}px`,
    };
  }

  return { isMacro: false };
}

/**
 * Track B & C: Evaluates geometric grid column alignment across rows.
 * In a real data table, column start positions align vertically across rows.
 */
function computeColumnTrackAlignment(allRowCells: FigmaNode[][], containerWidth: number): number {
  if (allRowCells.length < 2) return 0;
  const refRow = [...allRowCells].sort((a, b) => b.length - a.length)[0];
  if (!refRow || refRow.length < 2) return 0;
  const refStartXs = refRow.map((c) => c.absoluteBoundingBox?.x ?? 0);
  const tolerance = Math.max(12, containerWidth * 0.06);

  let totalChecked = 0;
  let alignedCount = 0;

  for (const row of allRowCells) {
    if (row === refRow) {
      totalChecked += row.length;
      alignedCount += row.length;
      continue;
    }
    for (const cell of row) {
      totalChecked++;
      const cellX = cell.absoluteBoundingBox?.x ?? 0;
      const matchesRef = refStartXs.some((refX) => Math.abs(cellX - refX) <= tolerance);
      if (matchesRef) alignedCount++;
    }
  }

  return totalChecked > 0 ? alignedCount / totalChecked : 0;
}

/**
 * Detects whether a Figma container represents a semantic data table,
 * rejecting non-table UI patterns (cards, metrics, forms, calendars, navigation).
 *
 * Implements Phase 44 Universal Content Preservation, Atomic Fallback,
 * Generalized Relative Geometry, and Robust RowSpan/ColSpan detection.
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
  if (!containerBox || containerBox.width < 80 || containerBox.height < 40) {
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
  // REJECTION 1: Calendar UI (7 columns with day-of-week headers / 1-31 numbers)
  // -------------------------------------------------------------
  const isCalendar =
    (/\bcalendar\b/i.test(nameLower) ||
      nameLower.includes("달력") ||
      nameLower.includes("월간") ||
      nameLower.includes("주간")) &&
    visChildren.length >= 5;
  if (isCalendar) {
    return { ...emptyResult, reason: "Calendar UI excluded from table detection" };
  }

  // -------------------------------------------------------------
  // REJECTION 2: Dashboard Metric Cards (2-4 cards with large typography > 20pt)
  // -------------------------------------------------------------
  const isMetricCardRow =
    visChildren.length >= 2 &&
    visChildren.length <= 4 &&
    visChildren.every((c) => {
      const cBox = c.absoluteBoundingBox;
      if (!cBox) return false;
      const isCardShape = cBox.width >= 100 && cBox.height >= 70;
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
  // REJECTION 3: Product Card Grid / Gallery (Cards with large images > 80px)
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
  // CANDIDATE ROWS ANALYSIS
  // -------------------------------------------------------------
  let candidateRows: FigmaNode[] = [];
  const layoutMode = (container as any).layoutMode;

  if (
    layoutMode === "VERTICAL" ||
    visChildren.every(
      (c) => c.type === "FRAME" || c.type === "GROUP" || c.type === "COMPONENT" || c.type === "INSTANCE",
    )
  ) {
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

  if (candidateRows.length < 2) {
    return emptyResult;
  }

  // -------------------------------------------------------------
  // GUARD A: Structural Macro Layout Exclusion (Track B & C)
  // -------------------------------------------------------------
  if (!isExplicitTable) {
    const macroCheck = checkStructuralMacroLayout(container, candidateRows, frameBox);
    if (macroCheck.isMacro) {
      return {
        ...emptyResult,
        reason: macroCheck.reason || "Macro screen/layout container excluded",
      };
    }
  }

  // -------------------------------------------------------------
  // GUARD B: Relative Row Width Consistency
  // -------------------------------------------------------------
  const rowWidths = candidateRows.map((r) => r.absoluteBoundingBox?.width ?? 0);
  const minRowWidth = Math.min(...rowWidths);
  const maxRowWidth = Math.max(...rowWidths);
  const widthVarianceRatio = (maxRowWidth - minRowWidth) / Math.max(1, containerBox.width);
  if (!isExplicitTable && widthVarianceRatio > 0.15 && maxRowWidth - minRowWidth > 35) {
    return {
      ...emptyResult,
      reason: `Inconsistent row widths: variance ratio=${(widthVarianceRatio * 100).toFixed(1)}%`,
    };
  }

  // -------------------------------------------------------------
  // GUARD C: Container Size Thresholds (Relative & Generalized)
  // -------------------------------------------------------------
  const containerWidthPt = containerBox.width * scaleX;
  if (!isExplicitTable && containerWidthPt < 120) {
    return {
      ...emptyResult,
      reason: `Container width too small for data table: ${containerWidthPt.toFixed(1)}pt`,
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
  if (maxCellsInRow < 2 || minCellsInRow < 1) {
    return {
      ...emptyResult,
      reason: "Row structure lacks minimum column multiplicity (min cells < 1 or max cells < 2)",
    };
  }

  // -------------------------------------------------------------
  // GUARD D: Form Field Layout Detection (Label on left, Input on right)
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

      const isInputByName =
        /\b(input|textfield|text-field|select|dropdown|date|picker|radio|check|box|field|edit|선택|입력|search)\b/i.test(
          col2Name,
        );
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
  // GUARD D2: Chip Grid / Tag Button Matrix / Selection Groups
  // -------------------------------------------------------------
  const hasSelectAll = allRowCells.some((row) =>
    row.some((cell) => {
      const text = extractCellTextRuns(cell, 1.0).map((r) => r.text).join("");
      return text.includes("전체 선택") || text.includes("전체선택") || /select\s*all/i.test(text);
    }),
  );
  if (!isExplicitTable && hasSelectAll) {
    return {
      ...emptyResult,
      reason: "Selection / Filter group with 'Select All' control excluded from table detection",
    };
  }

  if (!isExplicitTable && candidateRows.length >= 2) {
    const allTexts = allRowCells.flatMap((r) =>
      r.map((c) =>
        extractCellTextRuns(c, 1.0)
          .map((t) => t.text)
          .join("")
          .trim(),
      ),
    );
    const validTexts = allTexts.filter((t) => t.length > 0);
    const allShort = validTexts.length >= 4 && validTexts.every((t) => t.length <= 4);
    if (allShort) {
      return {
        ...emptyResult,
        reason: "Chip / Tag button grid excluded from table detection",
      };
    }
  }

  // -------------------------------------------------------------
  // GUARD E: Grid Column Boundary Alignment (Track B & C)
  // -------------------------------------------------------------
  const gridAlignmentRatio = computeColumnTrackAlignment(allRowCells, containerBox.width);
  if (!isExplicitTable && gridAlignmentRatio < 0.65) {
    return {
      ...emptyResult,
      reason: `Column tracks do not align into a tabular grid (alignment=${(gridAlignmentRatio * 100).toFixed(1)}% < 65%)`,
    };
  }

  // -------------------------------------------------------------
  // TRACK A: CONTENT CLASSIFICATION & ATOMIC FALLBACK
  // Verify that all cell contents can be represented losslessly in native table cells.
  // If any cell contains images, vector icons, checkboxes, or unsupported graphics,
  // atomically fall back to standard element rendering with ZERO content loss.
  // -------------------------------------------------------------
  let hasLossyCell = false;
  let firstLossReason = "";

  for (const rowCells of allRowCells) {
    for (const cellNode of rowCells) {
      const classification = classifyCellContent(cellNode, scaleX);
      if (!classification.isLosslessInNativeTable) {
        hasLossyCell = true;
        firstLossReason = classification.lossReason || "Non-text cell content";
        break;
      }
    }
    if (hasLossyCell) break;
  }

  if (hasLossyCell) {
    return {
      ...emptyResult,
      reason: `Atomic Fallback: Candidate table contains non-text content in cells (${firstLossReason}). Falling back to preserve all original objects.`,
      consumedNodeIds: new Set(), // EMPTY: Nothing is consumed!
    };
  }

  // -------------------------------------------------------------
  // SCORING
  // -------------------------------------------------------------
  let score = 0;
  if (isExplicitTable) {
    score += 50;
  }

  // Structural score components
  score += 20; // Verified vertical row stack
  const mostFrequentCount = getMode(rowCellCounts);
  if (mostFrequentCount >= 2) {
    score += 20; // Column multiplicity consistency
  }
  if (gridAlignmentRatio >= 0.75) {
    score += 20; // High grid column coherence
  }

  // Text density ratio
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
    score += 15;
  }

  // Header row distinction
  const headerRow = allRowCells[0];
  const dataRow = allRowCells[1];
  if (headerRow && dataRow && headerRow.length > 0 && dataRow.length > 0) {
    const headerFills = headerRow[0].fills || candidateRows[0].fills;
    const dataFills = dataRow[0].fills || candidateRows[1].fills;
    const headerHasBg = headerFills && headerFills.length > 0;
    const dataHasBg = dataFills && dataFills.length > 0;
    if (headerHasBg !== dataHasBg || (headerHasBg && dataHasBg)) {
      score += 10;
    }
  }

  // Soft name hints
  if (/\b(table|grid|표|목록|현황|내역|리스트)\b/i.test(nameLower)) {
    score += 10;
  }
  if (/\b(sidebar|navbar|nav|header|footer)\b/i.test(nameLower)) {
    score -= 15;
  }

  if (score >= 60) {
    // -------------------------------------------------------------
    // BUILD CanvasTableData & CONSUMED NODE IDS
    // -------------------------------------------------------------
    const rowCount = candidateRows.length;
    const colCount = Math.max(2, maxCellsInRow);

    // Find reference row with the most cells to determine canonical column widths
    const refRowIdx = rowCellCounts.findIndex((cnt) => cnt === colCount);
    const refCells = refRowIdx >= 0 ? allRowCells[refRowIdx] : allRowCells[0];

    const colWidthsPt: number[] = [];
    for (let c = 0; c < colCount; c++) {
      const wFigma = refCells[c]?.absoluteBoundingBox?.width ?? containerBox.width / colCount;
      colWidthsPt.push(Math.round(wFigma * scaleX * 10) / 10);
    }

    const rowHeightsPt: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      const hFigma = candidateRows[r].absoluteBoundingBox?.height ?? containerBox.height / rowCount;
      rowHeightsPt.push(Math.round(hFigma * scaleY * 10) / 10);
    }

    const consumedNodeIds = new Set<string>();
    consumedNodeIds.add(container.id);

    const cellsMatrix: CanvasTableCell[][] = [];
    const occupied: boolean[][] = Array.from({ length: rowCount }, () =>
      Array(colCount).fill(false),
    );

    for (let r = 0; r < rowCount; r++) {
      const rowNode = candidateRows[r];
      consumedNodeIds.add(rowNode.id);
      const rowCells = allRowCells[r];
      const rowResultCells: CanvasTableCell[] = [];

      let colCursor = 0;
      for (let cIdx = 0; cIdx < rowCells.length && colCursor < colCount; cIdx++) {
        while (colCursor < colCount && occupied[r][colCursor]) {
          colCursor++;
        }
        if (colCursor >= colCount) break;

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

        // Calculate rowSpan by comparing cell height to row heights (Track D)
        let rowSpan = 1;
        let spannedHeightPt = rowHeightsPt[r] || 35;
        const cellHeightPt = cellBox.height * scaleY;

        while (
          r + rowSpan < rowCount &&
          cellHeightPt > spannedHeightPt + (rowHeightsPt[r + rowSpan] || 35) * 0.6
        ) {
          spannedHeightPt += rowHeightsPt[r + rowSpan] || 35;
          rowSpan++;
        }

        // Mark occupied matrix for all covered cells
        for (let dr = 0; dr < rowSpan && r + dr < rowCount; dr++) {
          for (let dc = 0; dc < colSpan && colCursor + dc < colCount; dc++) {
            occupied[r + dr][colCursor + dc] = true;
          }
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
        const paragraphs = extractCellParagraphs(cellNode, scaleX);
        const align = extractCellTextAlign(cellNode);

        rowResultCells.push({
          row: r,
          col: colCursor,
          colSpan: colSpan > 1 ? colSpan : undefined,
          rowSpan: rowSpan > 1 ? rowSpan : undefined,
          widthPt: Math.round(spannedWidthPt * 10) / 10,
          heightPt: Math.round(spannedHeightPt * 10) / 10,
          backgroundColor: cellBgColor,
          borderColor: cellBorderColor,
          borderWidth: cellBorderWidth,
          textRuns,
          paragraphs: paragraphs.length > 1 ? paragraphs : undefined,
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
