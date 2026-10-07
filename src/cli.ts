import { ConversionPipeline } from "./pipeline/index.js";
import { parseFigmaUrl, FigmaApiError } from "./api/index.js";
import * as path from "path";
import * as fs from "fs";

function parseCliArgs(args: string[]) {
  const result: {
    url?: string;
    token?: string;
    output?: string;
    files: string[];
  } = { files: [] };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--url" || arg === "-u") {
      result.url = args[++i];
    } else if (arg === "--token" || arg === "-t") {
      result.token = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (!arg.startsWith("-")) {
      result.files.push(arg);
    }
  }

  return result;
}

async function main() {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const pipeline = new ConversionPipeline();

  console.log("=================================================");
  console.log("       Figma2Word Local Conversion CLI           ");
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
      const res = await pipeline.convertFigmaUrl(parsedArgs.url, token, {
        outputPath: parsedArgs.output,
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

  // Mode 2: Local JSON file conversion
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
    console.error("No Figma JSON files found to convert.");
    console.error("Usage:");
    console.error("  npm run convert -- <file.json>");
    console.error("  npm run convert -- --url <FIGMA_URL> [--token <TOKEN>] [--output <FILE.docx>]");
    process.exit(1);
  }

  for (const file of filesToConvert) {
    console.log(`\nProcessing: ${path.basename(file)}...`);
    try {
      const res = await pipeline.convertFile(file, parsedArgs.output);
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

  console.log("\n=================================================");
  console.log("All conversions completed.");
  console.log("=================================================");
}

main().catch(console.error);
