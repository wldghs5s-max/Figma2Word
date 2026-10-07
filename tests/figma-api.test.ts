import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseFigmaUrl, FigmaApiError, FigmaClient } from "../src/api/index.js";
import { FigmaNode } from "../src/parser/types.js";

describe("Figma API Integration & URL Parser Tests", () => {
  describe("parseFigmaUrl", () => {
    it("parses modern Figma design URL with hyphenated node-id", () => {
      const url =
        "https://www.figma.com/design/VbC567Xyz890/Project-Design-System?node-id=12-34&t=abc";
      const result = parseFigmaUrl(url);

      expect(result.fileKey).toBe("VbC567Xyz890");
      expect(result.nodeId).toBe("12:34");
      expect(result.fileName).toBe("Project-Design-System");
    });

    it("parses legacy Figma file URL with URL-encoded colon in node-id", () => {
      const url =
        "https://www.figma.com/file/abcdef123456/Legacy-Wireframe?node-id=5%3A20";
      const result = parseFigmaUrl(url);

      expect(result.fileKey).toBe("abcdef123456");
      expect(result.nodeId).toBe("5:20");
      expect(result.fileName).toBe("Legacy-Wireframe");
    });

    it("parses prototype URL without node-id", () => {
      const url = "https://www.figma.com/proto/protoKey123/Interactive-Demo";
      const result = parseFigmaUrl(url);

      expect(result.fileKey).toBe("protoKey123");
      expect(result.nodeId).toBeUndefined();
      expect(result.fileName).toBe("Interactive-Demo");
    });

    it("handles raw fileKey string", () => {
      const rawKey = "myAwesomeFileKey999";
      const result = parseFigmaUrl(rawKey);

      expect(result.fileKey).toBe("myAwesomeFileKey999");
      expect(result.nodeId).toBeUndefined();
    });

    it("throws FigmaApiError for empty input", () => {
      expect(() => parseFigmaUrl("")).toThrow(FigmaApiError);
      expect(() => parseFigmaUrl("   ")).toThrow(/cannot be empty/);
    });

    it("throws FigmaApiError for non-Figma domain", () => {
      expect(() =>
        parseFigmaUrl("https://google.com/design/123/test")
      ).toThrow(/figma\.com/);
    });

    it("throws FigmaApiError for unsupported path type", () => {
      expect(() =>
        parseFigmaUrl("https://www.figma.com/community/file/123")
      ).toThrow(/Unsupported Figma URL type/);
    });
  });

  describe("FigmaApiError Status & Messages", () => {
    it("creates error with status code and details", () => {
      const err = new FigmaApiError("Unauthorized access", 401, { reason: "expired" });
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("Unauthorized access");
      expect(err.details).toEqual({ reason: "expired" });
      expect(err.name).toBe("FigmaApiError");
    });
  });

  describe("FigmaClient Image Reference Collection", () => {
    const client = new FigmaClient({ accessToken: "fake-test-token" });

    it("correctly traverses and collects all imageRef from node tree", () => {
      const sampleTree: FigmaNode = {
        id: "root",
        name: "Root",
        type: "FRAME",
        children: [
          {
            id: "rect-1",
            name: "Image 1",
            type: "RECTANGLE",
            fills: [{ type: "IMAGE", imageRef: "img_ref_alpha" }],
          },
          {
            id: "frame-nested",
            name: "Nested Frame",
            type: "FRAME",
            children: [
              {
                id: "rect-2",
                name: "Image 2",
                type: "RECTANGLE",
                fills: [
                  { type: "SOLID" },
                  { type: "IMAGE", imageRef: "img_ref_beta" },
                ],
              },
              {
                id: "rect-3",
                name: "Image 3 (duplicate alpha)",
                type: "RECTANGLE",
                imageRef: "img_ref_alpha",
              },
            ],
          },
        ],
      };

      const refs = client.collectImageRefs(sampleTree);
      expect(refs.sort()).toEqual(["img_ref_alpha", "img_ref_beta"]);
    });

    it("returns empty array when no images exist in node tree", () => {
      const tree: FigmaNode = {
        id: "1",
        name: "Text only",
        type: "TEXT",
        characters: "Hello World",
      };
      expect(client.collectImageRefs(tree)).toEqual([]);
    });
  });

  describe("FigmaClient Mock Fetch & Error Handling", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("fetches file successfully with authorization header", async () => {
      const mockFileResponse = {
        name: "Test Design",
        document: { id: "0:0", name: "Doc", type: "DOCUMENT" },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockFileResponse,
      } as Response);

      const client = new FigmaClient({ accessToken: "my-valid-token" });
      const res = await client.fetchFile("testFileKey123");

      expect(res.name).toBe("Test Design");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.figma.com/v1/files/testFileKey123",
        expect.objectContaining({
          headers: {
            "X-Figma-Token": "my-valid-token",
            Accept: "application/json",
          },
        })
      );
    });

    it("translates 401 response into clear unauthorized error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ err: "Invalid token" }),
      } as Response);

      const client = new FigmaClient({ accessToken: "bad-token" });
      await expect(client.fetchFile("key")).rejects.toThrow(
        /Invalid or expired Figma access token/
      );
    });

    it("translates 404 response into not found error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ err: "File not found" }),
      } as Response);

      const client = new FigmaClient({ accessToken: "valid-token" });
      await expect(client.fetchFile("non-existent-key")).rejects.toThrow(
        /The requested Figma file or node does not exist/
      );
    });

    it("translates 429 response into rate limit error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ err: "Rate limit exceeded" }),
      } as Response);

      const client = new FigmaClient({ accessToken: "valid-token" });
      await expect(client.fetchFile("key")).rejects.toThrow(
        /Rate Limit Exceeded/
      );
    });
  });
});
