import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { DocxStructuralModel, DocxStructureComparison, TableStructuralDetail } from './types.js';

export class DocxStructureComparator {
  /**
   * Extracts structural metrics from a DOCX file by reading its OpenXML package.
   */
  public async extractModel(docxPath: string): Promise<DocxStructuralModel> {
    const fullPath = path.resolve(docxPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`DOCX file not found: ${fullPath}`);
    }

    const fileBuffer = fs.readFileSync(fullPath);
    const zip = await JSZip.loadAsync(fileBuffer);

    // 1. Read document.xml
    const docXmlEntry = zip.file('word/document.xml');
    if (!docXmlEntry) {
      throw new Error(`Invalid DOCX format: word/document.xml missing in ${fullPath}`);
    }
    const docXml = await docXmlEntry.async('string');

    // 2. Sections and Page Configuration
    // Example: <w:pgSz w:w="11906" w:h="16838" w:orient="landscape"/>
    let sectionsCount = (docXml.match(/<w:sectPr\b/g) || []).length;
    if (sectionsCount === 0) sectionsCount = 1;

    let widthMm = 210;
    let heightMm = 297;
    let orientation: 'portrait' | 'landscape' = 'portrait';

    const pgSzMatch = docXml.match(/<w:pgSz\b([^>]*)\/?>/);
    if (pgSzMatch) {
      const attrs = pgSzMatch[1];
      const wMatch = attrs.match(/w:w="(\d+)"/);
      const hMatch = attrs.match(/w:h="(\d+)"/);
      const orientMatch = attrs.match(/w:orient="(portrait|landscape)"/);

      if (wMatch && hMatch) {
        // dxa to mm: 1 mm = 56.7 dxa (approx 20 dxa per pt, 72 pt per inch, 25.4 mm per inch)
        const dxaW = parseInt(wMatch[1], 10);
        const dxaH = parseInt(hMatch[1], 10);
        widthMm = Math.round((dxaW / 1440) * 25.4);
        heightMm = Math.round((dxaH / 1440) * 25.4);
      }
      if (orientMatch) {
        orientation = orientMatch[1] as 'portrait' | 'landscape';
      } else if (widthMm > heightMm) {
        orientation = 'landscape';
      }
    }

    // 3. Paragraphs and Text Content
    const paragraphCount = (docXml.match(/<w:p\b/g) || []).length;

