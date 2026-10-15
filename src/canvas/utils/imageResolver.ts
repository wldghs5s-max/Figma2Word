/**
 * Image URL resolution utility for Canvas IR.
 * Converts remote Figma image fill URLs (e.g. AWS S3) into Base64 Data URLs
 * for offline embedding in DOCX and HWPX document archives.
 */

export async function resolveImageMapUrls(
  imageMap: Record<string, string>,
  downloadBase64: (url: string) => Promise<string>
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const entries = Object.entries(imageMap);

  await Promise.all(
    entries.map(async ([ref, url]) => {
      if (!url) return;
      if (url.startsWith("http://") || url.startsWith("https://")) {
        try {
          const dataUrl = await downloadBase64(url);
          resolved[ref] = dataUrl;
        } catch {
          // Keep original or fallback
          resolved[ref] = url;
        }
      } else {
        resolved[ref] = url;
      }
    })
  );

  return resolved;
}
