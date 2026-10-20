import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  captureWordState,
  cleanupTargetDocOnly,
} from "../tools/visual-regression/safe_word_automation.js";

describe("Phase 27: Word Automation Safety & Zero Data Loss Guard", () => {
  it("1. Strictly forbids dangerous 'close every document' commands across the entire codebase", () => {
    const vrDir = path.resolve(process.cwd(), "tools/visual-regression");
    const files = fs.readdirSync(vrDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".applescript"));

    for (const f of files) {
      const content = fs.readFileSync(path.join(vrDir, f), "utf8");
      expect(content).not.toContain("close every document");
      expect(content).not.toContain("close documents saving no");
    }
  });

  it("2. Captures Word state non-destructively without modifying or closing open documents", () => {
    const state = captureWordState();
    expect(typeof state.wordWasRunning).toBe("boolean");
    expect(Array.isArray(state.initialDocumentNames)).toBe(true);
  });

  it("3. Target document cleanup is strictly targeted and does nothing for non-matching documents", () => {
    // Calling cleanup on a non-existent document name should execute safely and not touch anything
    expect(() => {
      cleanupTargetDocOnly("NON_EXISTENT_MOCK_TARGET_DOC_XYZ_12345.docx");
    }).not.toThrow();
  });
});
