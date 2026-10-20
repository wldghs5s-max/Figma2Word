import * as path from 'path';
import * as fs from 'fs';
import { runVisualPipeline } from './pipeline.js';

interface CliArgs {
  input: string;
  output: string;
  referenceDir?: string;
  frameId?: string;
  allFrames: boolean;
  scalePolicy: 'fit-a4' | '1:1' | 'css-96dpi';
  renderScale: number;
}

function printHelp(): void {
  console.log(`
Figma2Word Visual Regression CLI

Usage:
  npx tsx tools/visual-regression/cli.ts [options]

Options:
  --input, -i <path>         Path to Figma JSON snapshot (required or falls back to default sample)
  --output, -o <dir>         Output directory for rendered artifacts (default: artifacts/run_<timestamp>)
  --reference-dir, -r <dir>  Directory containing reference images
  --frame-id, -f <id>        Filter to process only a specific frame ID
  --all-frames               Process all discovered candidate frames (default: true)
  --scale-policy, -s <p>     Scale policy: "fit-a4" | "1:1" | "css-96dpi" (default: fit-a4)
  --render-scale <number>    High-res rendering scale factor (default: 1.5)
  --help, -h                 Display this help message
`);
}

function parseArgs(args: string[]): CliArgs {
  const rootDir = process.cwd();
  let input = '';
  let output = '';
  let referenceDir: string | undefined;
  let frameId: string | undefined;
  let allFrames = true;
  let scalePolicy: 'fit-a4' | '1:1' | 'css-96dpi' = 'fit-a4';
  let renderScale = 1.5;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--input' || arg === '-i') {
      input = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      output = args[++i];
    } else if (arg === '--reference-dir' || arg === '-r') {
      referenceDir = args[++i];
    } else if (arg === '--frame-id' || arg === '-f') {
      frameId = args[++i];
      allFrames = false;
    } else if (arg === '--all-frames') {
      allFrames = true;
    } else if (arg === '--scale-policy' || arg === '-s') {
      const p = args[++i];
      if (p === 'fit-a4' || p === '1:1' || p === 'css-96dpi') {
        scalePolicy = p;
      }
    } else if (arg === '--render-scale') {
      renderScale = parseFloat(args[++i]) || 1.5;
    }
  }

  // Fallback default input if omitted
  if (!input) {
    const defaultSample = path.resolve(rootDir, 'debug/phase25-web-ui-fidelity/pentech_v3_original.json');
    if (fs.existsSync(defaultSample)) {
      input = defaultSample;
    } else {
      console.error('Error: Missing required --input argument and default sample was not found.');
      printHelp();
      process.exit(1);
    }
  }

  if (!fs.existsSync(input)) {
    console.error(`Error: Input file does not exist: ${input}`);
    process.exit(1);
  }

  if (!output) {
    output = path.resolve(rootDir, `research/rea-document-engine/phase27-quality-audit/artifacts/run_${Date.now()}`);
  }

  return {
    input: path.resolve(input),
    output: path.resolve(output),
    referenceDir: referenceDir ? path.resolve(referenceDir) : undefined,
    frameId,
    allFrames,
    scalePolicy,
    renderScale,
  };
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));

  console.log('=== FIGMA2WORD UNIVERSAL VISUAL PIPELINE CLI ===');
  console.log(`Input JSON:     ${cliArgs.input}`);
  console.log(`Output Dir:     ${cliArgs.output}`);
  console.log(`Scale Policy:   ${cliArgs.scalePolicy}`);
  console.log(`Render Scale:   ${cliArgs.renderScale}x`);
  if (cliArgs.frameId) {
    console.log(`Frame Filter:   ${cliArgs.frameId}`);
  }

  const res = await runVisualPipeline({
    jsonPath: cliArgs.input,
    outputDir: cliArgs.output,
    docxName: 'rendered_document.docx',
    scalePolicy: cliArgs.scalePolicy,
    renderScale: cliArgs.renderScale,
  });

  console.log('\n=== PIPELINE EXECUTION SUMMARY ===');
  console.log(`Success:        ${res.success}`);
  console.log(`Duration:       ${(res.durationMs / 1000).toFixed(2)}s`);
  console.log(`Sections:       ${res.totalSections}`);
  console.log(`Pages:          ${res.totalPages}`);
  console.log(`DOCX:           ${res.docxPath}`);
  console.log(`PDF:            ${res.pdfPath}`);

  if (!res.success) {
    console.error(`Error: ${res.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
