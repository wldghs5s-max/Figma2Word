import * as fs from 'fs';
import * as path from 'path';
import { QualityAuditResult, PageVisualComparison } from './types.js';

export class ReportGenerator {
  /**
   * Encodes a local image file to base64 Data URL for zero-dependency standalone HTML viewing.
   */
  private toDataUrl(filePath?: string): string {
    if (!filePath || !fs.existsSync(filePath)) {
      return '';
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  /**
   * Generates a fully self-contained offline HTML audit report.
   */
  public generateHtmlReport(result: QualityAuditResult, outputPath: string): string {
    const fullOutputPath = path.resolve(outputPath);
    const outDir = path.dirname(fullOutputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const badgeColor =
      result.summary.status === 'PASS'
        ? '#16a34a'
        : result.summary.status === 'WARNING'
        ? '#d97706'
        : result.summary.status === 'FAIL'
        ? '#dc2626'
        : '#4b5563';

    const pageCardsHtml = result.pageVisualComparisons
      .map((p) => this.renderPageComparisonCard(p))
      .join('\n');

    const structHtml = this.renderStructureSection(result);

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Figma2Word 변환 품질 감사 보고서 - ${escapeHtml(result.title)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 32px 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    header {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px 32px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    h1 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .subtitle { font-size: 14px; color: var(--text-muted); }
    .badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 18px 20px;
    }
    .metric-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; }
    .metric-value { font-size: 24px; font-weight: 700; color: #fff; }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      margin: 32px 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--card-border);
      color: #fff;
    }
    .page-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--card-border);
      flex-wrap: wrap;
      gap: 8px;
    }
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .image-viewer {
      background: #090d16;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .image-viewer-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 8px;
      align-self: flex-start;
    }
    .image-viewer img {
      width: 100%;
      height: auto;
      max-height: 520px;
      object-fit: contain;
      border-radius: 4px;
      background: #ffffff;
    }
    .struct-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 13px;
    }
    .struct-table th, .struct-table td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--card-border);
    }
    .struct-table th { background: #131d2e; color: var(--text-muted); font-weight: 600; }
    .code-box {
      background: #090d16;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #38bdf8;
      overflow-x: auto;
      margin-top: 8px;
    }
    .notice-item {
      padding: 8px 12px;
      background: #2a1f10;
      border-left: 4px solid var(--warning);
      margin-bottom: 8px;
      border-radius: 4px;
      font-size: 13px;
      color: #fde68a;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Figma2Word 품질 감사 보고서</h1>
        <div class="subtitle">대상 ID: ${escapeHtml(result.id)} | 감사 일시: ${escapeHtml(result.timestamp)}</div>
      </div>
      <div>
        <span class="badge" style="background: ${badgeColor};">${result.summary.status}</span>
      </div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">검사된 페이지 수</div>
        <div class="metric-value">${result.summary.totalEvaluatedPages} p</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">시각 일치 페이지</div>
        <div class="metric-value" style="color: var(--success);">${result.summary.passedPages} p</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">주의 필요 페이지</div>
        <div class="metric-value" style="color: ${result.summary.warningPages > 0 ? 'var(--warning)' : 'inherit'};">${result.summary.warningPages} p</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">구조적 불일치 항목</div>
        <div class="metric-value" style="color: ${result.summary.structuralDiscrepancies > 0 ? 'var(--danger)' : 'inherit'};">${result.summary.structuralDiscrepancies} 건</div>
      </div>
    </div>

    ${result.summary.statusMessage ? `<div style="background: #1e293b; border: 1px solid #334155; padding: 14px 20px; border-radius: 8px; margin-bottom: 24px; font-size: 14px;"><strong>종합 평가:</strong> ${escapeHtml(result.summary.statusMessage)}</div>` : ''}

    <h2 class="section-title">1. 페이지별 시각적 비교 (Visual Comparison)</h2>
    ${pageCardsHtml || '<div style="color: var(--text-muted); padding: 20px;">비교할 페이지 이미지가 없습니다.</div>'}

    <h2 class="section-title">2. DOCX OpenXML 구조 비교 (Structural Divergence)</h2>
    ${structHtml}

    ${result.reproductionCommand ? `
    <h2 class="section-title">3. 감사 재현 명령 (Reproduction)</h2>
    <div class="code-box">${escapeHtml(result.reproductionCommand)}</div>
    ` : ''}

    <footer style="margin-top: 48px; text-align: center; color: var(--text-muted); font-size: 12px; padding: 20px 0;">
      Generated deterministically by Figma2Word Quality Audit Engine (Step 12A)
    </footer>
  </div>
</body>
</html>`;

    fs.writeFileSync(fullOutputPath, html, 'utf8');
    return fullOutputPath;
  }

  private renderPageComparisonCard(p: PageVisualComparison): string {
    const baseUri = this.toDataUrl(p.baseImagePath);
    const testUri = this.toDataUrl(p.testImagePath);
    const diffUri = this.toDataUrl(p.diffImagePath);
    const overlayUri = this.toDataUrl(p.overlayImagePath);

    const mismatchPct = (p.mismatchRatio * 100).toFixed(2);
    const statusColor = p.mismatchRatio < 0.05 ? '#22c55e' : p.mismatchRatio < 0.2 ? '#f59e0b' : '#ef4444';

    return `
    <div class="page-card">
      <div class="page-header">
        <div style="font-size: 16px; font-weight: 700;">Page ${p.pageNumber} — <span style="color: ${statusColor};">${escapeHtml(p.visualSummary)}</span></div>
        <div style="font-size: 13px; color: var(--text-muted);">
          픽셀 불일치율: <strong>${mismatchPct}%</strong> (${p.mismatchPixelCount.toLocaleString()} / ${p.totalEvaluatedPixels.toLocaleString()} px) |
          MAE: ${p.mae} | RMSE: ${p.rmse}
        </div>
      </div>
      <div class="image-grid">
        ${baseUri ? `
        <div class="image-viewer">
          <div class="image-viewer-title">기준 (Figma / Reference DOCX)</div>
          <img src="${baseUri}" alt="Base Page ${p.pageNumber}" />
        </div>` : ''}
        ${testUri ? `
        <div class="image-viewer">
          <div class="image-viewer-title">변환 결과 (Figma2Word DOCX)</div>
          <img src="${testUri}" alt="Test Page ${p.pageNumber}" />
        </div>` : ''}
        ${overlayUri ? `
        <div class="image-viewer">
          <div class="image-viewer-title">50% 반투명 오버레이 (Overlay)</div>
          <img src="${overlayUri}" alt="Overlay Page ${p.pageNumber}" />
        </div>` : ''}
        ${diffUri ? `
        <div class="image-viewer">
          <div class="image-viewer-title">차이 강조 맵 (Difference Map)</div>
          <img src="${diffUri}" alt="Diff Page ${p.pageNumber}" />
        </div>` : ''}
      </div>
    </div>`;
  }

  private renderStructureSection(result: QualityAuditResult): string {
    const s = result.structureComparison;
    if (!s) {
      return '<div style="color: var(--text-muted); padding: 16px;">DOCX 구조 비교 데이터가 없습니다.</div>';
    }

    const gen = s.generatedModel;
    const ref = s.referenceModel;

    let noticesHtml = '';
    if (s.structuralNotices.length > 0) {
      noticesHtml = s.structuralNotices
        .map((n) => `<div class="notice-item">${escapeHtml(n)}</div>`)
        .join('\n');
    }

    let tableRowsHtml = '';
    if (s.tableDetails.length > 0) {
      tableRowsHtml = s.tableDetails
        .map(
          (t) => `
        <tr>
          <td>표 #${t.index}</td>
          <td>${t.genRows}행 × ${t.genCols}열</td>
          <td>${t.refRows !== undefined ? `${t.refRows}행 × ${t.refCols}열` : '-'}</td>
          <td><span style="color: ${t.isNative ? 'var(--success)' : 'var(--danger)'};">${t.isNative ? '네이티브 DOCX 표' : '이미지 대체'}</span></td>
          <td><span style="color: ${t.match ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${t.match ? '일치' : '불일치'}</span></td>
        </tr>`
        )
        .join('\n');
    }

    return `
    <div style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 24px; margin-bottom: 24px;">
      ${noticesHtml ? `<div style="margin-bottom: 20px;">${noticesHtml}</div>` : ''}
      <table class="struct-table">
        <thead>
          <tr>
            <th>구조 항목</th>
            <th>Figma2Word 생성 DOCX</th>
            <th>기준(Reference) DOCX</th>
            <th>일치 여부</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>용지 크기 및 방향</td>
            <td>${gen.pageSize.widthMm}×${gen.pageSize.heightMm}mm (${gen.pageSize.orientation})</td>
            <td>${ref ? `${ref.pageSize.widthMm}×${ref.pageSize.heightMm}mm (${ref.pageSize.orientation})` : '-'}</td>
            <td><span style="color: ${s.matches.pageOrientation ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${s.matches.pageOrientation ? '일치' : '불일치'}</span></td>
          </tr>
          <tr>
            <td>섹션 수</td>
            <td>${gen.sectionsCount}개</td>
            <td>${ref ? `${ref.sectionsCount}개` : '-'}</td>
            <td><span style="color: ${s.matches.sections ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${s.matches.sections ? '일치' : '불일치'}</span></td>
          </tr>
          <tr>
            <td>총 문단 수</td>
            <td>${gen.paragraphCount}개</td>
            <td>${ref ? `${ref.paragraphCount}개` : '-'}</td>
            <td>${ref ? `${Math.abs(gen.paragraphCount - ref.paragraphCount)}개 차이` : '-'}</td>
          </tr>
          <tr>
            <td>문자 수 (공백 제외)</td>
            <td>${gen.characterCount.toLocaleString()}자</td>
            <td>${ref ? `${ref.characterCount.toLocaleString()}자` : '-'}</td>
            <td>${s.textJaccardSimilarity !== undefined ? `단어 유사도 ${(s.textJaccardSimilarity * 100).toFixed(1)}%` : '-'}</td>
          </tr>
          <tr>
            <td>네이티브 표 개수</td>
            <td>${gen.tableCount}개</td>
            <td>${ref ? `${ref.tableCount}개` : '-'}</td>
            <td><span style="color: ${s.matches.tableCount ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${s.matches.tableCount ? '일치' : '불일치'}</span></td>
          </tr>
          <tr>
            <td>임베디드 이미지 수</td>
            <td>${gen.embeddedImagesCount}개</td>
            <td>${ref ? `${ref.embeddedImagesCount}개` : '-'}</td>
            <td><span style="color: ${s.matches.imageCount ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${s.matches.imageCount ? '일치' : '불일치'}</span></td>
          </tr>
        </tbody>
      </table>

      ${tableRowsHtml ? `
      <h3 style="font-size: 15px; margin: 24px 0 8px 0; color: #fff;">세부 표(Table) 구조 대조:</h3>
      <table class="struct-table">
        <thead>
          <tr>
            <th>표 번호</th>
            <th>생성 표 구조</th>
            <th>기준 표 구조</th>
            <th>편집 가능성</th>
            <th>구조 일치</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>` : ''}
    </div>`;
  }
}

function escapeHtml(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
