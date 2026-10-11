export * from './src/types.js';
export * from './src/wordRenderer.js';
export * from './src/imageComparator.js';
export * from './src/docxStructureComparator.js';
export * from './src/reportGenerator.js';
export * from './src/runner.js';

import { QualityAuditRunner } from './src/runner.js';

// CLI entry point if executed directly
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/quality-audit/index.ts')) {
  const runner = new QualityAuditRunner();
  console.log('Figma2Word Quality Audit Engine loaded.');
}
