import { ConversionPipeline } from "./pipeline/index.js";
import { CanvasPipeline } from "./canvas/pipeline/canvasPipeline.js";
import { parseFigmaUrl, FigmaApiError } from "./api/index.js";
import * as path from "path";
import * as fs from "fs";

function parseCliArgs(args: string[]) {
  const result: {
    url?: string;
    token?: string;
    output?: string;
    orientation?: "portrait" | "landscape";
    engine?: "flow" | "canvas";
    format?: "docx" | "hwpx" | "both";
    scale?: "fit-a4" | "css-96dpi" | "1:1";
    files: string[];
  } = { files: [], engine: "flow", format: "docx" };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--url" || arg === "-u") {
      result.url = args[++i];
    } else if (arg === "--token" || arg === "-t") {
      result.token = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (arg === "--orientation" || arg === "-r") {
      const val = args[++i]?.toLowerCase();
      if (val === "landscape" || val === "portrait") {
        result.orientation = val;
      }
    } else if (arg === "--engine" || arg === "-e") {
      const val = args[++i]?.toLowerCase();
      if (val === "canvas" || val === "flow") {
        result.engine = val;
      }
    } else if (arg === "--format" || arg === "-f") {
      const val = args[++i]?.toLowerCase();
      if (val === "docx" || val === "hwpx" || val === "both") {
        result.format = val;
      }
    } else if (arg === "--scale" || arg === "-s") {
      const val = args[++i]?.toLowerCase();
      if (val === "fit-a4" || val === "css-96dpi" || val === "1:1") {
        result.scale = val as any;
      }
    } else if (!arg.startsWith("-")) {
      result.files.push(arg);
    }
  }

  return result;
}

