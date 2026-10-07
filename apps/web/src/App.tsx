import React, { useState } from 'react';
import { FigmaParser, ParseResult } from '../../../src/parser/figmaParser';
import { DocxRenderer } from '../../../src/renderer/docxRenderer';
import { FigmaClient, parseFigmaUrl, FigmaApiError } from '../../../src/api/index';
import {
  simpleDocumentFixture,
  cardLayoutFixture,
  autoLayoutFixture,
} from '../../../src/fixtures/samples';

export function App() {
  const [mode, setMode] = useState<'balanced' | 'fidelity' | 'editability'>('balanced');
  const [inputTab, setInputTab] = useState<'preset' | 'url' | 'manual'>('preset');
  const [figmaUrl, setFigmaUrl] = useState<string>('');
  const [accessToken, setAccessToken] = useState<string>('');
  const [jsonInput, setJsonInput] = useState<string>('');
  const [selectedFixture, setSelectedFixture] = useState<string>('simple');
  const [status, setStatus] = useState<string>('대기 중');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [outputFileName, setOutputFileName] = useState<string>('converted-document.docx');
  const [duration, setDuration] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

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
    } else if (preset === 'e2e-doc') {
      const data = await import('../../../samples/real-world/sample-e2e-document.json');
      setJsonInput(JSON.stringify(data.default || data, null, 2));
      setOutputFileName('sample-e2e-document.docx');
    } else if (preset === 'e2e-card') {
      const data = await import('../../../samples/real-world/sample-e2e-card-grid.json');
      setJsonInput(JSON.stringify(data.default || data, null, 2));
      setOutputFileName('sample-e2e-card-grid.docx');
    } else if (preset === 'e2e-complex') {
      const data = await import('../../../samples/real-world/sample-e2e-complex-layout.json');
      setJsonInput(JSON.stringify(data.default || data, null, 2));
      setOutputFileName('sample-e2e-complex-layout.docx');
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

  const handleFetchAndConvert = async () => {
    if (!figmaUrl.trim()) {
      setErrorMsg('Figma URL을 입력해주세요.');
      return;
    }
    if (!accessToken.trim()) {
      setErrorMsg('Figma Access Token (PAT)을 입력해주세요.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setStatus('Figma API 호출 및 데이터 수신 중...');
      const startTime = performance.now();

      const parsed = parseFigmaUrl(figmaUrl);
      const client = new FigmaClient({ accessToken: accessToken.trim() });

      let targetNode: any;
      if (parsed.nodeId) {
        setStatus(`Figma 노드 [${parsed.nodeId}] 수신 중...`);
        const nodesRes = await client.fetchNodes(parsed.fileKey, [parsed.nodeId]);
        targetNode = nodesRes.nodes[parsed.nodeId]?.document;
        if (!targetNode) {
          throw new FigmaApiError(`노드 '${parsed.nodeId}'를 찾을 수 없습니다.`, 404);
        }
      } else {
        setStatus(`Figma 파일 [${parsed.fileKey}] 전체 트리 수신 중...`);
        targetNode = await client.fetchFile(parsed.fileKey);
      }

      setStatus('이미지 에셋 확인 및 다운로드 중...');
      const rootNode = 'document' in targetNode ? targetNode.document : targetNode;
      const imageMap = await client.resolveImages(parsed.fileKey, rootNode);

      setStatus('문서 모델(IR) 및 레이아웃 파싱 중...');
      const parser = new FigmaParser({ imageMap });
      const result = parser.parse(targetNode);
      result.document.metadata.conversionMode = mode;
      if (parsed.fileName) {
        result.document.metadata.title = parsed.fileName;
      }

      setStatus('Word (.docx) 렌더링 중...');
      const renderer = new DocxRenderer();
      const blob = await renderer.renderToBlob(result.document);

      const endTime = performance.now();
      setParseResult(result);
      setDocxBlob(blob);
      setOutputFileName(`${parsed.fileName || `figma-${parsed.fileKey}`}.docx`);
      setDuration(Math.round(endTime - startTime));
      setStatus('변환 완료');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Figma 데이터 변환 중 오류가 발생했습니다.');
      setStatus('오류 발생');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConvert = async () => {
    try {
      setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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
    <div style={{ maxWidth: 880, margin: '40px auto', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '0 20px', color: '#1f2937' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: 28, color: '#111827' }}>Figma2Word</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 15 }}>
          Figma 디자인을 분석하여 Microsoft Word 문서(.docx)로 재구성하는 로컬-우선 변환 엔진 (Phase 4: Live Figma E2E)
        </p>
      </header>

      {/* Input Selection Tabs */}
      <section style={{ backgroundColor: '#f9fafb', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 12, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setInputTab('preset')}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: inputTab === 'preset' ? '#2563eb' : '#e5e7eb', color: inputTab === 'preset' ? '#fff' : '#374151', cursor: 'pointer', fontWeight: 600 }}
          >
            샘플 프리셋 및 JSON
          </button>
          <button
            type="button"
            onClick={() => setInputTab('url')}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: inputTab === 'url' ? '#2563eb' : '#e5e7eb', color: inputTab === 'url' ? '#fff' : '#374151', cursor: 'pointer', fontWeight: 600 }}
          >
            Figma URL 라이브 연동
          </button>
        </div>

        {inputTab === 'url' ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Figma URL:
              </label>
              <input
                type="text"
                value={figmaUrl}
                onChange={(e) => setFigmaUrl(e.target.value)}
                placeholder="https://www.figma.com/design/:fileKey/:title?node-id=1-2"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Figma Personal Access Token (PAT):
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="figd_... (토큰은 서버로 전송되지 않고 브라우저 로컬에서만 사용됩니다)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
            </div>
            <button
              type="button"
              onClick={handleFetchAndConvert}
              disabled={isLoading}
              style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              {isLoading ? '연동 및 변환 중...' : 'Figma 실시간 가져오기 & DOCX 변환'}
            </button>
          </div>
        ) : (
          <div>
            <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>검증용 프리셋 선택:</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              <button type="button" onClick={() => loadPreset('e2e-doc')} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'e2e-doc' ? '#2563eb' : '#fff', color: selectedFixture === 'e2e-doc' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                E2E: A.문서형 (Heading/Image)
              </button>
              <button type="button" onClick={() => loadPreset('e2e-card')} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'e2e-card' ? '#2563eb' : '#fff', color: selectedFixture === 'e2e-card' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                E2E: B.카드형 (3-Col Grid)
              </button>
              <button type="button" onClick={() => loadPreset('e2e-complex')} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'e2e-complex' ? '#2563eb' : '#fff', color: selectedFixture === 'e2e-complex' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                E2E: C.복합형 (Overlay/Metrics)
              </button>
              <button type="button" onClick={() => loadPreset('proposal')} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'proposal' ? '#16a34a' : '#fff', color: selectedFixture === 'proposal' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12 }}>
                실무: 제안서 전문
              </button>
              <button type="button" onClick={() => loadPreset('nested')} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'nested' ? '#16a34a' : '#fff', color: selectedFixture === 'nested' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12 }}>
                실무: 중첩 오토레이아웃
              </button>
              <button type="button" onClick={() => loadPreset('stress')} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'stress' ? '#d97706' : '#fff', color: selectedFixture === 'stress' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12 }}>
                스트레스: 절대좌표
              </button>
              <button type="button" onClick={() => loadPreset('simple')} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'simple' ? '#4b5563' : '#fff', color: selectedFixture === 'simple' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 12 }}>
                기본: 심플
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                또는 Figma JSON 파일 업로드:
              </label>
              <input type="file" accept=".json" onChange={handleFileUpload} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder="Figma AST JSON을 여기에 붙여넣으세요..."
                rows={6}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 11, padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
            </div>

            <button
              type="button"
              onClick={handleConvert}
              disabled={isLoading}
              style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              JSON 데이터 변환 실행
            </button>
          </div>
        )}
      </section>

      {/* Mode Selection */}
      <section style={{ backgroundColor: '#f9fafb', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <h4 style={{ marginTop: 0, marginBottom: 10, fontSize: 14 }}>변환 모드 (Conversion Mode)</h4>
        <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="mode" value="balanced" checked={mode === 'balanced'} onChange={() => setMode('balanced')} />
            <span><strong>Balanced</strong> (권장: 균형 모드)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="mode" value="fidelity" checked={mode === 'fidelity'} onChange={() => setMode('fidelity')} />
            <span><strong>Design Fidelity</strong> (디자인 우선)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="mode" value="editability" checked={mode === 'editability'} onChange={() => setMode('editability')} />
            <span><strong>Editability</strong> (편집성 우선)</span>
          </label>
        </div>
      </section>

      {/* Status & Alerts */}
      {errorMsg && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: 6, color: '#991b1b', marginBottom: 20, fontSize: 14 }}>
          <strong>오류:</strong> {errorMsg}
        </div>
      )}

      {/* Result Section */}
      <section style={{ backgroundColor: '#f9fafb', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>진행 상태 및 변환 결과</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 14 }}>
          <strong>상태:</strong> {status} {duration !== null && `(${duration}ms)`}
        </p>

        {docxBlob && (
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={handleDownload}
              style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              📥 Microsoft Word 문서 (.docx) 다운로드
            </button>
          </div>
        )}

        {parseResult && (
          <div>
            <h4 style={{ margin: '16px 0 8px 0', fontSize: 14 }}>파싱 통계</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#fff', padding: 10, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>전체 노드</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{parseResult.stats.totalNodes}</div>
              </div>
              <div style={{ background: '#fff', padding: 10, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#16a34a' }}>지원 (Supported)</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{parseResult.stats.supportedNodes}</div>
              </div>
              <div style={{ background: '#fff', padding: 10, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#2563eb' }}>부분 지원</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{parseResult.stats.partiallySupportedNodes}</div>
              </div>
              <div style={{ background: '#fff', padding: 10, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#d97706' }}>대체 (Fallback)</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{parseResult.stats.fallbackNodes}</div>
              </div>
              <div style={{ background: '#fff', padding: 10, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#dc2626' }}>미지원</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{parseResult.stats.unsupportedNodes}</div>
              </div>
            </div>

            {parseResult.notices.length > 0 && (
              <div>
                <h4 style={{ margin: '16px 0 8px 0', fontSize: 14 }}>변환 공지사항 (최근 15건)</h4>
                <div style={{ maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, padding: 8, fontSize: 12 }}>
                  {parseResult.notices.slice(0, 15).map((n, idx) => (
                    <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ fontWeight: 600, color: n.status === 'Supported' ? '#16a34a' : n.status === 'Partially Supported' ? '#2563eb' : '#dc2626' }}>
                        [{n.status}]
                      </span>{' '}
                      <strong>{n.nodeName}</strong> ({n.nodeType}): {n.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;

