import { ConversionPipeline } from "./pipeline/index.js";
import * as path from "path";
import * as fs from "fs";

async function main() {
  const args = process.argv.slice(2);
  const pipeline = new ConversionPipeline();

  const filesToConvert: string[] = [];

  if (args.length > 0) {
    filesToConvert.push(path.resolve(process.cwd(), args[0]));
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
    process.exit(1);
  }

  console.log("=================================================");
  console.log("       Figma2Word Local Conversion CLI           ");
  console.log("=================================================");

  for (const file of filesToConvert) {
    console.log(`\nProcessing: ${path.basename(file)}...`);
    try {
      const res = await pipeline.convertFile(file);
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
