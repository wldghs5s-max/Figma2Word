import * as fs from "fs";
import * as path from "path";
import {
  simpleDocumentFixture,
  cardLayoutFixture,
  autoLayoutFixture,
} from "./samples.js";

const outputDir = path.resolve(process.cwd(), "samples/figma");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(
  path.join(outputDir, "simple-document.json"),
  JSON.stringify(simpleDocumentFixture, null, 2),
  "utf-8"
);

fs.writeFileSync(
  path.join(outputDir, "card-layout.json"),
  JSON.stringify(cardLayoutFixture, null, 2),
  "utf-8"
);

fs.writeFileSync(
  path.join(outputDir, "auto-layout.json"),
  JSON.stringify(autoLayoutFixture, null, 2),
  "utf-8"
);

console.log("Successfully generated Figma sample fixtures in samples/figma/ :");
console.log("- samples/figma/simple-document.json");
console.log("- samples/figma/card-layout.json");
console.log("- samples/figma/auto-layout.json");

