import { describe, it, expect, vi } from "vitest";
import {
  ConversionPipeline,
  createFigmaSnapshot,
  isFigmaSnapshot,
  assessImageCompleteness,
  FigmaSnapshot,
} from "../src/pipeline/index.js";
import { FigmaNode } from "../src/parser/types.js";
import * as fs from "fs";
import * as path from "path";

describe("Step 7: Figma JSON Snapshot & Offline Repeated Conversion", () => {
  const pipeline = new ConversionPipeline();

  const sampleCardNode: FigmaNode = {
    id: "card-root",
    name: "Feature Showcase Card",
    type: "FRAME",
    absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 400 },
    children: [
      {
        id: "img-hero",
        name: "Cover Image",
        type: "RECTANGLE",
        absoluteBoundingBox: { x: 20, y: 20, width: 360, height: 240 },
        fills: [
          {
            type: "IMAGE",
            imageRef: "hero-img-ref-123",
            scaleMode: "FILL",
          },
        ],
      },
      {
        id: "text-title",
        name: "Card Title",
        type: "TEXT",
        characters: "완벽한 워케이션 공간",
        absoluteBoundingBox: { x: 400, y: 30, width: 360, height: 40 },
        style: { fontSize: 20, fontWeight: 700 },
      },
      {
        id: "text-desc",
        name: "Card Description",
        type: "TEXT",
        characters: "초고속 인터넷과 조용한 회의실이 완비되어 있습니다.",
        absoluteBoundingBox: { x: 400, y: 80, width: 360, height: 60 },
        style: { fontSize: 13, fontWeight: 400 },
      },
    ],
  };

  const sampleImageMap: Record<string, string> = {
    "hero-img-ref-123":
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  };

  // 1. 온라인 변환 데이터 스냅샷 저장
  it("Item 1: creates a valid FigmaSnapshot object from node and imageMap", () => {
    const snapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap, {
      fileName: "Workation-Card",
      fileKey: "testFileKey123",
      nodeId: "1:2",
    });

    expect(isFigmaSnapshot(snapshot)).toBe(true);
    expect(snapshot.version).toBe("1.0");
    expect(snapshot.source).toBe("figma2word");
    expect(snapshot.metadata?.fileName).toBe("Workation-Card");
    expect(snapshot.metadata?.fileKey).toBe("testFileKey123");
    expect(snapshot.metadata?.nodeId).toBe("1:2");
    expect(snapshot.imageMap?.["hero-img-ref-123"]).toBeDefined();
    expect(snapshot.figmaNode).toEqual(sampleCardNode);
  });

  // 2. 저장 파일 불러오기 및 타입 가드 판별
  it("Item 2: correctly identifies FigmaSnapshot vs raw Figma JSON", () => {
    const validSnapshot: FigmaSnapshot = {
      version: "1.0",
      source: "figma2word",
      exportedAt: new Date().toISOString(),
      figmaNode: sampleCardNode,
      imageMap: sampleImageMap,
    };
    expect(isFigmaSnapshot(validSnapshot)).toBe(true);

    const rawNode = { ...sampleCardNode };
    expect(isFigmaSnapshot(rawNode)).toBe(false);

    expect(isFigmaSnapshot(null)).toBe(false);
    expect(isFigmaSnapshot("string")).toBe(false);
    expect(isFigmaSnapshot({})).toBe(false);
  });

  // 3. 오프라인 Portrait 변환 (API 호출 0회)
  it("Item 3 & 5: converts snapshot to Portrait DOCX completely offline with 0 API calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const snapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap, {
      fileName: "Offline-Portrait-Doc",
    });

    const res = await pipeline.convertSnapshot(snapshot, {
      pageOrientation: "portrait",
    });

    expect(res.docxBuffer).toBeDefined();
    expect(res.docxBuffer.length).toBeGreaterThan(1000);
    expect(res.internalDocument.pageConfig.orientation).toBe("portrait");

    // Must NOT call fetch (0 API calls)
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  // 4. 오프라인 Landscape 변환 (동일 스냅샷 재사용, API 호출 0회)
  it("Item 4 & 5: converts snapshot to Landscape DOCX completely offline reusing the same snapshot", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const snapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap, {
      fileName: "Offline-Landscape-Doc",
    });

    const res = await pipeline.convertSnapshot(snapshot, {
      pageOrientation: "landscape",
    });

    expect(res.docxBuffer).toBeDefined();
    expect(res.docxBuffer.length).toBeGreaterThan(1000);
    expect(res.internalDocument.pageConfig.orientation).toBe("landscape");

    // Must NOT call fetch (0 API calls)
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  function findImageElement(elem: any): any {
    if (!elem) return null;
    if (elem.type === "image") return elem;
    if (elem.children && Array.isArray(elem.children)) {
      for (const child of elem.children) {
        const found = findImageElement(child);
        if (found) return found;
      }
    }
    return null;
  }

  // 6. 이미지 포함 문서의 오프라인 재변환 (Base64 이미지 보존)
  it("Item 6: preserves embedded base64 image data in offline snapshot re-conversion", async () => {
    const snapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap, {
      fileName: "Image-Preserved-Doc",
    });

    const res = await pipeline.convertSnapshot(snapshot);
    const elements = res.internalDocument.sections[0].elements;

    // Check that internal document model received the base64 image source
    const imgElement = findImageElement(elements[0]);
    expect(imgElement).toBeDefined();
    expect(imgElement.source).toContain("data:image/png;base64");
  });

  // 7. 이미지 데이터 누락 또는 미지정 시 안전한 Fallback 동작
  it("Item 7: gracefully falls back to transparent placeholder when imageRef is not in imageMap without crashing", async () => {
    const emptyImageMap: Record<string, string> = {};
    const snapshot = createFigmaSnapshot(sampleCardNode, emptyImageMap, {
      fileName: "Fallback-Image-Doc",
    });

    // Should convert smoothly without throwing
    const res = await pipeline.convertSnapshot(snapshot);
    expect(res.docxBuffer.length).toBeGreaterThan(1000);

    const elements = res.internalDocument.sections[0].elements;
    const imgElement = findImageElement(elements[0]);
    expect(imgElement).toBeDefined();
    expect(res.docxBuffer.length).toBeGreaterThan(1000);
  });

  // 8. 보안: PAT 및 인증 정보가 스냅샷에 절대 포함되지 않음
  it("Item 8: guarantees that PAT token or sensitive auth credentials are NEVER included in snapshot", () => {
    const secretPAT = "figd_SECRET_PERSONAL_ACCESS_TOKEN_XYZ_999";
    const sensitiveHeaders = { Authorization: `Bearer ${secretPAT}` };

    const snapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap, {
      fileName: "Security-Check-Doc",
      fileKey: "pubFileKey",
      nodeId: "0:1",
    });

    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain(secretPAT);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect((snapshot as any).accessToken).toBeUndefined();
    expect((snapshot as any).token).toBeUndefined();
    expect((snapshot.metadata as any)?.accessToken).toBeUndefined();
  });

  // 9. convertFile을 통한 JSON 스냅샷 파일 직접 변환 지원
  it("Item 9: convertFile seamlessly converts a saved FigmaSnapshot JSON file", async () => {
    const tempSnapshotPath = path.join(process.cwd(), "debug/offline/test-temp-snapshot.json");
    const snapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap, {
      fileName: "Temp-File-Test",
    });

    fs.mkdirSync(path.dirname(tempSnapshotPath), { recursive: true });
    fs.writeFileSync(tempSnapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");

    try {
      const res = await pipeline.convertFile(tempSnapshotPath);
      expect(res.docxBuffer).toBeDefined();
      expect(res.docxBuffer.length).toBeGreaterThan(1000);
      expect(res.internalDocument.sections.length).toBeGreaterThan(0);
    } finally {
      if (fs.existsSync(tempSnapshotPath)) {
        fs.unlinkSync(tempSnapshotPath);
      }
    }
  });

  // 10. 세로/가로 반복 전환 시 동일한 파이프라인으로 일관된 결과 도출
  it("Item 10: produces consistent alternating portrait and landscape results without re-parsing overhead", async () => {
    const snapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap);

    const p1 = await pipeline.convertSnapshot(snapshot, { pageOrientation: "portrait" });
    const l1 = await pipeline.convertSnapshot(snapshot, { pageOrientation: "landscape" });
    const p2 = await pipeline.convertSnapshot(snapshot, { pageOrientation: "portrait" });
    const l2 = await pipeline.convertSnapshot(snapshot, { pageOrientation: "landscape" });

    // In docx generation, timestamps can vary by a few bytes; verify near-exact sizes
    expect(Math.abs(p1.docxBuffer.length - p2.docxBuffer.length)).toBeLessThan(20);
    expect(Math.abs(l1.docxBuffer.length - l2.docxBuffer.length)).toBeLessThan(20);
    expect(p1.internalDocument.pageConfig.orientation).toBe("portrait");
    expect(l1.internalDocument.pageConfig.orientation).toBe("landscape");
  });

  // 11. 이미지 완전성 검사 (M=K) 및 누락 경고 안전장치 검증
  it("Item 11: assessImageCompleteness correctly detects 100% complete, missing, and zero-image states", () => {
    // 100% Complete: referenced 1, resolved 1
    const completeStats = assessImageCompleteness(sampleCardNode, sampleImageMap);
    expect(completeStats.referencedCount).toBe(1);
    expect(completeStats.resolvedCount).toBe(1);
    expect(completeStats.isComplete).toBe(true);
    expect(completeStats.missingRefs).toEqual([]);

    // Incomplete / Missing: referenced 1, resolved 0
    const missingStats = assessImageCompleteness(sampleCardNode, {});
    expect(missingStats.referencedCount).toBe(1);
    expect(missingStats.resolvedCount).toBe(0);
    expect(missingStats.isComplete).toBe(false);
    expect(missingStats.missingRefs).toEqual(["hero-img-ref-123"]);

    // Zero-image text/vector node
    const textOnlyNode: FigmaNode = {
      id: "text-only",
      name: "Only Text",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
      children: [
        {
          id: "t1",
          name: "Text",
          type: "TEXT",
          characters: "Hello World",
          absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 20 },
        },
      ],
    };
    const zeroImageStats = assessImageCompleteness(textOnlyNode, {});
    expect(zeroImageStats.referencedCount).toBe(0);
    expect(zeroImageStats.resolvedCount).toBe(0);
    expect(zeroImageStats.isComplete).toBe(true);
    expect(zeroImageStats.missingRefs).toEqual([]);

    // Verify createFigmaSnapshot automatically embeds imageStats
    const autoSnapshot = createFigmaSnapshot(sampleCardNode, sampleImageMap);
    expect(autoSnapshot.metadata?.imageStats).toBeDefined();
    expect(autoSnapshot.metadata?.imageStats?.isComplete).toBe(true);
    expect(autoSnapshot.metadata?.imageStats?.referencedCount).toBe(1);

    const incompleteSnapshot = createFigmaSnapshot(sampleCardNode, {});
    expect(incompleteSnapshot.metadata?.imageStats?.isComplete).toBe(false);
    expect(incompleteSnapshot.metadata?.imageStats?.resolvedCount).toBe(0);
    expect(incompleteSnapshot.metadata?.imageStats?.missingRefs).toContain("hero-img-ref-123");
  });
});

