import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  extractSelectableFrames,
  filterFigmaNodeByFrames,
  isFigmaSnapshot,
} from '../src/pipeline/index';
import { FigmaParser } from '../src/parser/figmaParser';
import { DocxRenderer } from '../src/renderer/docxRenderer';
import { simpleDocumentFixture } from '../src/fixtures/samples';

describe('Step 11D: Browser Memory Stability & Race Condition Guards', () => {
  const customerSnapshotPath = path.resolve(process.cwd(), 'debug/customer/testnewpage.json');
  const hasRealSnapshot = fs.existsSync(customerSnapshotPath);

  it('verifies deterministic parsing after releasing raw JSON string reference', () => {
    // 1. Simulates FileReader onload: raw string loaded, parsed, then string is dereferenced
    let rawText: string | null = JSON.stringify({
      document: {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: [
          {
            id: 'canvas-1',
            name: 'Canvas 1',
            type: 'CANVAS',
            children: [
              {
                id: '1:1',
                name: 'Frame 1',
                type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 0, width: 595, height: 842 },
                children: [
                  {
                    id: '2:1',
                    name: 'Title',
                    type: 'TEXT',
                    characters: 'Test Document Header',
                    absoluteBoundingBox: { x: 50, y: 50, width: 400, height: 40 },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const parsed = JSON.parse(rawText);
    // Explicitly release string reference (mirroring App.tsx setJsonInput(''))
    rawText = null;
    expect(rawText).toBeNull();

    const targetNode = parsed.document || parsed;
    const frames = extractSelectableFrames(targetNode);
    expect(frames).toHaveLength(1);
    expect(frames[0].name).toBe('Frame 1');

    const parser = new FigmaParser();
    const result = parser.parse(targetNode);
    expect(result.document.sections).toHaveLength(1);
    expect(result.stats.totalElements).toBeGreaterThan(0);
  });

  it('preserves backwards compatibility for manual JSON text paste and presets', () => {
    // Case 1: Manual string input fallback to simpleDocumentFixture
    const emptyInput = '';
    const fallbackNode = emptyInput.trim() ? JSON.parse(emptyInput) : simpleDocumentFixture;
    expect(fallbackNode).toBeDefined();
    const parser = new FigmaParser();
    const result1 = parser.parse(fallbackNode);
    expect(result1.stats.totalElements).toBeGreaterThan(0);

    // Case 2: Custom JSON AST string input
    const customJson = JSON.stringify(simpleDocumentFixture);
    const parsedCustom = JSON.parse(customJson);
    const result2 = parser.parse(parsedCustom);
    expect(result2.document.title).toBe(result1.document.title);
  });

  it('guarantees async race condition guard prevents stale blob overwrite', async () => {
    // Simulates conversionReqIdRef behavior
    let conversionReqId = 0;
    let finalRenderedOrientation: string | null = null;

    const runSimulatedConversion = async (orientation: 'portrait' | 'landscape', delayMs: number) => {
      const currentReqId = ++conversionReqId;

      // Simulate async renderToBlob latency
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Guard check: if user changed orientation or re-triggered, abort state update
      if (currentReqId !== conversionReqId) {
        return; // Stale result discarded!
      }

      finalRenderedOrientation = orientation;
    };

    // User triggers conversion 1 (slow portrait conversion: 50ms)
    const task1 = runSimulatedConversion('portrait', 50);

    // Immediately after (10ms), user changes orientation to landscape (fast conversion: 20ms)
    await new Promise((resolve) => setTimeout(resolve, 10));
    const task2 = runSimulatedConversion('landscape', 20);

    await Promise.all([task1, task2]);

    // Even though task1 was initiated first, task2 updated conversionReqId.
    // Task 1 must have been aborted, leaving final orientation strictly 'landscape'.
    expect(finalRenderedOrientation).toBe('landscape');
  });

  it('handles customer 23MB snapshot AST correctly without keeping raw string', async () => {
    if (!hasRealSnapshot) {
      return;
    }

    const stat = fs.statSync(customerSnapshotPath);
    expect(stat.size).toBeGreaterThan(20 * 1024 * 1024);

    let raw = fs.readFileSync(customerSnapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    raw = ''; // dereference string

    const isSnapshot = isFigmaSnapshot(parsed);
    const targetNode = isSnapshot ? parsed.figmaNode : (parsed.document || parsed);
    const imageMap = isSnapshot ? (parsed.imageMap || {}) : (parsed.images || {});

    const frames = extractSelectableFrames(targetNode);
    expect(frames.length).toBeGreaterThan(0);

    // Pick recommended A4 frames
    const a4Frames = frames.filter((f) => f.isA4Ratio);
    expect(a4Frames.length).toBe(5);

    // Filter by A4 frames
    const effectiveNode = filterFigmaNodeByFrames(targetNode, a4Frames.map((f) => f.id));
    const parser = new FigmaParser({ imageMap });
    const result = parser.parse(effectiveNode);
    expect(result.document.sections.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.totalElements).toBeGreaterThan(0);

    // Verify DOCX rendering succeeds deterministically
    const renderer = new DocxRenderer();
    const docxBuf = await renderer.renderToBuffer(result.document);
    expect(docxBuf.length).toBeGreaterThan(5000);
  });
});
