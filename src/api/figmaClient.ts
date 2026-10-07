import {
  ParsedFigmaUrl,
  FigmaClientOptions,
  FigmaGetFileOptions,
  FigmaGetNodesResponse,
  FigmaImageFillsResponse,
} from "./types.js";
import { FigmaFileResponse, FigmaNode } from "../parser/types.js";

/**
 * Standard Figma API Error with clear, actionable user messages
 */
export class FigmaApiError extends Error {
  public statusCode?: number;
  public details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = "FigmaApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Parse Figma design URL or raw file key to extract fileKey, nodeId, and fileName
 * Handles URL formats:
 * - https://www.figma.com/design/:fileKey/:fileName?node-id=:nodeId
 * - https://www.figma.com/file/:fileKey/:fileName?node-id=:nodeId
 * - https://www.figma.com/proto/:fileKey/:fileName?node-id=:nodeId
 * - raw fileKey string (e.g. "aBcDeFg12345")
 */
export function parseFigmaUrl(input: string): ParsedFigmaUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new FigmaApiError("Figma URL or File Key cannot be empty", 400);
  }

  // If input doesn't look like a URL (no scheme/host), treat as raw file key
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return { fileKey: trimmed };
  }

  try {
    const url = new URL(trimmed);

    // Host check
    if (!url.hostname.includes("figma.com")) {
      throw new FigmaApiError(
        `Invalid host '${url.hostname}'. Must be a valid figma.com URL.`,
        400
      );
    }

    // Path pattern: /(design|file|proto)/:fileKey(/:fileName)?
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      throw new FigmaApiError(
        "Invalid Figma URL format: missing file key in path",
        400
      );
    }

    const [section, fileKey, ...rest] = pathParts;
    if (!["design", "file", "proto"].includes(section.toLowerCase())) {
      throw new FigmaApiError(
        `Unsupported Figma URL type '/${section}'. Expected '/design', '/file', or '/proto'.`,
        400
      );
    }

    const fileName = rest.length > 0 ? decodeURIComponent(rest.join("/")) : undefined;

    // Node ID in search params: ?node-id=1-2 or ?node-id=1%3A2
    let rawNodeId = url.searchParams.get("node-id");
    let nodeId: string | undefined = undefined;

    if (rawNodeId) {
      // In Figma web URLs, node IDs use '-' (e.g. 1-2) or URL encoded ':' (1%3A2).
      // Figma REST API expects ':' (e.g. 1:2)
      nodeId = decodeURIComponent(rawNodeId).replace(/-/g, ":");
    }

    return {
      fileKey,
      nodeId,
      fileName,
    };
  } catch (err: any) {
    if (err instanceof FigmaApiError) throw err;
    throw new FigmaApiError(`Failed to parse Figma URL: ${err.message}`, 400);
  }
}

/**
 * Official Figma REST API Client
 */
export class FigmaClient {
  private accessToken: string;
  private baseUrl: string;
  private timeoutMs: number;
  private imageCache = new Map<string, string>(); // imageRef -> base64 data URL

  constructor(options: FigmaClientOptions) {
    if (!options.accessToken) {
      throw new FigmaApiError(
        "Figma access token is required. Set FIGMA_ACCESS_TOKEN or provide it explicitly.",
        401
      );
    }
    this.accessToken = options.accessToken.trim();
    this.baseUrl = options.baseUrl || "https://api.figma.com/v1";
    this.timeoutMs = options.timeoutMs || 30000;
  }

