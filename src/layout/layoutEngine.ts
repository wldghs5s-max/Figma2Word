import { FigmaNode, FigmaBoundingBox } from "../parser/types.js";

export interface LayoutEngineOptions {
  /**
   * Vertical distance tolerance in px to consider two non-overlapping nodes as being in the same row.
   * Default: 20px
   */
  rowYThreshold?: number;

  /**
   * Overlap padding tolerance in px when determining if a child is contained in a background shape.
   * Default: 8px
   */
  containmentTolerance?: number;
}

export class LayoutEngine {
  private rowYThreshold: number;
  private containmentTolerance: number;

  constructor(options?: LayoutEngineOptions) {
    this.rowYThreshold = options?.rowYThreshold ?? 20;
    this.containmentTolerance = options?.containmentTolerance ?? 8;
  }

  /**
   * Main entrypoint: Takes an array of raw Figma sibling nodes and transforms their
   * spatial relationships into structured containers (Row Clusters, Overlays, and Sizing Ratios).
   */
  public processNodes(nodes: FigmaNode[]): FigmaNode[] {
    if (nodes.length === 0) return nodes;

    // Guard: children of a row cluster must not be clustered again.
    // Width ratios still need to be computed for nested horizontal frames.
    if (nodes.some((n) => (n as any)._isRowCell)) {
      return nodes.map((n) => this.enrichSizingRatios(n));
    }

    let processed = nodes;

    if (nodes.length > 1) {
      // Step 1: Detect containment / overlay relationships (P1-2)
      const afterOverlay = this.foldContainedOverlays(processed);

      // Step 2: Detect horizontal row clusters for non-auto layout siblings (P1-1)
      processed = this.clusterHorizontalRows(afterOverlay);
    }

    // Step 3: Compute Auto Layout sizing ratios (P1-3)
    return processed.map((n) => this.enrichSizingRatios(n));
  }

  /**
   * P1-2: Detects if any background shape contains smaller sibling nodes within its bounding box,
   * folding them inside the background node as its children (forming a single Card/Box).
   */
  public foldContainedOverlays(nodes: FigmaNode[]): FigmaNode[] {
    const result: FigmaNode[] = [];
    const absorbedIds = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const parentCandidate = nodes[i];
      if (absorbedIds.has(parentCandidate.id)) continue;

      const pBox = parentCandidate.absoluteBoundingBox;
      // Potential background container: RECTANGLE or FRAME with a visible paint and bounding box
      const isContainerLike =
        !!pBox &&
        (parentCandidate.type === "RECTANGLE" || parentCandidate.type === "FRAME") &&
        this.hasVisibleFill(parentCandidate);

      if (!isContainerLike || !pBox) {
        result.push(parentCandidate);
        continue;
      }

      // Check if subsequent or sibling nodes are spatially inside this parentCandidate
      const containedChildren: FigmaNode[] = [];

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const candidate = nodes[j];
        if (absorbedIds.has(candidate.id)) continue;

        const cBox = candidate.absoluteBoundingBox;
        if (!cBox) continue;

        if (this.isGeometricallyContained(cBox, pBox, this.containmentTolerance)) {
          containedChildren.push(candidate);
          absorbedIds.add(candidate.id);
        }
      }

