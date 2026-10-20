import * as fs from 'fs';
import * as path from 'path';

const outDir = path.resolve(process.cwd(), 'debug/phase28-evidence');
fs.mkdirSync(outDir, { recursive: true });

const figmaFixture = {
  figmaNode: {
    id: "canvas-phase28",
    name: "Phase 28 Comprehensive Verification Canvas",
    type: "CANVAS",
    children: [
      // Frame 1: Asymmetric Cards, Pill Buttons & Non-Wrapping Text
      {
        id: "frame-cards-pills",
        name: "UI Components & Asymmetric Corners",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
        backgroundColor: { r: 0.96, g: 0.97, b: 0.99, a: 1 },
        children: [
          // Banner Title
          {
            id: "banner-txt",
            name: "Banner Title",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 80, y: 60, width: 1200, height: 50 },
            characters: "Phase 28 Fidelity: Asymmetric Radii & Universal Word Rendering",
            style: { fontFamily: "Arial", fontSize: 28, fontWeight: 700 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.15, b: 0.3 } }]
          },
          // Card 1: Top-Rounded Only [24, 24, 0, 0]
          {
            id: "card-top-rounded",
            name: "Modal Header (Top Rounded Only)",
            type: "RECTANGLE",
            visible: true,
            absoluteBoundingBox: { x: 80, y: 150, width: 400, height: 220 },
            rectangleCornerRadii: [24, 24, 0, 0],
            fills: [{ type: "SOLID", visible: true, color: { r: 0.05, g: 0.6, b: 0.4 } }],
            strokes: [{ type: "SOLID", visible: true, color: { r: 0.02, g: 0.4, b: 0.25 } }],
            strokeWeight: 2
          },
          {
            id: "card-top-txt",
            name: "Card Top Text",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 110, y: 220, width: 340, height: 80 },
            characters: "Asymmetric [24, 24, 0, 0]\nv:shape Cubic Bezier Path",
            style: { fontFamily: "Arial", fontSize: 20, fontWeight: 600 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }]
          },
          // Card 2: Bottom-Rounded Only [0, 0, 24, 24]
          {
            id: "card-bottom-rounded",
            name: "Drawer Bottom (Bottom Rounded Only)",
            type: "RECTANGLE",
            visible: true,
            absoluteBoundingBox: { x: 520, y: 150, width: 400, height: 220 },
            rectangleCornerRadii: [0, 0, 24, 24],
            fills: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.4, b: 0.85 } }],
            strokes: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.25, b: 0.65 } }],
            strokeWeight: 2
          },
          {
            id: "card-bottom-txt",
            name: "Card Bottom Text",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 550, y: 220, width: 340, height: 80 },
            characters: "Asymmetric [0, 0, 24, 24]\nv:shape Cubic Bezier Path",
            style: { fontFamily: "Arial", fontSize: 20, fontWeight: 600 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }]
          },
          // Card 3: Uniform Pill Button (height=50, cornerRadius=25)
          {
            id: "btn-pill",
            name: "Pill Action Button",
            type: "RECTANGLE",
            visible: true,
            absoluteBoundingBox: { x: 80, y: 420, width: 220, height: 50 },
            cornerRadius: 25,
            rectangleCornerRadii: [25, 25, 25, 25],
            fills: [{ type: "SOLID", visible: true, color: { r: 0.9, g: 0.3, b: 0.2 } }]
          },
          {
            id: "btn-pill-txt",
            name: "Pill Button Text",
            type: "TEXT",
            visible: true,
            textAutoResize: "WIDTH_AND_HEIGHT",
            absoluteBoundingBox: { x: 120, y: 435, width: 140, height: 20 },
            characters: "Confirm & Submit",
            style: { fontFamily: "Arial", fontSize: 16, fontWeight: 700 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }]
          },
          // Single-line text wrap test (tight auto-width)
          {
            id: "label-single-line",
            name: "Single Line Auto Width",
            type: "TEXT",
            visible: true,
            textAutoResize: "WIDTH_AND_HEIGHT",
            absoluteBoundingBox: { x: 330, y: 435, width: 300, height: 20 },
            characters: "Single-Line Text (Non-Wrapping Guard <w:wordWrap w:val='0'/> Active)",
            style: { fontFamily: "Arial", fontSize: 14, fontWeight: 500 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }]
          }
        ]
      },
      // Frame 2: Tall Oversized Frame 3000 x 4000 px
      {
        id: "frame-tall-oversized",
        name: "Tall Oversized 3000x4000",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 2000, y: 0, width: 3000, height: 4000 },
        backgroundColor: { r: 0.98, g: 0.95, b: 0.95, a: 1 },
        children: [
          {
            id: "tall-hdr",
            name: "Tall Header",
            type: "RECTANGLE",
            visible: true,
            absoluteBoundingBox: { x: 2100, y: 100, width: 2800, height: 250 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.8, g: 0.2, b: 0.2 } }]
          },
          {
            id: "tall-hdr-t",
            name: "Tall Header Text",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 2150, y: 180, width: 2500, height: 100 },
            characters: "Tall Frame (3000x4000 px) -> Clamped to Word 22\" Limit (1188x1584 pt)",
            style: { fontFamily: "Arial", fontSize: 48, fontWeight: 700 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }]
          },
          {
            id: "tall-footer-bar",
            name: "Tall Bottom Footer Bar",
            type: "RECTANGLE",
            visible: true,
            absoluteBoundingBox: { x: 2100, y: 3750, width: 2800, height: 200 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.2, g: 0.2, b: 0.3 } }]
          },
          {
            id: "tall-footer-t",
            name: "Tall Footer Text",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 2150, y: 3810, width: 2500, height: 100 },
            characters: "BOTTOM FOOTER PRESERVED: Y=3750 of 4000 within printable page boundaries",
            style: { fontFamily: "Arial", fontSize: 40, fontWeight: 700 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }]
          }
        ]
      },
      // Frame 3: Wide Oversized Frame 5000 x 2000 px
      {
        id: "frame-wide-oversized",
        name: "Wide Oversized 5000x2000",
        type: "FRAME",
        visible: true,
        absoluteBoundingBox: { x: 6000, y: 0, width: 5000, height: 2000 },
        backgroundColor: { r: 0.94, g: 0.98, b: 0.96, a: 1 },
        children: [
          {
            id: "wide-hdr",
            name: "Wide Header",
            type: "RECTANGLE",
            visible: true,
            absoluteBoundingBox: { x: 6100, y: 100, width: 4800, height: 250 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.5, b: 0.3 } }]
          },
          {
            id: "wide-hdr-t",
            name: "Wide Header Text",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 6150, y: 180, width: 4000, height: 100 },
            characters: "Wide Frame (5000x2000 px) -> Clamped to Word 22\" Limit (1584x633.6 pt)",
            style: { fontFamily: "Arial", fontSize: 48, fontWeight: 700 },
            fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }]
          },
          {
            id: "wide-right-box",
            name: "Wide Right Edge Box",
            type: "RECTANGLE",
            visible: true,
            absoluteBoundingBox: { x: 10600, y: 500, width: 300, height: 1200 },
            fills: [{ type: "SOLID", visible: true, color: { r: 0.95, g: 0.5, b: 0.1 } }]
          }
        ]
      }
    ]
  }
};

const jsonFile = path.join(outDir, 'phase28_fixture.json');
fs.writeFileSync(jsonFile, JSON.stringify(figmaFixture, null, 2));
console.log(`Phase 28 fixture generated at: ${jsonFile}`);