    // Extract raw text from <w:t> tags
    const textPieces: string[] = [];
    const tRegex = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(docXml)) !== null) {
      if (tMatch[1]) {
        textPieces.push(tMatch[1]);
      }
    }
    const fullText = textPieces.join(' ');
    const characterCount = fullText.replace(/\s+/g, '').length;

    // 4. Tables and Rows/Columns
    // Find all <w:tbl> blocks
    const tableRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
    const tableMatches = docXml.match(tableRegex) || [];
    const tables: Array<{ rows: number; cols: number }> = [];

    for (const tblXml of tableMatches) {
      const rowMatches = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
      const rows = rowMatches.length;
      let maxCols = 0;
      for (const rowXml of rowMatches) {
        const colMatches = rowXml.match(/<w:tc\b/g) || [];
        if (colMatches.length > maxCols) {
          maxCols = colMatches.length;
        }
      }
      tables.push({ rows, cols: maxCols });
    }

    // 5. Embedded Media Images
    let embeddedImagesCount = 0;
    zip.folder('word/media')?.forEach(() => {
      embeddedImagesCount++;
    });

    // Drawing elements in document.xml
    const drawingsCount = (docXml.match(/<w:drawing\b/g) || []).length;
    const pictsCount = (docXml.match(/<w:pict\b/g) || []).length;
    const shapesCount = drawingsCount + pictsCount;

    // 6. Headers and Footers
    const headerFiles = Object.keys(zip.files).filter((f) => /^word\/header\d+\.xml$/.test(f));
    const footerFiles = Object.keys(zip.files).filter((f) => /^word\/footer\d+\.xml$/.test(f));

    return {
      sectionsCount,
      pageSize: {
        widthMm,
        heightMm,
        orientation,
      },
      paragraphCount,
      characterCount,
      tableCount: tables.length,
      tables,
      embeddedImagesCount,
      shapesCount,
      hasHeader: headerFiles.length > 0,
      hasFooter: footerFiles.length > 0,
      textSnippet: fullText.slice(0, 300),
    };
  }

  /**
   * Compares two DOCX models and generates structural divergence metrics.
   */
  public async compareDocx(
    generatedDocxPath: string,
    referenceDocxPath?: string
  ): Promise<DocxStructureComparison> {
    const genModel = await this.extractModel(generatedDocxPath);

    if (!referenceDocxPath || !fs.existsSync(referenceDocxPath)) {
      return {
        hasBothDocx: false,
        generatedModel: genModel,
        matches: {
          sections: true,
          pageOrientation: true,
          pageSize: true,
          tableCount: true,
          imageCount: true,
        },
        tableDetails: genModel.tables.map((t, i) => ({
          index: i + 1,
          genRows: t.rows,
          genCols: t.cols,
          isNative: true,
          match: true,
        })),
        structuralNotices: [
          '기준(Reference) DOCX가 제공되지 않아 생성된 DOCX 단독 구조 메트릭을 추출했습니다 (부분 감사 모드).',
        ],
      };
    }

    const refModel = await this.extractModel(referenceDocxPath);
    const notices: string[] = [];

    // Check Page Orientation & Size
    const orientationMatch = genModel.pageSize.orientation === refModel.pageSize.orientation;
    if (!orientationMatch) {
      notices.push(
        `용지 방향 불일치: 생성=${genModel.pageSize.orientation}, 기준=${refModel.pageSize.orientation}`
      );
    }

    const pageSizeMatch =
      Math.abs(genModel.pageSize.widthMm - refModel.pageSize.widthMm) <= 5 &&
      Math.abs(genModel.pageSize.heightMm - refModel.pageSize.heightMm) <= 5;
    if (!pageSizeMatch) {
      notices.push(
        `용지 크기 차이: 생성=${genModel.pageSize.widthMm}x${genModel.pageSize.heightMm}mm, 기준=${refModel.pageSize.widthMm}x${refModel.pageSize.heightMm}mm`
      );
    }

    // Check Table Structures
    const tableCountMatch = genModel.tableCount === refModel.tableCount;
    if (!tableCountMatch) {
      notices.push(
        `표 개수 차이: 생성=${genModel.tableCount}개, 기준=${refModel.tableCount}개 (누락 또는 병합 여부 확인 필요)`
      );
    }

    const tableDetails: TableStructuralDetail[] = [];
    const maxTableCount = Math.max(genModel.tableCount, refModel.tableCount);
    for (let i = 0; i < maxTableCount; i++) {
      const gTable = genModel.tables[i];
      const rTable = refModel.tables[i];
      const match = gTable && rTable && gTable.rows === rTable.rows && gTable.cols === rTable.cols;

      tableDetails.push({
        index: i + 1,
        genRows: gTable ? gTable.rows : 0,
        genCols: gTable ? gTable.cols : 0,
        refRows: rTable ? rTable.rows : undefined,
        refCols: rTable ? rTable.cols : undefined,
        isNative: Boolean(gTable),
        match: Boolean(match),
      });

      if (gTable && rTable && !match) {
        notices.push(
          `표 #${i + 1} 구조 불일치: 생성(${gTable.rows}행 x ${gTable.cols}열) vs 기준(${rTable.rows}행 x ${rTable.cols}열)`
        );
      }
    }

    // Check Image Count
    const imageCountMatch = genModel.embeddedImagesCount === refModel.embeddedImagesCount;
    if (!imageCountMatch) {
      notices.push(
        `임베디드 이미지 수 차이: 생성=${genModel.embeddedImagesCount}개, 기준=${refModel.embeddedImagesCount}개`
      );
    }

    // Text Jaccard Similarity (Word-level tokens)
    const genWords = new Set(genModel.textSnippet.toLowerCase().split(/\s+/).filter(Boolean));
    const refWords = new Set(refModel.textSnippet.toLowerCase().split(/\s+/).filter(Boolean));
    const intersection = new Set([...genWords].filter((x) => refWords.has(x)));
    const union = new Set([...genWords, ...refWords]);
    const jaccard = union.size > 0 ? intersection.size / union.size : 1.0;

    if (jaccard < 0.7) {
      notices.push(`텍스트 유사도 낮음 (${(jaccard * 100).toFixed(1)}%): 본문 내용 또는 어휘 불일치 감지`);
    }

    return {
      hasBothDocx: true,
      generatedModel: genModel,
      referenceModel: refModel,
      matches: {
        sections: genModel.sectionsCount === refModel.sectionsCount,
        pageOrientation: orientationMatch,
        pageSize: pageSizeMatch,
        tableCount: tableCountMatch,
        imageCount: imageCountMatch,
      },
      tableDetails,
      textJaccardSimilarity: Number(jaccard.toFixed(3)),
      structuralNotices: notices,
    };
  }
}