      if (containedChildren.length > 0) {
        // Infer layout direction based on actual spatial relations of contained children
        let inferredLayoutMode: "HORIZONTAL" | "VERTICAL" = "VERTICAL";
        if (parentCandidate.layoutMode === "HORIZONTAL" || parentCandidate.layoutMode === "VERTICAL") {
          inferredLayoutMode = parentCandidate.layoutMode;
        } else if (this.isSingleHorizontalRow(containedChildren)) {
          inferredLayoutMode = "HORIZONTAL";
        }

        // Sort children according to inferred layout mode
        if (inferredLayoutMode === "HORIZONTAL") {
          containedChildren.sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0));
        } else {
          containedChildren.sort((a, b) => (a.absoluteBoundingBox?.y ?? 0) - (b.absoluteBoundingBox?.y ?? 0));
        }

        // Fold into parentCandidate with clean child marking
        const existingChildren = parentCandidate.children || [];
        const processedChildren = containedChildren.map((c) => ({
          ...c,
          _isContainedChild: true,
          _isRowCell: inferredLayoutMode === "HORIZONTAL" ? true : undefined,
        }));
        const mergedChildren = [...existingChildren, ...processedChildren];

        result.push({
          ...parentCandidate,
          type: "FRAME", // Convert rectangle to Frame so it acts as container
          layoutMode: inferredLayoutMode,
          _isFoldedContainer: true,
          children: mergedChildren,
        } as any);
      } else {
        result.push(parentCandidate);
      }
    }

    return result.filter((n) => !absorbedIds.has(n.id));
  }



  /**
   * P1-1: Clusters horizontally adjacent siblings into a single row Frame
   * if they share overlapping or proximate vertical bounds without horizontal collision.
   */
  public clusterHorizontalRows(nodes: FigmaNode[]): FigmaNode[] {
    // Only cluster nodes that have bounding boxes and are non-auto-layout siblings
    const sorted = [...nodes].sort((a, b) => {
      const aY = a.absoluteBoundingBox?.y ?? 0;
      const bY = b.absoluteBoundingBox?.y ?? 0;
      return aY - bY;
    });

    const result: FigmaNode[] = [];
    const clusteredIds = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      if (clusteredIds.has(current.id)) continue;

      const curBox = current.absoluteBoundingBox;

      // Skip nodes without bounding box or already clustered rows
      if (!curBox || (current as any)._isRowCluster) {
        result.push(current);
        clusteredIds.add(current.id);
        continue;
      }

      // Try to find subsequent sibling nodes that belong to the same horizontal row
      const rowCluster: FigmaNode[] = [current];

      for (let j = i + 1; j < sorted.length; j++) {
        const candidate = sorted[j];
        if (clusteredIds.has(candidate.id)) continue;

        const candBox = candidate.absoluteBoundingBox;
        if (!candBox || (candidate as any)._isRowCluster) continue;

        // If candidate's top is significantly below the current cluster's bottom, stop searching
        const maxClusterBottom = Math.max(...rowCluster.map((n) => n.absoluteBoundingBox!.y + n.absoluteBoundingBox!.height));
        if (candBox.y > maxClusterBottom + this.rowYThreshold + 40) {
          break;
        }

        if (this.canFormHorizontalRow(rowCluster, candidate)) {
          rowCluster.push(candidate);
          clusteredIds.add(candidate.id);
        }
      }

      if (rowCluster.length > 1) {
        // Sort columns from left to right (X ascending)
        rowCluster.sort((a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0));

        const columnWidths = this.toColumnPercents(
          rowCluster.map((n) => n.absoluteBoundingBox?.width ?? 0)
        );

        const minX = Math.min(...rowCluster.map((n) => n.absoluteBoundingBox!.x));
        const minY = Math.min(...rowCluster.map((n) => n.absoluteBoundingBox!.y));
        const maxX = Math.max(...rowCluster.map((n) => n.absoluteBoundingBox!.x + n.absoluteBoundingBox!.width));
        const maxY = Math.max(...rowCluster.map((n) => n.absoluteBoundingBox!.y + n.absoluteBoundingBox!.height));

        // Mark row members with _isRowCell so they don't recursively create row clusters inside themselves
        const processedCluster = rowCluster.map((n) => ({ ...n, _isRowCell: true }));

        const clusterFrame: FigmaNode = {
          id: `row-cluster-${current.id}`,
          name: `Row Cluster (${rowCluster.map((n) => n.name).join(" + ")})`,
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          children: processedCluster,
        };

        // Attach computed widths and row cluster marker
        (clusterFrame as any)._computedColumnWidths = columnWidths;
        (clusterFrame as any)._isRowCluster = true;

        result.push(clusterFrame);
        clusteredIds.add(current.id);
      } else {
        result.push(current);
        clusteredIds.add(current.id);
      }
    }

    return result;
  }



  /**
   * P1-3: Computes width percentage ratios for Auto Layout horizontal frames
   * by comparing child bounding box widths (Fixed vs Fill).
   * Operates at the current container level (subtrees are processed when visited by parser).
   */
  public enrichSizingRatios(node: FigmaNode): FigmaNode {
    if (node.layoutMode === "HORIZONTAL" && node.children && node.children.length > 1) {
      if ((node as any)._computedColumnWidths) {
        return node;
      }

      const validBoxes = node.children.every((c) => c.absoluteBoundingBox?.width);
      if (validBoxes) {
        const columnWidths = this.toColumnPercents(
          node.children.map((c) => c.absoluteBoundingBox?.width ?? 0)
        );
        if (columnWidths.length > 0) {
          (node as any)._computedColumnWidths = columnWidths;
        }
      }
    }
    return node;
  }

  /**
   * Convert raw pixel widths into positive percentages that add up to 100.
   * A hard minimum (for example 10%) can push the total over 100 and make the
   * last column negative, which Word rejects.
   */
  private toColumnPercents(rawWidths: number[]): number[] {
    if (rawWidths.length === 0) return [];

    const positive = rawWidths.map((width) => (Number.isFinite(width) && width > 0 ? width : 0));
    const total = positive.reduce((sum, width) => sum + width, 0);
    if (total <= 0) {
      const base = Math.max(1, Math.floor(100 / positive.length));
      const even = positive.map(() => base);
      let sum = even.reduce((left, right) => left + right, 0);
      let index = even.length - 1;
      while (sum > 100 && even.some((width) => width > 1)) {
        if (even[index] > 1) {
          even[index] -= 1;
          sum -= 1;
        }
        index = index === 0 ? even.length - 1 : index - 1;
      }
      if (sum < 100) even[even.length - 1] += 100 - sum;
      return even;
    }

    const exact = positive.map((width) => (width / total) * 100);
    const rounded = exact.map((width) => Math.max(1, Math.round(width)));
    let sum = rounded.reduce((left, right) => left + right, 0);
    let guard = 0;

    while (sum > 100 && guard < 500 && rounded.some((width) => width > 1)) {
      let index = 0;
      for (let i = 1; i < rounded.length; i++) {
        if (rounded[i] > rounded[index]) index = i;
      }
      if (rounded[index] <= 1) break;
      rounded[index] -= 1;
      sum -= 1;
      guard++;
    }

    while (sum < 100 && guard < 800) {
      let index = 0;
      let bestRemainder = -Infinity;
      for (let i = 0; i < exact.length; i++) {
        const remainder = exact[i] - rounded[i];
        if (remainder > bestRemainder) {
          bestRemainder = remainder;
          index = i;
        }
      }
      rounded[index] += 1;
      sum += 1;
      guard++;
    }

    return rounded;
  }

  private hasVisibleFill(node: FigmaNode): boolean {
    return (node.fills ?? []).some((fill) => fill.visible !== false && !!fill.type);
  }

  /**
   * Helper: Check if a child box is geometrically contained within a parent box.
   */
  private isGeometricallyContained(c: FigmaBoundingBox, p: FigmaBoundingBox, tol: number): boolean {
    const isInsideX = c.x >= p.x - tol && c.x + c.width <= p.x + p.width + tol;
    const isInsideY = c.y >= p.y - tol && c.y + c.height <= p.y + p.height + tol;
    // Child must be smaller than parent to avoid self-containment
    const isSmaller = c.width * c.height < p.width * p.height * 0.95;
    return isInsideX && isInsideY && isSmaller;
  }

  /**
   * Helper: Determines if candidate can join the existing horizontal row cluster.
   */
  private canFormHorizontalRow(cluster: FigmaNode[], candidate: FigmaNode): boolean {
    const cBox = candidate.absoluteBoundingBox;
    if (!cBox) return false;

    for (const member of cluster) {
      const mBox = member.absoluteBoundingBox;
      if (!mBox) return false;

      // Check vertical proximity / overlap
      const yDiff = Math.abs(mBox.y - cBox.y);
      const isYProximate = yDiff <= this.rowYThreshold;

      const vOverlapTop = Math.max(mBox.y, cBox.y);
      const vOverlapBottom = Math.min(mBox.y + mBox.height, cBox.y + cBox.height);
      const hasVerticalOverlap = vOverlapBottom - vOverlapTop > 10;

      if (!isYProximate && !hasVerticalOverlap) {
        return false;
      }

      // Check horizontal collision (must NOT collide horizontally on X)
      const hOverlapLeft = Math.max(mBox.x, cBox.x);
      const hOverlapRight = Math.min(mBox.x + mBox.width, cBox.x + cBox.width);
      if (hOverlapRight - hOverlapLeft > 5) {
        // Overlapping on X means they are stacked or overlayed, not side-by-side columns
        return false;
      }
    }

    return true;
  }

  /**
   * Helper: Checks if an array of nodes forms a single non-overlapping horizontal row (e.g. Header bar)
   */
  private isSingleHorizontalRow(nodes: FigmaNode[]): boolean {
    if (nodes.length <= 1) return false;
    const sortedByX = [...nodes].sort(
      (a, b) => (a.absoluteBoundingBox?.x ?? 0) - (b.absoluteBoundingBox?.x ?? 0)
    );

    for (let i = 0; i < sortedByX.length - 1; i++) {
      const a = sortedByX[i];
      const b = sortedByX[i + 1];
      const aBox = a.absoluteBoundingBox;
      const bBox = b.absoluteBoundingBox;
      if (!aBox || !bBox) return false;

      // X collision: a's right edge cannot collide past b's left edge
      if (aBox.x + aBox.width > bBox.x + 5) {
        return false;
      }

      // Vertical band overlap or proximity
      const yDiff = Math.abs(aBox.y - bBox.y);
      const vOverlapTop = Math.max(aBox.y, bBox.y);
      const vOverlapBottom = Math.min(aBox.y + aBox.height, bBox.y + bBox.height);
      const hasYOverlap =
        vOverlapBottom - vOverlapTop > 5 || yDiff <= this.rowYThreshold;
      if (!hasYOverlap) {
        return false;
      }
    }

    return true;
  }
}

