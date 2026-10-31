import * as fs from "fs";
import * as path from "path";
import { FigmaCanvasParser } from "../src/canvas/parser/figmaCanvasParser.js";
import { DocxCanvasRenderer } from "../src/canvas/renderer/docxCanvasRenderer.js";
import { buildObjectTraceability } from "../src/fidelity/objectTraceability.js";
import { TARGET_17_FRAME_IDS } from "../src/fidelity/nodeIdMapper.js";
import JSZip from "jszip";

async function main() {
  const jsonPath = path.resolve("펜테크 3차 디자인.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("File not found: " + jsonPath);
    process.exit(1);
  }

  console.log("Reading customer Figma JSON...");
  const jsonRaw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const targetFrameIds = [...TARGET_17_FRAME_IDS];

  console.log("Parsing to Canvas IR...");
  const imageMap: Record<string, string> = {};
  if (jsonRaw.imageMap) {
    for (const [k, v] of Object.entries(jsonRaw.imageMap)) {
      imageMap[k] = String(v);
    }
  }

  const parser = new FigmaCanvasParser({
    imageMap,
    selectedFrameIds: targetFrameIds,
  });
  const canvasDoc = parser.parse(jsonRaw);

  console.log("Rendering DOCX buffer...");
  const renderer = new DocxCanvasRenderer();
  const docxZip = await renderer.buildZip(canvasDoc);
  const docxBuffer = await docxZip.generateAsync({ type: "nodebuffer" });

  console.log("Reading document.xml from generated DOCX...");
  const zip = await JSZip.loadAsync(docxBuffer);
  const docxXml = (await zip.file("word/document.xml")?.async("text")) || "";
  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("text")) || "";

  const mediaFilesMap = new Map<string, { size: number; isPlaceholder?: boolean }>();
  for (const [filename, fileEntry] of Object.entries(zip.files)) {
    if (filename.startsWith("word/media/") && !fileEntry.dir) {
      const buf = await fileEntry.async("nodebuffer");
      const relTarget = filename.replace(/^word\//, "");
      mediaFilesMap.set(relTarget, {
        size: buf.length,
        isPlaceholder: buf.length < 100,
      });
      mediaFilesMap.set(path.basename(filename), {
        size: buf.length,
        isPlaceholder: buf.length < 100,
      });
    }
  }

  console.log("Running object traceability...");
  const report = buildObjectTraceability(
    jsonRaw,
    targetFrameIds,
    canvasDoc,
    docxXml,
    "390e774379c9ff9bdc72e0b1918c557e9ea9f3128662692456f8e84a82e0527a",
    { docxRelsXml: relsXml, mediaFilesMap }
  );

  console.log("Traceability full summary:", JSON.stringify(report.summary, null, 2));

  const unresolved = report.mappings.filter(m => m.conversionStatus === "UNRESOLVED");
  console.log(`Found ${unresolved.length} UNRESOLVED objects in report.`);

  // Build node lookup map from figmaRaw to inspect parent, bounding box, visual properties
  const nodeMap = new Map<string, { node: any; parentId: string | null }>();
  function indexNodes(node: any, parentId: string | null) {
    if (!node) return;
    nodeMap.set(node.id, { node, parentId });
    if (node.children && Array.isArray(node.children)) {
      for (const c of node.children) {
        indexNodes(c, node.id);
      }
    }
  }
  const rootNode = jsonRaw.figmaNode || jsonRaw.document || jsonRaw;
  indexNodes(rootNode, null);

  // Analyze each unresolved node
  const analyzed: any[] = [];
  const typeCounts: Record<string, number> = {};

  for (const item of unresolved) {
    const info = nodeMap.get(item.sourceNodeId);
    const n = info?.node;
    const parentId = info?.parentId;
    const nodeType = n ? n.type : item.sourceNodeType;

    typeCounts[nodeType] = (typeCounts[nodeType] || 0) + 1;

    // Check Canvas IR elements
    const irElements = canvasDoc.pages.flatMap(p => p.elements).filter(e => (e.sourceNodeId || e.id) === item.sourceNodeId);

    // Check if node ID appears ANYWHERE in docxXml
    const inDocxRaw = docxXml.includes(item.sourceNodeId);

    // Check what tags in docxXml contain this nodeId
    let docxOccurrences: string[] = [];
    if (inDocxRaw) {
      const regex = new RegExp(`(<[^>]+(?:${item.sourceNodeId.replace(/:/g, "[:_]")}|${item.sourceNodeId})[^>]*>)`, "g");
      let m: RegExpExecArray | null;
      while ((m = regex.exec(docxXml)) !== null) {
        docxOccurrences.push(m[1].slice(0, 150));
      }
    }

    analyzed.push({
      sourceNodeId: item.sourceNodeId,
      sourceNodeType: nodeType,
      sourceElementKind: item.sourceElementKind,
      sourceFrameNodeId: item.sourceFrameNodeId,
      parentId,
      name: n?.name,
      visible: n?.visible !== false,
      bbox: n?.absoluteBoundingBox || n?.size || null,
      fills: n?.fills?.map((f: any) => ({ type: f.type, visible: f.visible, color: f.color })),
      strokes: n?.strokes?.map((s: any) => ({ type: s.type, visible: s.visible, color: s.color })),
      irElementsCount: irElements.length,
      irElementTypes: irElements.map(e => e.type),
      inDocxXmlRaw: inDocxRaw,
      docxOccurrences: docxOccurrences.slice(0, 3),
    });
  }

  console.log("Unresolved Type Breakdown:", typeCounts);

  // Summary by IR element types & inDocxXmlRaw
  const irTypeCounts: Record<string, number> = {};
  let inDocxRawCount = 0;
  for (const a of analyzed) {
    const key = a.irElementTypes.join(",") || "NONE";
    irTypeCounts[key] = (irTypeCounts[key] || 0) + 1;
    if (a.inDocxXmlRaw) inDocxRawCount++;
  }
  console.log("IR Element Types Breakdown:", irTypeCounts);
  console.log(`Objects whose Node ID appears in raw docxXml: ${inDocxRawCount} / ${analyzed.length}`);

  // Ensure debug dir exists
  fs.mkdirSync(path.resolve("debug"), { recursive: true });

  // Write detailed analysis json
  fs.writeFileSync(
    path.resolve("debug/phase40-unresolved-raw-analysis.json"),
    JSON.stringify({ total: analyzed.length, typeCounts, irTypeCounts, inDocxRawCount, analyzed }, null, 2),
    "utf8"
  );

  console.log("Analysis written to debug/phase40-unresolved-raw-analysis.json");
}

main().catch(console.error);
