import React, { useState } from 'react';
import { FigmaParser, ParseResult } from '../../../src/parser/figmaParser';
import { DocxRenderer } from '../../../src/renderer/docxRenderer';
import {
  simpleDocumentFixture,
  cardLayoutFixture,
  autoLayoutFixture,
} from '../../../src/fixtures/samples';

export function App() {
  const [mode, setMode] = useState<'balanced' | 'fidelity' | 'editability'>('balanced');
  const [jsonInput, setJsonInput] = useState<string>('');
  const [selectedFixture, setSelectedFixture] = useState<string>('simple');
  const [status, setStatus] = useState<string>('대기 중');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [outputFileName, setOutputFileName] = useState<string>('converted-document.docx');
  const [duration, setDuration] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadPreset = async (preset: string) => {
    setSelectedFixture(preset);
    setErrorMsg(null);
    if (preset === 'simple') {
      setJsonInput(JSON.stringify(simpleDocumentFixture, null, 2));
      setOutputFileName('simple-document.docx');
    } else if (preset === 'card') {
      setJsonInput(JSON.stringify(cardLayoutFixture, null, 2));
      setOutputFileName('card-layout.docx');
    } else if (preset === 'auto') {
      setJsonInput(JSON.stringify(autoLayoutFixture, null, 2));
      setOutputFileName('auto-layout.docx');
    } else if (preset === 'proposal') {
      const data = await import('../../../samples/real-world/sample-a-proposal-doc.json');
      setJsonInput(JSON.stringify(data.default || data, null, 2));
      setOutputFileName('sample-a-proposal-doc.docx');
    } else if (preset === 'nested') {
      const data = await import('../../../samples/real-world/sample-b-nested-autolayout.json');
      setJsonInput(JSON.stringify(data.default || data, null, 2));
      setOutputFileName('sample-b-nested-autolayout.docx');
    } else if (preset === 'stress') {
      const data = await import('../../../samples/real-world/sample-c-stress-absolute.json');
      setJsonInput(JSON.stringify(data.default || data, null, 2));
      setOutputFileName('sample-c-stress-absolute.docx');
    } else if (preset === 'edge') {
      const data = await import('../../../samples/real-world/sample-d-edge-cases.json');
      setJsonInput(JSON.stringify(data.default || data, null, 2));
      setOutputFileName('sample-d-edge-cases.docx');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setJsonInput(text);
      setOutputFileName(file.name.replace(/\.[^/.]+$/, '') + '.docx');
      setErrorMsg(null);
    };
    reader.readAsText(file);
  };

  const handleConvert = async () => {
    try {
      setErrorMsg(null);
      setStatus('변환 중...');
      const startTime = performance.now();

      const inputContent = jsonInput.trim() || JSON.stringify(simpleDocumentFixture);
      const parsedData = JSON.parse(inputContent);

      const parser = new FigmaParser();
      const result = parser.parse(parsedData);
      result.document.metadata.conversionMode = mode;

      const renderer = new DocxRenderer();
      const blob = await renderer.renderToBlob(result.document);

      const endTime = performance.now();

      setParseResult(result);
      setDocxBlob(blob);
      setDuration(Math.round(endTime - startTime));
      setStatus('변환 완료');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '변환 중 오류가 발생했습니다.');
      setStatus('오류 발생');
    }
  };

  const handleDownload = () => {
    if (!docxBlob) return;
    const url = URL.createObjectURL(docxBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 860, margin: '40px auto', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '0 20px', color: '#1f2937' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: 28, color: '#111827' }}>Figma2Word</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 15 }}>
          Figma 디자인을 분석하여 Microsoft Word 문서(.docx)로 재구성하는 로컬 변환 도구
        </p>
      </header>

      {/* Input Selection */}
      <section style={{ backgroundColor: '#f9fafb', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>1. Figma 데이터 입력</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => loadPreset('simple')}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'simple' ? '#2563eb' : '#fff', color: selectedFixture === 'simple' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13 }}
          >
            기본: 심플 문서
          </button>
          <button
            type="button"
            onClick={() => loadPreset('card')}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'card' ? '#2563eb' : '#fff', color: selectedFixture === 'card' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13 }}
          >
            기본: 카드 레이아웃
          </button>
          <button
            type="button"
            onClick={() => loadPreset('auto')}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'auto' ? '#2563eb' : '#fff', color: selectedFixture === 'auto' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13 }}
          >
            기본: 오토레이아웃 그리드
          </button>
          <button
            type="button"
            onClick={() => loadPreset('proposal')}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'proposal' ? '#16a34a' : '#fff', color: selectedFixture === 'proposal' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            실무: A.제안서 전문
          </button>
          <button
            type="button"
            onClick={() => loadPreset('nested')}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'nested' ? '#16a34a' : '#fff', color: selectedFixture === 'nested' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            실무: B.중첩 오토레이아웃
          </button>
          <button
            type="button"
            onClick={() => loadPreset('stress')}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'stress' ? '#d97706' : '#fff', color: selectedFixture === 'stress' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            스트레스: C.절대좌표 한계
          </button>
          <button
            type="button"
            onClick={() => loadPreset('edge')}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'edge' ? '#6b7280' : '#fff', color: selectedFixture === 'edge' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13 }}
          >
            엣지: D.결측치 및 미지원
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 6 }}>
            또는 Figma JSON 파일 업로드:
          </label>
          <input type="file" accept=".json" onChange={handleFileUpload} />
        </div>

        <div>
          <label style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 6 }}>
            Figma JSON 직접 확인 및 편집:
          </label>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Figma AST JSON을 여기에 붙여넣으세요..."
            rows={8}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
          />
        </div>
      </section>

      {/* Mode Selection */}
      <section style={{ backgroundColor: '#f9fafb', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>2. 변환 모드 (Conversion Mode)</h3>
        <div style={{ display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="mode"
              value="balanced"
              checked={mode === 'balanced'}
              onChange={() => setMode('balanced')}
            />
            <span><strong>Balanced</strong> (권장: 디자인과 편집성 균형)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="mode"
              value="fidelity"
              checked={mode === 'fidelity'}
              onChange={() => setMode('fidelity')}
            />
            <span><strong>Design Fidelity</strong> (디자인 외형 우선)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="mode"
              value="editability"
              checked={mode === 'editability'}
              onChange={() => setMode('editability')}
            />
            <span><strong>Word Editability</strong> (문서 수정 용이성 우선)</span>
          </label>
        </div>
      </section>

      {/* Action */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleConvert}
          style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '12px 24px', fontSize: 16, fontWeight: 600, borderRadius: 6, cursor: 'pointer' }}
        >
          DOCX로 변환하기
        </button>
        <span style={{ fontSize: 14, color: '#4b5563' }}>상태: <strong>{status}</strong></span>
      </div>

      {errorMsg && (
        <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 6, marginBottom: 20 }}>
          {errorMsg}
        </div>
      )}

      {/* Result Card */}
      {parseResult && (
        <section style={{ backgroundColor: '#ffffff', border: '1px solid #d1d5db', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, fontSize: 18, color: '#111827' }}>변환 결과 리포트</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 14 }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px 0', color: '#6b7280' }}>출력 파일명</td>
                <td style={{ padding: '8px 0', fontWeight: 600 }}>{outputFileName}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px 0', color: '#6b7280' }}>변환 소요시간</td>
                <td style={{ padding: '8px 0' }}>{duration} ms</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px 0', color: '#6b7280' }}>노드 통계</td>
                <td style={{ padding: '8px 0' }}>
                  전체 {parseResult.stats.totalNodes}개 |
                  <span style={{ color: '#16a34a', marginLeft: 4 }}>지원: {parseResult.stats.supportedNodes}</span> |
                  <span style={{ color: '#d97706', marginLeft: 4 }}>부분지원: {parseResult.stats.partiallySupportedNodes}</span> |
                  <span style={{ color: '#dc2626', marginLeft: 4 }}>미지원: {parseResult.stats.unsupportedNodes}</span> |
                  <span style={{ color: '#6b7280', marginLeft: 4 }}>폴백: {parseResult.stats.fallbackNodes}</span>
                </td>
              </tr>
            </tbody>
          </table>

          {docxBlob && (
            <div style={{ marginBottom: 20 }}>
              <button
                type="button"
                onClick={handleDownload}
                style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 15, fontWeight: 600, borderRadius: 6, cursor: 'pointer' }}
              >
                📥 DOCX 파일 다운로드 ({Math.round(docxBlob.size / 1024)} KB)
              </button>
            </div>
          )}

          {parseResult.notices.length > 0 && (
            <div>
              <h4 style={{ margin: '12px 0 8px 0', fontSize: 14 }}>변환 매핑 세부 사항:</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#4b5563', maxHeight: 180, overflowY: 'auto' }}>
                {parseResult.notices.map((n, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: n.status === 'Supported' ? '#16a34a' : n.status === 'Fallback' ? '#d97706' : '#dc2626' }}>
                      [{n.status}]
                    </span>{' '}
                    {n.nodeName} ({n.nodeType}): {n.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