  /**
   * Helper to perform HTTP GET with standard error handling and headers
   */
  private async get<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      "X-Figma-Token": this.accessToken,
      Accept: "application/json",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return (await response.json()) as T;
    } catch (error: any) {
      if (error instanceof FigmaApiError) {
        throw error;
      }
      if (error.name === "AbortError") {
        throw new FigmaApiError(
          `Request timeout after ${this.timeoutMs}ms while calling Figma API.`,
          408
        );
      }
      throw new FigmaApiError(
        `Network error when connecting to Figma API: ${error.message}`,
        undefined,
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Translate HTTP error status into user-friendly diagnostic messages
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let message = `Figma API Error (${status}): ${response.statusText}`;
    let errBody: any = null;

    try {
      errBody = await response.json();
      if (errBody && typeof errBody.err === "string") {
        message = errBody.err;
      } else if (errBody && typeof errBody.message === "string") {
        message = errBody.message;
      }
    } catch {
      // Body not JSON
    }

    switch (status) {
      case 400:
        throw new FigmaApiError(
          `Bad Request: ${message}. Check file key or node ID formatting.`,
          400,
          errBody
        );
      case 401:
        throw new FigmaApiError(
          "Unauthorized: Invalid or expired Figma access token. Please verify your token in Figma settings.",
          401,
          errBody
        );
      case 403:
        throw new FigmaApiError(
          `Forbidden: You do not have permission to access this Figma file. (${message})`,
          403,
          errBody
        );
      case 404:
        throw new FigmaApiError(
          `Not Found: The requested Figma file or node does not exist. (${message})`,
          404,
          errBody
        );
      case 429:
        throw new FigmaApiError(
          "Rate Limit Exceeded: Too many requests sent to Figma API. Please wait a moment and retry.",
          429,
          errBody
        );
      default:
        if (status >= 500) {
          throw new FigmaApiError(
            `Figma Server Error (${status}): Figma service is temporarily experiencing issues.`,
            status,
            errBody
          );
        }
        throw new FigmaApiError(message, status, errBody);
    }
  }

  /**
   * Fetch full file AST (GET /v1/files/:file_key)
   */
  public async fetchFile(
    fileKey: string,
    options?: FigmaGetFileOptions
  ): Promise<FigmaFileResponse> {
    const query = new URLSearchParams();
    if (options?.depth !== undefined) {
      query.set("depth", String(options.depth));
    }
    if (options?.version) {
      query.set("version", options.version);
    }

    const qs = query.toString();
    const endpoint = `/files/${encodeURIComponent(fileKey)}${qs ? `?${qs}` : ""}`;
    return await this.get<FigmaFileResponse>(endpoint);
  }

  /**
   * Fetch specific nodes within a file (GET /v1/files/:file_key/nodes?ids=...)
   */
  public async fetchNodes(
    fileKey: string,
    nodeIds: string[]
  ): Promise<FigmaGetNodesResponse> {
    if (nodeIds.length === 0) {
      throw new FigmaApiError("At least one node ID must be provided", 400);
    }
    const ids = nodeIds.map((id) => encodeURIComponent(id)).join(",");
    const endpoint = `/files/${encodeURIComponent(fileKey)}/nodes?ids=${ids}`;
    return await this.get<FigmaGetNodesResponse>(endpoint);
  }

  /**
   * Get image fills mapping (GET /v1/files/:file_key/images)
   * Returns mapping of imageRef -> download url
   */
  public async fetchImageFills(fileKey: string): Promise<Record<string, string>> {
    const endpoint = `/files/${encodeURIComponent(fileKey)}/images`;
    const res = await this.get<FigmaImageFillsResponse>(endpoint);
    // Figma API may return under meta.images or images
    return res.meta?.images || res.images || {};
  }

  /**
   * Download image binary from URL and convert to Base64 data URL
   */
  public async downloadImageAsBase64(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "image/png";
      const arrayBuffer = await response.arrayBuffer();

      // Convert ArrayBuffer to Base64 in both Node and Browser
      let base64String = "";
      if (typeof Buffer !== "undefined") {
        base64String = Buffer.from(arrayBuffer).toString("base64");
      } else {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64String = btoa(binary);
      }

      return `data:${contentType};base64,${base64String}`;
    } catch (error: any) {
      throw new FigmaApiError(`Image download failed: ${error.message}`, undefined, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Collect all imageRef keys present in a Figma node tree
   */
  public collectImageRefs(root: FigmaNode): string[] {
    const refs = new Set<string>();

    const traverse = (node: FigmaNode) => {
      if (node.imageRef) {
        refs.add(node.imageRef);
      }
      if (node.fills && Array.isArray(node.fills)) {
        for (const fill of node.fills) {
          if (fill.type === "IMAGE" && fill.imageRef) {
            refs.add(fill.imageRef);
          }
        }
      }
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(root);
    return Array.from(refs);
  }

  /**
   * Resolve and download all images referenced by a node, returning an imageMap
   * Leverages internal in-memory cache to avoid duplicate network downloads
   */
  public async resolveImages(
    fileKey: string,
    rootNode: FigmaNode
  ): Promise<Record<string, string>> {
    const neededRefs = this.collectImageRefs(rootNode);
    if (neededRefs.length === 0) {
      return {};
    }

    const resultMap: Record<string, string> = {};
    const uncashedRefs: string[] = [];

    for (const ref of neededRefs) {
      if (this.imageCache.has(ref)) {
        resultMap[ref] = this.imageCache.get(ref)!;
      } else {
        uncashedRefs.push(ref);
      }
    }

    if (uncashedRefs.length === 0) {
      return resultMap;
    }

    try {
      const fillUrls = await this.fetchImageFills(fileKey);

      for (const ref of uncashedRefs) {
        const downloadUrl = fillUrls[ref];
        if (downloadUrl) {
          try {
            const dataUrl = await this.downloadImageAsBase64(downloadUrl);
            this.imageCache.set(ref, dataUrl);
            resultMap[ref] = dataUrl;
          } catch (err) {
            // If download of a single image fails, fallback to empty/notice rather than crashing
            console.warn(`[FigmaClient] Failed to download imageRef ${ref}:`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`[FigmaClient] Could not fetch image fills mapping:`, err);
    }

    return resultMap;
  }
}
