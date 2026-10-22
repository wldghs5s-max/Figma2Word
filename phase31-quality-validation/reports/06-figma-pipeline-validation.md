# 06. Figma-to-Canvas IR Pipeline & Image Fill Tracking

## 1. Image Node Conversion Pipeline Trace

Argon requested verification of the transformation pathway when a Figma design node specifies an image fill:
```json
{
  "id": "card-img-avatar",
  "type": "RECTANGLE",
  "fills": [{ "type": "IMAGE", "imageRef": "res-blue-grid", "scaleMode": "FILL" }],
  "cornerRadius": 12,
  "strokes": [{ "type": "SOLID", "color": { "r": 0.75, "g": 0.85, "b": 0.98, "a": 1 } }],
  "strokeWeight": 2,
  "effects": [{ "type": "DROP_SHADOW", "offset": { "x": 0, "y": 8 }, "radius": 16 }]
}
```

```mermaid
flowchart TD
    FigmaNode["Figma Node (RECTANGLE + IMAGE Fill)"] --> Parser["FigmaCanvasParser.visitNode()"]
    Parser --> ExtractFill["Extract imageRef: 'res-blue-grid'"]
    ExtractFill --> ResolveRes["resolveImageResource('res-blue-grid')"]
    ResolveRes --> DecBase64["Decode Base64 from imageMap"]
    DecBase64 --> CreateRes["doc.resources['image1.png'] = { mimeType, data }"]
    Parser --> MakeElem["Create CanvasElement (type: 'image')"]
    MakeElem --> SetProps["Set bounds, cornerRadius, stroke, shadow, zIndex"]
    MakeElem --> CanvasIR["Canonical Canvas IR Document"]

    CanvasIR --> DOCX["DocxCanvasRenderer"]
    DOCX --> ZipMedia["zip.file('word/media/image1.png', res.data)"]
    DOCX --> Rels["word/_rels/document.xml.rels (rId2 -> media/image1.png)"]
    DOCX --> VML["<v:roundrect ...><v:imagedata r:id='rId2'/></v:roundrect>"]

    CanvasIR --> HWPX["HwpxCanvasRenderer"]
    HWPX --> BinData["zip.file('BinData/BIN0001.png', res.data)"]
    HWPX --> HPF["Contents/content.hpf (<opf:item id='BIN0001'...>)"]
    HWPX --> Pic["<hp:pic><hc:img binaryItemIDRef='BIN0001'/></hp:pic>"]
```

---

## 2. Integrity Points Verified

1. **RECTANGLE $\to$ Image Conversion**:
   When a Figma `RECTANGLE` or `FRAME` contains `fills[0].type === "IMAGE"`, `FigmaCanvasParser` correctly classifies the element as `type: "image"` rather than dropping it or treating it as a generic shape.
2. **Resource Normalization**:
   In `figmaCanvasParser.ts` (lines 981–1017), `resolveImageResource` maps the arbitrary Figma `imageRef` string to a clean, extensioned file identifier (e.g. `image1.png`). This guarantees OpenXML `[Content_Types].xml` resolves the MIME type without error.
3. **Property Preservation**:
   `cornerRadius`, `strokeColor`, `strokeWidth`, and `shadow` properties are faithfully transferred to `elem.style`, allowing both DOCX and HWPX renderers to access the complete geometric and visual styling.
4. **Z-Order Consistency**:
   In `CanvasIR`, the image element retains its sequential document order ($z = 8$), and the overlay text retains $z = 9$, ensuring the text renders in front of the image across both formats.
