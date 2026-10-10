import { FigmaFileResponse, FigmaNode } from "../parser/types.js";

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId?: string;
  fileName?: string;
}

export interface FigmaClientOptions {
  accessToken: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface FigmaGetFileOptions {
  depth?: number;
  version?: string;
}

export interface FigmaGetNodesResponse {
  name: string;
  lastModified?: string;
  thumbnailUrl?: string;
  version?: string;
  nodes: Record<
    string,
    {
      document: FigmaNode;
      components?: Record<string, any>;
      schemaVersion?: number;
    }
  >;
}

export interface FigmaImageFillsResponse {
  err: string | null;
  status?: number;
  meta?: {
    images: Record<string, string>; // imageRef -> download url
  };
  images?: Record<string, string>;
}

export interface FigmaRateLimitInfo {
  retryAfterRaw?: string;
  retryAfterSeconds?: number;
  rateLimitRemaining?: string;
  rateLimitReset?: string;
}