async function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));

  console.log("=================================================");
  console.log(`  Figma2Word Conversion CLI (Engine: ${parsedArgs.engine?.toUpperCase()})`);
  console.log("=================================================");

  // Mode 1: Convert live Figma design by URL
  if (parsedArgs.url) {
    const token =
      parsedArgs.token ||
      process.env.FIGMA_ACCESS_TOKEN ||
      process.env.FIGMA_TOKEN;

    if (!token) {
      console.error(
        "\n[ERROR] Figma Access Token is required to fetch live designs."
      );
      console.error(
        "Please specify --token <YOUR_TOKEN> or set the FIGMA_ACCESS_TOKEN environment variable."
      );
      process.exit(1);
    }

    console.log(`\nFetching Figma URL: ${parsedArgs.url}`);
    try {
      const pipeline = new ConversionPipeline();
      const res = await pipeline.convertFigmaUrl(parsedArgs.url, token, {
        outputPath: parsedArgs.output,
        pageOrientation: parsedArgs.orientation,
      });

      console.log(`\n[SUCCESS] Converted in ${res.durationMs}ms`);
      console.log(`Output: ${res.outputPath}`);
      console.log(
        `Stats: Total Nodes=${res.stats.totalNodes} | Supported=${res.stats.supportedNodes} | Partial=${res.stats.partiallySupportedNodes} | Unsupported=${res.stats.unsupportedNodes} | Fallback=${res.stats.fallbackNodes}`
      );
      if (res.notices.length > 0) {
        console.log(`Conversion Notices (${res.notices.length}):`);
        for (const notice of res.notices.slice(0, 10)) {
          console.log(
            `  - [${notice.status}] ${notice.nodeName} (${notice.nodeType}): ${notice.message}`
          );
        }
        if (res.notices.length > 10) {
          console.log(`  ... and ${res.notices.length - 10} more notices.`);
        }
      }
    } catch (err: any) {
      console.error("\n[ERROR] Conversion failed:", err.message);
      if (err instanceof FigmaApiError && err.statusCode) {
        console.error(`HTTP Status: ${err.statusCode}`);
      }
      process.exit(1);
    }

    console.log("\n=================================================");
    console.log("Conversion completed.");
    console.log("=================================================");
    return;
  }

  // Mode 2: Local file conversion
  const filesToConvert: string[] = [];

  if (parsedArgs.files.length > 0) {
    filesToConvert.push(...parsedArgs.files.map((f) => path.resolve(process.cwd(), f)));
  } else {
    // Default: convert all samples in samples/figma/
    const fixtureDir = path.resolve(process.cwd(), "samples/figma");
    if (fs.existsSync(fixtureDir)) {
      const files = fs.readdirSync(fixtureDir).filter((f) => f.endsWith(".json"));
      filesToConvert.push(...files.map((f) => path.join(fixtureDir, f)));
    }
  }

  if (filesToConvert.length === 0) {
    console.error("No files found to convert.");
    console.error("Usage:");
    console.error("  npm run convert -- <file.json> [--engine canvas|flow] [--format docx|hwpx|both]");
    console.error("  npm run convert -- <file.docx> --engine canvas (DOCX -> HWPX)");
    console.error("  npm run convert -- --url <FIGMA_URL> [--token <TOKEN>] [--output <FILE.docx>]");
    process.exit(1);
  }

  if (parsedArgs.engine === "canvas") {
    const canvasPipeline = new CanvasPipeline();
    for (const file of filesToConvert) {
      console.log(`\nProcessing (Canvas Engine): ${path.basename(file)}...`);
      try {
        const ext = path.extname(file).toLowerCase();
        let defaultOutput = parsedArgs.output;
        if (!defaultOutput) {
          if (ext === ".docx") {
            defaultOutput = file.replace(/\.docx$/i, ".hwpx");
          } else {
            defaultOutput = file.replace(/\.json$/i, "");
          }
        }

        const res = ext === ".docx"
          ? await canvasPipeline.convertDocxToHwpx(file, {
              outputPath: defaultOutput,
            })
          : await canvasPipeline.convertFigma(JSON.parse(fs.readFileSync(file, "utf-8")), {
              outputPath: defaultOutput,
              format: parsedArgs.format,
              scalePolicy: parsedArgs.scale,
            });

        console.log(`[SUCCESS] Converted in ${res.durationMs}ms`);
        if (res.canvasDocument) {
          console.log(`Pages: ${res.canvasDocument.pages.length} | PageSize: ${res.canvasDocument.pageSize?.name || "A4"}`);
          console.log(`Stats: Pages=${res.stats.pageCount} | Elements=${res.stats.elementCount} | Resources=${res.stats.resourceCount}`);
        }
        if (res.outputDocxPath) console.log(`DOCX: ${res.outputDocxPath}`);
        if (res.outputHwpxPath) console.log(`HWPX: ${res.outputHwpxPath}`);
      } catch (err: any) {
        console.error(`[ERROR] Failed to convert ${file}:`, err.message || err);
      }
    }
  } else {
    const pipeline = new ConversionPipeline();
    for (const file of filesToConvert) {
      console.log(`\nProcessing (Flow Engine): ${path.basename(file)}...`);
      try {
        const res = await pipeline.convertFile(file, parsedArgs.output, {
          pageOrientation: parsedArgs.orientation,
        });
        console.log(`[SUCCESS] Converted in ${res.durationMs}ms`);
        console.log(`Output: ${res.outputPath}`);
        console.log(
          `Stats: Total Nodes=${res.stats.totalNodes} | Supported=${res.stats.supportedNodes} | Partial=${res.stats.partiallySupportedNodes} | Unsupported=${res.stats.unsupportedNodes} | Fallback=${res.stats.fallbackNodes}`
        );
        if (res.notices.length > 0) {
          console.log(`Conversion Notices:`);
          for (const notice of res.notices) {
            console.log(`  - [${notice.status}] ${notice.nodeName} (${notice.nodeType}): ${notice.message}`);
          }
        }
      } catch (err) {
        console.error(`[ERROR] Failed to convert ${file}:`, err);
      }
    }
  }

  console.log("\n=================================================");
  console.log("All conversions completed.");
  console.log("=================================================");
}

main().catch(console.error);
