import { describe, it, expect } from "vitest";
import {
  TARGET_17_FRAME_IDS,
  validateAndExtractTargetFrames,
  validateCanvasIrPageMapping,
  FrameMappingSpec,
} from "../src/fidelity/nodeIdMapper.js";
import {
  evaluateMeasurementIntegrity,
  MeasurementBundle,
} from "../src/fidelity/integrityGate.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 35.2: Node-ID-Centric Mapping and Integrity Gate Tests", () => {
  // Synthetic test fixture with a subset of nodes
  const mockFigmaDoc = {
    figmaNode: {
      id: "0:0",
      type: "CANVAS",
      name: "Mock Canvas",
      children: [
        {
          id: "763:5068",
          name: "디자인 시스템 1",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [],
        },
        {
          id: "766:256",
          name: "디자인 시스템 2",
          type: "FRAME",
          absoluteBoundingBox: { x: 1920, y: 0, width: 1920, height: 1080 },
          children: [],
        },
        {
          id: "757:88",
          name: "Desktop - 1",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 1080, width: 1440, height: 1024 },
          children: [],
        },
      ],
    },
  };

  const sampleSpecs: FrameMappingSpec[] = [
    { pageNumber: 1, nodeId: "763:5068", frameName: "디자인 시스템 1", expectedDimensions: { width: 1920, height: 1080 } },
    { pageNumber: 2, nodeId: "766:256", frameName: "디자인 시스템 2", expectedDimensions: { width: 1920, height: 1080 } },
    { pageNumber: 3, nodeId: "757:88", frameName: "Desktop - 1", expectedDimensions: { width: 1440, height: 1024 } },
  ];

  const targetIdsSubset = ["763:5068", "766:256", "757:88"] as const;

  it("1. Successfully validates and extracts frames when all target nodeIds match", () => {
    const res = validateAndExtractTargetFrames(mockFigmaDoc, targetIdsSubset, sampleSpecs);
    expect(res.valid).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(res.mappedFrames).toHaveLength(3);
    expect(res.mappedFrames[0].nodeId).toBe("763:5068");
    expect(res.mappedFrames[1].nodeId).toBe("766:256");
    expect(res.mappedFrames[2].nodeId).toBe("757:88");
  });

  it("2. Negative Test: Detects missing target nodeId in Figma JSON", () => {
    const incompleteDoc = {
      figmaNode: {
        id: "0:0",
        type: "CANVAS",
        children: [
          { id: "763:5068", name: "디자인 시스템 1", type: "FRAME" },
          // 766:256 missing
          { id: "757:88", name: "Desktop - 1", type: "FRAME" },
        ],
      },
    };
    const res = validateAndExtractTargetFrames(incompleteDoc, targetIdsSubset);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.includes("MAPPING_FAIL_MISSING_NODE"))).toBe(true);
    expect(res.violations.some((v) => v.includes("766:256"))).toBe(true);
  });

  it("3. Negative Test: Detects duplicate target nodeId in target list", () => {
    const duplicateIds = ["763:5068", "766:256", "763:5068"];
    const res = validateAndExtractTargetFrames(mockFigmaDoc, duplicateIds);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.includes("MAPPING_FAIL_DUPLICATE_TARGET"))).toBe(true);
  });

  it("4. Negative Test: Detects frame dimension mismatch against spec", () => {
    const badSpecs: FrameMappingSpec[] = [
      { pageNumber: 1, nodeId: "763:5068", frameName: "디자인 시스템 1", expectedDimensions: { width: 800, height: 600 } }, // mismatched!
    ];
    const res = validateAndExtractTargetFrames(mockFigmaDoc, ["763:5068"], badSpecs);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.includes("MAPPING_FAIL_DIMENSION_MISMATCH"))).toBe(true);
  });

  it("5. Negative Test: Detects Canvas IR page frameId mismatch or reordering", () => {
    const mockDoc: CanvasDocument = {
      title: "Test",
      pageSize: { name: "Custom", widthPt: 1440, heightPt: 810, unit: "pt" },
      marginsPt: { top: 0, right: 0, bottom: 0, left: 0 },
      pages: [
        { pageNumber: 1, name: "P1", frameId: "766:256", bounds: { x: 0, y: 0, width: 1440, height: 810 }, elements: [] }, // Wrong order!
        { pageNumber: 2, name: "P2", frameId: "763:5068", bounds: { x: 0, y: 0, width: 1440, height: 810 }, elements: [] },
      ],
      resources: {},
      diagnostics: { notices: [], warnings: [] },
    };
    const res = validateCanvasIrPageMapping(mockDoc, ["763:5068", "766:256"]);
    expect(res.valid).toBe(false);
    expect(res.violations.some((v) => v.includes("MAPPING_FAIL_IR_ORDER_MISMATCH"))).toBe(true);
  });

  it("6. Negative Test (B-03): Rejects bundle when valid comparison count is zero", () => {
    const zeroValidBundle: MeasurementBundle = {
      mode: "real",
      inputJsonSha256: "a".repeat(64),
      baselineDocxSha256: "b1".repeat(32),
      improvedDocxSha256: "b2".repeat(32),
      baselinePdfSha256: "c1".repeat(32),
      improvedPdfSha256: "c2".repeat(32),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "759:1533",
          frameName: "Missing Node",
          status: "REFERENCE_MISSING_VERSION_UNVERIFIED",
          baselineSsim: null,
          baselineMae: null,
          baselineRmse: null,
          baselineMismatch: null,
          improvedSsim: null,
          improvedMae: null,
          improvedRmse: null,
          improvedMismatch: null,
          ssimDelta: null,
        },
      ],
      averages: {
        baselineSsim: null,
        improvedSsim: null,
        ssimDelta: null,
        baselineMae: null,
        improvedMae: null,
        baselineRmse: null,
        improvedRmse: null,
      },
    };

    const res = evaluateMeasurementIntegrity(zeroValidBundle, 16);
    expect(res.passed).toBe(false);
    expect(res.coverageStatus).toBe("NO_VALID_COMPARISONS");
    expect(res.violations.some((v) => v.includes("NO_VALID_COMPARISONS"))).toBe(true);
  });

  it("7. Partial comparison status returned when valid comparisons are below expected coverage", () => {
    const partialBundle: MeasurementBundle = {
      mode: "real",
      inputJsonSha256: "a".repeat(64),
      baselineDocxSha256: "b1".repeat(32),
      improvedDocxSha256: "b2".repeat(32),
      baselinePdfSha256: "c1".repeat(32),
      improvedPdfSha256: "c2".repeat(32),
      wordAutomationSucceeded: true,
      computedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          nodeId: "763:5068",
          frameName: "Page 1",
          status: "VALID_BENCHMARK",
          baselinePngPath: "out/b1.png",
          baselinePngSha256: "h1".repeat(32),
          improvedPngPath: "out/i1.png",
          improvedPngSha256: "h2".repeat(32),
          baselineSsim: 0.85,
          baselineMae: 10,
          baselineRmse: 15,
          baselineMismatch: 0.2,
          improvedSsim: 0.87,
          improvedMae: 9,
          improvedRmse: 14,
          improvedMismatch: 0.18,
          ssimDelta: 0.02,
        },
      ],
      averages: {
        baselineSsim: 0.85,
        improvedSsim: 0.87,
        ssimDelta: 0.02,
        baselineMae: 10,
        improvedMae: 9,
        baselineRmse: 15,
        improvedRmse: 14,
      },
    };

    const res = evaluateMeasurementIntegrity(partialBundle, 16); // Expected 16, got 1
    expect(res.passed).toBe(false);
    expect(res.coverageStatus).toBe("PARTIAL_VALID_COMPARISONS");
    expect(res.violations.some((v) => v.includes("PARTIAL_VALID_COMPARISONS"))).toBe(true);
  });
});

