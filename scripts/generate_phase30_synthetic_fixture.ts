import * as fs from 'fs';
import * as path from 'path';

// Valid 1x1 transparent PNG base64
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
// Valid 2x2 solid blue PNG base64
const BLUE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/AwMDEwMDAwAAAAAUAAXeN9fQAAAAASUVORK5CYII=';

export function buildPhase30SyntheticFixture() {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'src'))
    ? process.cwd()
    : path.join(process.cwd(), 'Figma2Word');

  const fixture = {
    document: {
      id: "doc-phase30-synthetic",
      name: "Phase 30 Comprehensive Production Benchmark Suite",
      type: "DOCUMENT",
      children: [
        {
          id: "canvas-page-1",
          name: "Page 1 - Multi-Fidelity Visual Benchmark",
          type: "CANVAS",
          children: [
            // Frame 1: Desktop Dashboard (Typography, Shapes, Shadows, Asymmetric Corners, Buttons)
            {
              id: "frame-dashboard-01",
              name: "Dashboard - Overview & Metrics",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
              fills: [{ type: "SOLID", color: { r: 0.96, g: 0.97, b: 0.98, a: 1 } }],
              children: [
                // Header Bar (Card with border bottom and shadow)
                {
                  id: "header-bg",
                  name: "Header Navigation Bar",
                  type: "RECTANGLE",
                  absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 80 },
                  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
                  strokes: [{ type: "SOLID", color: { r: 0.88, g: 0.91, b: 0.94, a: 1 } }],
                  strokeWeight: 1,
                  effects: [
                    {
                      type: "DROP_SHADOW",
                      visible: true,
                      color: { r: 0, g: 0, b: 0, a: 0.05 },
                      offset: { x: 0, y: 2 },
                      radius: 4,
                      spread: 0,
                    },
                  ],
                },
                // Title (Korean Typography + Bold)
                {
                  id: "header-title",
                  name: "System Title",
                  type: "TEXT",
                  absoluteBoundingBox: { x: 40, y: 26, width: 420, height: 28 },
                  characters: "클라우드 인프라 통합 관제 센터 2026",
                  style: {
                    fontFamily: "Pretendard",
                    fontWeight: 700,
                    fontSize: 22,
                    textAlignHorizontal: "LEFT",
                    textAlignVertical: "CENTER",
                    lineHeightPx: 28,
                  },
                  fills: [{ type: "SOLID", color: { r: 0.08, g: 0.12, b: 0.18, a: 1 } }],
                  textAutoResize: "WIDTH_AND_HEIGHT",
                },
                // Pill Button (Pill corner arcsize = 0.500)
                {
                  id: "btn-pill-action",
                  name: "Primary Pill Button",
                  type: "FRAME",
                  absoluteBoundingBox: { x: 1240, y: 18, width: 160, height: 44 },
                  cornerRadius: 22, // 44 / 2 = 22 (Pill shape)
                  fills: [{ type: "SOLID", color: { r: 0.15, g: 0.40, b: 0.95, a: 1 } }],
                  effects: [
                    {
                      type: "DROP_SHADOW",
                      visible: true,
                      color: { r: 0.15, g: 0.40, b: 0.95, a: 0.35 },
                      offset: { x: 0, y: 4 },
                      radius: 8,
                      spread: 0,
                    },
                  ],
                  children: [
                    {
                      id: "btn-pill-label",
                      name: "Button Label",
                      type: "TEXT",
                      absoluteBoundingBox: { x: 1260, y: 30, width: 120, height: 20 },
                      characters: "보고서 내보내기",
                      style: {
                        fontFamily: "Pretendard",
                        fontWeight: 600,
                        fontSize: 14,
                        textAlignHorizontal: "CENTER",
                        textAlignVertical: "CENTER",
                        lineHeightPx: 20,
                      },
                      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
                      textAutoResize: "WIDTH_AND_HEIGHT",
                    },
                  ],
                },

                // Metric Card 1: Asymmetric Corner Card with Drop Shadow
                {
                  id: "card-asym-01",
                  name: "KPI Card - Server Health",
                  type: "RECTANGLE",
                  absoluteBoundingBox: { x: 40, y: 120, width: 420, height: 180 },
                  rectangleCornerRadii: [20, 4, 20, 4], // Asymmetric corners
                  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
                  strokes: [{ type: "SOLID", color: { r: 0.85, g: 0.88, b: 0.92, a: 1 } }],
                  strokeWeight: 1,
                  effects: [
                    {
                      type: "DROP_SHADOW",
                      visible: true,
                      color: { r: 0, g: 0, b: 0, a: 0.08 },
                      offset: { x: 0, y: 6 },
                      radius: 12,
                      spread: 0,
                    },
                  ],
                },
                // KPI Metric Text inside Card 1 (Mixed Korean + English + Number)
                {
                  id: "kpi-metric-val",
                  name: "KPI Value",
                  type: "TEXT",
                  absoluteBoundingBox: { x: 68, y: 150, width: 300, height: 40 },
                  characters: "99.98% 가동률 (SLA 정합)",
                  style: {
                    fontFamily: "Pretendard",
                    fontWeight: 700,
                    fontSize: 26,
                    textAlignHorizontal: "LEFT",
                    lineHeightPx: 34,
                  },
                  fills: [{ type: "SOLID", color: { r: 0.05, g: 0.65, b: 0.35, a: 1 } }],
                  textAutoResize: "WIDTH_AND_HEIGHT",
                },
                {
                  id: "kpi-metric-desc",
                  name: "KPI Description",
                  type: "TEXT",
                  absoluteBoundingBox: { x: 68, y: 200, width: 360, height: 50 },
                  characters: "전체 128개 마이크로서비스 노드가 장애 없이 정상 운영 중입니다. (평균 레이턴시: 24.5ms)",
                  style: {
                    fontFamily: "Pretendard",
                    fontWeight: 400,
                    fontSize: 13,
                    textAlignHorizontal: "LEFT",
                    lineHeightPx: 20,
                  },
                  fills: [{ type: "SOLID", color: { r: 0.40, g: 0.45, b: 0.52, a: 1 } }],
                  textAutoResize: "HEIGHT",
                },

                // Metric Card 2: Rounded Image Card with Border & Shadow
                {
                  id: "card-img-avatar",
                  name: "Infra Cluster Snapshot",
                  type: "RECTANGLE",
                  absoluteBoundingBox: { x: 500, y: 120, width: 420, height: 180 },
                  cornerRadius: 12,
                  fills: [
                    {
                      type: "IMAGE",
                      imageRef: "res-blue-grid",
                      scaleMode: "FILL",
                    },
                  ],
                  strokes: [{ type: "SOLID", color: { r: 0.75, g: 0.85, b: 0.98, a: 1 } }],
                  strokeWeight: 2,
                  effects: [
                    {
                      type: "DROP_SHADOW",
                      visible: true,
                      color: { r: 0.1, g: 0.2, b: 0.4, a: 0.12 },
                      offset: { x: 0, y: 8 },
                      radius: 16,
                      spread: 0,
                    },
                  ],
                },
                // Text Overlay on top of image card
                {
                  id: "img-overlay-text",
                  name: "Cluster Region Badge",
                  type: "TEXT",
                  absoluteBoundingBox: { x: 520, y: 250, width: 280, height: 24 },
                  characters: "서울 리전 (ap-northeast-2) 이중화 완료",
                  style: {
                    fontFamily: "Pretendard",
                    fontWeight: 600,
                    fontSize: 12,
                    textAlignHorizontal: "LEFT",
                    lineHeightPx: 16,
                  },
                  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
                  textAutoResize: "WIDTH_AND_HEIGHT",
                },

                // Metric Card 3: Dashed Stroke Card (Status Pending)
                {
                  id: "card-dashed-03",
                  name: "Pending Tasks Card",
                  type: "RECTANGLE",
                  absoluteBoundingBox: { x: 960, y: 120, width: 440, height: 180 },
                  cornerRadius: 12,
                  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.7 } }],
                  strokes: [{ type: "SOLID", color: { r: 0.60, g: 0.65, b: 0.72, a: 1 } }],
                  strokeWeight: 1.5,
                  strokeDashes: [6, 4],
                },
                {
                  id: "dashed-card-title",
                  name: "Card Title",
                  type: "TEXT",
                  absoluteBoundingBox: { x: 990, y: 150, width: 380, height: 24 },
                  characters: "보안 취약점 자동 점검 (진행중: 3건)",
                  style: {
                    fontFamily: "Pretendard",
                    fontWeight: 700,
                    fontSize: 17,
                    lineHeightPx: 22,
                  },
                  fills: [{ type: "SOLID", color: { r: 0.20, g: 0.25, b: 0.32, a: 1 } }],
                  textAutoResize: "WIDTH_AND_HEIGHT",
                },
              ],
            },

            // Frame 2: 22-Inch Oversized Frame (Stress & Uniform Scaling Test)
            {
              id: "frame-oversized-02",
              name: "Large Architecture Topology",
              type: "FRAME",
              visible: true,
              absoluteBoundingBox: { x: 1600, y: 0, width: 3200, height: 2400 },
              fills: [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.99, a: 1 } }],
              children: [
                {
                  id: "topo-title",
                  name: "Topology Title",
                  type: "TEXT",
                  absoluteBoundingBox: { x: 1700, y: 100, width: 1200, height: 80 },
                  characters: "글로벌 멀티 클라우드 망 연계 아키텍처 다이어그램",
                  style: {
                    fontFamily: "Pretendard",
                    fontWeight: 700,
                    fontSize: 54,
                    lineHeightPx: 70,
                  },
                  fills: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.2, a: 1 } }],
                  textAutoResize: "WIDTH_AND_HEIGHT",
                },
                {
                  id: "topo-card-node-1",
                  name: "K8s Node",
                  type: "RECTANGLE",
                  absoluteBoundingBox: { x: 1700, y: 300, width: 800, height: 500 },
                  cornerRadius: 32,
                  fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
                  strokes: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }],
                  strokeWeight: 4,
                  effects: [
                    {
                      type: "DROP_SHADOW",
                      visible: true,
                      color: { r: 0, g: 0, b: 0, a: 0.15 },
                      offset: { x: 0, y: 12 },
                      radius: 24,
                      spread: 0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    imageMap: {
      "res-blue-grid": `data:image/png;base64,${BLUE_PNG_BASE64}`,
      "res-tiny-transparent": `data:image/png;base64,${TINY_PNG_BASE64}`,
    },
  };

  const outPath = path.join(rootDir, 'samples/phase30_comprehensive_synthetic_fixture.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2), 'utf8');
  console.log(`[FixtureGenerator] Generated Phase 30 Synthetic Fixture: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
  return outPath;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('generate_phase30_synthetic_fixture')) {
  buildPhase30SyntheticFixture();
}
