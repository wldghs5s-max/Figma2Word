import React, { useState, useRef } from 'react';
import { FigmaParser, ParseResult } from '../../../src/parser/figmaParser';
import { DocxRenderer } from '../../../src/renderer/docxRenderer';
import { FigmaClient, parseFigmaUrl, findNodeEntry, FigmaApiError } from '../../../src/api/index';
import {
  FigmaSnapshot,
  isFigmaSnapshot,
  createFigmaSnapshot,
  assessImageCompleteness,
  SelectableFrame,
  extractSelectableFrames,
  filterFigmaNodeByFrames,
} from '../../../src/pipeline/index';
import {
  simpleDocumentFixture,
  cardLayoutFixture,
  autoLayoutFixture,
} from '../../../src/fixtures/samples';

export function App() {
  const [mode, setMode] = useState<'balanced' | 'fidelity' | 'editability'>('balanced');
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
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
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    name: string;
    sizeBytes: number;
    frameCount: number;
  } | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<{
    targetNode: any;
    imageMap?: Record<string, string>;
    fileName?: string;
    fileKey?: string;
    nodeId?: string;
  } | null>(null);
  const [selectableFrames, setSelectableFrames] = useState<SelectableFrame[]>([]);
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);

  const conversionReqIdRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateFramesFromNode = (node: any) => {
    try {
      const frames = extractSelectableFrames(node);
      setSelectableFrames(frames);
      setSelectedFrameIds(frames.map((f) => f.id));
    } catch {
      setSelectableFrames([]);
      setSelectedFrameIds([]);
    }
  };

  const handleToggleFrame = (frameId: string) => {
    conversionReqIdRef.current++;
    setSelectedFrameIds((prev) =>
      prev.includes(frameId) ? prev.filter((id) => id !== frameId) : [...prev, frameId]
    );
    setDocxBlob(null);
  };

  const handleSelectAllFrames = () => {
    conversionReqIdRef.current++;
    setSelectedFrameIds(selectableFrames.map((f) => f.id));
    setDocxBlob(null);
  };

  const handleDeselectAllFrames = () => {
    conversionReqIdRef.current++;
    setSelectedFrameIds([]);
    setDocxBlob(null);
  };

  const handleSelectOnlyA4Frames = () => {
    conversionReqIdRef.current++;
    const a4Ids = selectableFrames.filter((f) => f.isRecommendedA4).map((f) => f.id);
    setSelectedFrameIds(a4Ids.length > 0 ? a4Ids : selectableFrames.map((f) => f.id));
    setDocxBlob(null);
  };

  const handleClearUploadedFile = () => {
    conversionReqIdRef.current++;
    setUploadedFileInfo(null);
    setLoadedSnapshot(null);
    setSelectableFrames([]);
    setSelectedFrameIds([]);
    setDocxBlob(null);
    setParseResult(null);
    setStatus('대기 중');
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadPreset = async (preset: string) => {
    conversionReqIdRef.current++;
    setUploadedFileInfo(null);
    setSelectedFixture(preset);
    setErrorMsg(null);
    let fixtureNode: any = simpleDocumentFixture;
    if (preset === 'simple') {
      fixtureNode = simpleDocumentFixture;
      setJsonInput(JSON.stringify(simpleDocumentFixture, null, 2));
      setOutputFileName('simple-document.docx');
    } else if (preset === 'card') {
      fixtureNode = cardLayoutFixture;
      setJsonInput(JSON.stringify(cardLayoutFixture, null, 2));
      setOutputFileName('card-layout.docx');
    } else if (preset === 'auto') {
      fixtureNode = autoLayoutFixture;
      setJsonInput(JSON.stringify(autoLayoutFixture, null, 2));
      setOutputFileName('auto-layout.docx');
    } else if (preset === 'proposal') {
      const data = await import('../../../samples/real-world/sample-a-proposal-doc.json');
      fixtureNode = data.default || data;
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputFileName('sample-a-proposal-doc.docx');
    } else if (preset === 'nested') {
      const data = await import('../../../samples/real-world/sample-b-nested-autolayout.json');
      fixtureNode = data.default || data;
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputFileName('sample-b-nested-autolayout.docx');
    } else if (preset === 'stress') {
      const data = await import('../../../samples/real-world/sample-c-stress-absolute.json');
      fixtureNode = data.default || data;
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputFileName('sample-c-stress-absolute.docx');
    } else if (preset === 'edge') {
      const data = await import('../../../samples/real-world/sample-d-edge-cases.json');
      fixtureNode = data.default || data;
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputFileName('sample-d-edge-cases.docx');
    } else if (preset === 'e2e-doc') {
      const data = await import('../../../samples/real-world/sample-e2e-document.json');
      fixtureNode = data.default || data;
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputFileName('sample-e2e-document.docx');
    } else if (preset === 'e2e-card') {
      const data = await import('../../../samples/real-world/sample-e2e-card-grid.json');
      fixtureNode = data.default || data;
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputFileName('sample-e2e-card-grid.docx');
    } else if (preset === 'e2e-complex') {
      const data = await import('../../../samples/real-world/sample-e2e-complex-layout.json');
      fixtureNode = data.default || data;
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputFileName('sample-e2e-complex-layout.docx');
    }
    updateFramesFromNode('document' in fixtureNode ? fixtureNode.document : fixtureNode);
    setDocxBlob(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    conversionReqIdRef.current++;
    setDocxBlob(null);
    setParseResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsedData = JSON.parse(text);
        let extractedNode: any;
        if (isFigmaSnapshot(parsedData)) {
          extractedNode = parsedData.figmaNode;
          setLoadedSnapshot({
            targetNode: parsedData.figmaNode,
            imageMap: parsedData.imageMap,
            fileName: parsedData.metadata?.fileName || file.name.replace(/\.[^/.]+$/, ''),
            fileKey: parsedData.metadata?.fileKey,
            nodeId: parsedData.metadata?.nodeId,
          });
          updateFramesFromNode(parsedData.figmaNode);
          const imgStats = assessImageCompleteness(parsedData.figmaNode, parsedData.imageMap);
          if (imgStats.referencedCount === 0) {
            setStatus(`Figma 스냅샷 [${parsedData.metadata?.fileName || file.name}] 로드 완료 (이미지 없는 디자인)`);
          } else if (imgStats.isComplete) {
            setStatus(`Figma 스냅샷 [${parsedData.metadata?.fileName || file.name}] 로드 완료 (✅ 이미지 ${imgStats.referencedCount}개 완전 무결)`);
          } else {
            setStatus(`⚠️ Figma 스냅샷 [${parsedData.metadata?.fileName || file.name}] 로드 완료 (경고: 참조 이미지 ${imgStats.referencedCount}개 중 ${imgStats.resolvedCount}개만 포함됨, ${imgStats.missingRefs.length}개 누락)`);
          }
        } else {
          const targetNode = parsedData.document || parsedData;
          extractedNode = targetNode;
          const imageMap = parsedData.images || parsedData.meta?.images || {};
          setLoadedSnapshot({
            targetNode,
            imageMap,
            fileName: file.name.replace(/\.[^/.]+$/, ''),
          });
          updateFramesFromNode(targetNode);
          setStatus(`Figma JSON [${file.name}] 로드 완료`);
        }
        let frameCount = 0;
        try {
          frameCount = extractSelectableFrames(extractedNode).length;
        } catch {
          frameCount = 0;
        }
        setUploadedFileInfo({
          name: file.name,
          sizeBytes: file.size,
          frameCount,
        });
        // 대용량 JSON의 텍스트 문자열(20~40MB)을 React state에 저장하지 않음으로써
        // V8 힙 44MB 점유 및 DOM textarea 렌더링 동결을 완전히 방지
        setJsonInput('');
        setOutputFileName(file.name.replace(/\.[^/.]+$/, '') + '.docx');
        setErrorMsg(null);
      } catch (err: any) {
        setErrorMsg(`JSON 파일 읽기 실패: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleModeChange = (newMode: 'balanced' | 'fidelity' | 'editability') => {
    conversionReqIdRef.current++;
    setMode(newMode);
    setDocxBlob(null);
  };

  const handleOrientationChange = (newOrientation: 'portrait' | 'landscape') => {
    conversionReqIdRef.current++;
    setPageOrientation(newOrientation);
    setDocxBlob(null);
  };

  const handleFetchAndConvert = async () => {
    if (isLoading) return;
    if (!figmaUrl.trim()) {
      setErrorMsg('Figma URL을 입력해주세요.');
      return;
    }
    if (!accessToken.trim()) {
      setErrorMsg('Figma Access Token (PAT)을 입력해주세요.');
      return;
    }

    const currentReqId = ++conversionReqIdRef.current;
    setDocxBlob(null);

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
        if (currentReqId !== conversionReqIdRef.current) return;
        targetNode = findNodeEntry(nodesRes.nodes, parsed.nodeId)?.document;
        if (!targetNode) {
          throw new FigmaApiError(`노드 '${parsed.nodeId}'를 찾을 수 없습니다.`, 404);
        }
      } else {
        setStatus(`Figma 파일 [${parsed.fileKey}] 전체 트리 수신 중...`);
        targetNode = await client.fetchFile(parsed.fileKey);
        if (currentReqId !== conversionReqIdRef.current) return;
      }

      setStatus('이미지 에셋 확인 및 다운로드 중...');
      const rootNode = 'document' in targetNode ? targetNode.document : targetNode;
      const imageMap = await client.resolveImages(parsed.fileKey, rootNode);
      if (currentReqId !== conversionReqIdRef.current) return;

      // Save to memory cache for repeated conversions without API calls
      setLoadedSnapshot({
        targetNode,
        imageMap,
        fileName: parsed.fileName || `figma-${parsed.fileKey}`,
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
      });
      updateFramesFromNode(rootNode);

      setStatus('문서 모델(IR) 및 레이아웃 파싱 중...');
      const parser = new FigmaParser({ imageMap });
      const result = parser.parse(targetNode);

      if (result.stats.totalElements === 0) {
        throw new Error(
          `변환 가능한 Figma 요소를 찾지 못했습니다. 선택한 node-id가 비어있는 Canvas이거나 지원되지 않는 레이어인지 확인하세요. (검사된 총 노드 수: ${result.stats.totalNodes})`
        );
      }

      result.document.metadata.conversionMode = mode;
      result.document.pageConfig.orientation = pageOrientation;
      if (result.document.sections) {
        for (const section of result.document.sections) {
          if (section.pageConfig) {
            section.pageConfig.orientation = pageOrientation;
          }
        }
      }
      if (parsed.fileName) {
        result.document.metadata.title = parsed.fileName;
      }

      setStatus('Word (.docx) 렌더링 중...');
      const renderer = new DocxRenderer();
      const blob = await renderer.renderToBlob(result.document);
      if (currentReqId !== conversionReqIdRef.current) return;

      const endTime = performance.now();
      setParseResult(result);
      setDocxBlob(blob);
      setOutputFileName(`${parsed.fileName || `figma-${parsed.fileKey}`}.docx`);
      setDuration(Math.round(endTime - startTime));
      setStatus('변환 완료');
    } catch (err: any) {
      if (currentReqId !== conversionReqIdRef.current) return;
      console.error(err);
      if (err instanceof FigmaApiError && err.statusCode === 429) {
        const sec = err.rateLimitInfo?.retryAfterSeconds;
        if (typeof sec === 'number' && sec > 0) {
          setErrorMsg(`Figma API 요청 한도(Rate Limit)에 도달했습니다. 약 ${sec}초 후에 다시 시도해 주세요.`);
        } else if (err.rateLimitInfo?.retryAfterRaw) {
          setErrorMsg(`Figma API 요청 한도(Rate Limit)에 도달했습니다. 안내된 대기 시간(${err.rateLimitInfo.retryAfterRaw}) 후에 다시 시도해 주세요.`);
        } else {
          setErrorMsg('Figma API 요청 한도(Rate Limit)에 도달했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } else {
        setErrorMsg(err.message || 'Figma 데이터 변환 중 오류가 발생했습니다.');
      }
      setStatus('오류 발생');
    } finally {
      if (currentReqId === conversionReqIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleReuseAndConvert = async () => {
    if (isLoading || !loadedSnapshot) return;
    if (selectableFrames.length > 0 && selectedFrameIds.length === 0) {
      setErrorMsg('변환할 프레임이 선택되지 않았습니다. 최소 1개 이상의 프레임을 선택해주세요.');
      return;
    }
    const currentReqId = ++conversionReqIdRef.current;
    setDocxBlob(null);

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setStatus('메모리 데이터로 오프라인 변환 중 (API 호출 0회)...');
      const startTime = performance.now();

      const effectiveNode = selectedFrameIds.length > 0 && selectableFrames.length > 0
        ? filterFigmaNodeByFrames(loadedSnapshot.targetNode, selectedFrameIds)
        : loadedSnapshot.targetNode;

      const parser = new FigmaParser({ imageMap: loadedSnapshot.imageMap });
      const result = parser.parse(effectiveNode);

      if (result.stats.totalElements === 0) {
        throw new Error(
          `변환 가능한 Figma 요소를 찾지 못했습니다. 선택한 프레임이 비어있는지 확인하세요.`
        );
      }

      result.document.metadata.conversionMode = mode;
      result.document.pageConfig.orientation = pageOrientation;
      if (result.document.sections) {
        for (const section of result.document.sections) {
          if (section.pageConfig) {
            section.pageConfig.orientation = pageOrientation;
          }
        }
      }

      const renderer = new DocxRenderer();
      const blob = await renderer.renderToBlob(result.document);
      if (currentReqId !== conversionReqIdRef.current) return;
      const endTime = performance.now();

      setParseResult(result);
      setDocxBlob(blob);
      const baseName = (loadedSnapshot.fileName || outputFileName.replace(/\.docx$/i, '')).replace(/-(Portrait|Landscape)$/i, '');
      setOutputFileName(`${baseName}-${pageOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.docx`);
      setDuration(Math.round(endTime - startTime));
      setStatus(`메모리 재변환 완료 (API 호출 0회, ${pageOrientation === 'landscape' ? '가로형' : '세로형'}, ${selectedFrameIds.length > 0 ? `${selectedFrameIds.length}개 프레임` : '전체'})`);
    } catch (err: any) {
      if (currentReqId !== conversionReqIdRef.current) return;
      console.error(err);
      setErrorMsg(err.message || '재변환 중 오류가 발생했습니다.');
      setStatus('오류 발생');
    } finally {
      if (currentReqId === conversionReqIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleConvert = async () => {
    if (isLoading) return;
    const currentReqId = ++conversionReqIdRef.current;
    setDocxBlob(null);

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setStatus('오프라인 변환 중 (API 호출 0회)...');
      const startTime = performance.now();

      let targetNode: any;
      let imageMap: Record<string, string> = {};

      if (loadedSnapshot) {
        targetNode = loadedSnapshot.targetNode;
        imageMap = loadedSnapshot.imageMap || {};
      } else {
        const inputContent = jsonInput.trim() || JSON.stringify(simpleDocumentFixture);
        const parsedData = JSON.parse(inputContent);
        if (isFigmaSnapshot(parsedData)) {
          targetNode = parsedData.figmaNode;
          imageMap = parsedData.imageMap || {};
          setLoadedSnapshot({
            targetNode,
            imageMap,
            fileName: parsedData.metadata?.fileName,
            fileKey: parsedData.metadata?.fileKey,
            nodeId: parsedData.metadata?.nodeId,
          });
        } else {
          targetNode = parsedData.document || parsedData;
          imageMap = parsedData.images || parsedData.meta?.images || {};
        }
      }

      if (selectableFrames.length > 0 && selectedFrameIds.length === 0) {
        setErrorMsg('변환할 프레임이 선택되지 않았습니다. 최소 1개 이상의 프레임을 선택해주세요.');
        return;
      }

      let effectiveNode = targetNode;
      if (selectableFrames.length > 0 && selectedFrameIds.length > 0) {
        effectiveNode = filterFigmaNodeByFrames(targetNode, selectedFrameIds);
      } else {
        const extracted = extractSelectableFrames(targetNode);
        if (extracted.length > 0) {
          setSelectableFrames(extracted);
          setSelectedFrameIds(extracted.map((f) => f.id));
        }
      }

      const parser = new FigmaParser({ imageMap });
      const result = parser.parse(effectiveNode);

      if (result.stats.totalElements === 0) {
        throw new Error(
          `변환 가능한 Figma 요소를 찾지 못했습니다. 입력 데이터에 변환 가능한 노드가 포함되어 있는지 확인하세요.`
        );
      }

      result.document.metadata.conversionMode = mode;
      result.document.pageConfig.orientation = pageOrientation;
      if (result.document.sections) {
        for (const section of result.document.sections) {
          if (section.pageConfig) {
            section.pageConfig.orientation = pageOrientation;
          }
        }
      }

      const renderer = new DocxRenderer();
      const blob = await renderer.renderToBlob(result.document);
      if (currentReqId !== conversionReqIdRef.current) return;

      const endTime = performance.now();

      setParseResult(result);
      setDocxBlob(blob);
      const baseName = (loadedSnapshot?.fileName || outputFileName.replace(/\.docx$/i, '')).replace(/-(Portrait|Landscape)$/i, '');
      setOutputFileName(`${baseName}-${pageOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.docx`);
      setDuration(Math.round(endTime - startTime));
      setStatus(`오프라인 변환 완료 (API 호출 0회, ${pageOrientation === 'landscape' ? '가로형' : '세로형'}, ${selectedFrameIds.length > 0 ? `${selectedFrameIds.length}개 프레임` : '전체'})`);
    } catch (err: any) {
      if (currentReqId !== conversionReqIdRef.current) return;
      console.error(err);
      setErrorMsg(err.message || '변환 중 오류가 발생했습니다.');
      setStatus('오류 발생');
    } finally {
      if (currentReqId === conversionReqIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleDownloadSnapshot = () => {
    if (!loadedSnapshot) return;
    // Security: Never include accessToken or headers in snapshot
    const snapshot = createFigmaSnapshot(
      loadedSnapshot.targetNode,
      loadedSnapshot.imageMap,
      {
        fileName: loadedSnapshot.fileName || outputFileName.replace(/\.docx$/, ''),
        fileKey: loadedSnapshot.fileKey,
        nodeId: loadedSnapshot.nodeId,
      }
    );
    const jsonBlob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${loadedSnapshot.fileName || outputFileName.replace(/\.docx$/, '') || 'figma-snapshot'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleFetchAndConvert}
                disabled={isLoading}
                style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer' }}
              >
                {isLoading ? '연동 및 변환 중...' : 'Figma 실시간 가져오기 & DOCX 변환'}
              </button>
            </div>

            {loadedSnapshot && (() => {
              const effectiveTarget = (selectedFrameIds.length > 0 && selectableFrames.length > 0)
                ? filterFigmaNodeByFrames(loadedSnapshot.targetNode, selectedFrameIds)
                : loadedSnapshot.targetNode;
              const imgStats = assessImageCompleteness(effectiveTarget, loadedSnapshot.imageMap);
              const isWarning = imgStats.referencedCount > 0 && !imgStats.isComplete;
              const isPartialSelection = selectedFrameIds.length > 0 && selectedFrameIds.length < selectableFrames.length;
              return (
                <div
                  style={{
                    marginTop: 14,
                    padding: '12px 14px',
                    background: isWarning ? '#fffbeb' : '#ecfdf5',
                    border: `1px solid ${isWarning ? '#fde68a' : '#a7f3d0'}`,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 13, color: isWarning ? '#92400e' : '#065f46', marginBottom: 6, fontWeight: 700 }}>
                    {isWarning ? '⚠️ 메모리 스냅샷 주의 (이미지 결손 감지)' : '⚡ 메모리 스냅샷 보존 중'}: [{loadedSnapshot.fileName || 'Figma 디자인'}]
                    {isPartialSelection && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 6, color: '#4b5563' }}>(선택된 {selectedFrameIds.length}개 프레임 기준)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: isWarning ? '#b45309' : '#047857', marginBottom: 10 }}>
                    {imgStats.referencedCount === 0 ? (
                      'ℹ️ 이미지 참조 없음 (텍스트 및 벡터 레이아웃 디자인)'
                    ) : imgStats.isComplete ? (
                      `✅ 모든 이미지(${imgStats.referencedCount}개) 오프라인 패키징 완료 — 100% 완전 무결 백업`
                    ) : (
                      `❌ 이미지 누락 경고: 디자인 내 참조 이미지 ${imgStats.referencedCount}개 중 ${imgStats.resolvedCount}개만 확보되었습니다 (${imgStats.missingRefs.length}개 결손). 이 스냅샷은 불완전 백업입니다.`
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleReuseAndConvert}
                      disabled={isLoading}
                      style={{ padding: '8px 16px', borderRadius: 5, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ⚡ 메모리 데이터로 DOCX 즉시 변환 (API 0회)
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSnapshot}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 5,
                        border: `1px solid ${isWarning ? '#d97706' : '#059669'}`,
                        background: isWarning ? '#fff7ed' : '#fff',
                        color: isWarning ? '#b45309' : '#065f46',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isWarning ? '💾 불완전 스냅샷이라도 저장 (.json)' : '💾 Figma JSON 스냅샷 저장 (.json)'}
                    </button>
                  </div>
                </div>
              );
            })()}
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
                {uploadedFileInfo ? '다른 Figma JSON 파일로 교체:' : '또는 Figma JSON 파일 업로드:'}
              </label>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} />
            </div>

            {uploadedFileInfo ? (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>
                    📁 로드된 JSON 파일: {uploadedFileInfo.name}
                  </div>
                  <button
                    type="button"
                    onClick={handleClearUploadedFile}
                    style={{
                      padding: '4px 8px',
                      fontSize: 12,
                      borderRadius: 4,
                      border: '1px solid #d1d5db',
                      background: '#fff',
                      color: '#4b5563',
                      cursor: 'pointer',
                    }}
                  >
                    파일 해제 / 직접 입력으로 전환
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#15803d', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>크기: {(uploadedFileInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                  <span>감지된 프레임: {uploadedFileInfo.frameCount}개</span>
                  <span style={{ color: '#047857', fontWeight: 600 }}>⚡ 메모리 최적화 모드 (44MB DOM textarea 렌더링 방지)</span>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder="Figma AST JSON을 여기에 붙여넣으세요..."
                  rows={6}
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 11, padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
                />
              </div>
            )}

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

      {/* Frame Selection */}
      {selectableFrames.length > 0 && (
        <section style={{ backgroundColor: '#f9fafb', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>변환 대상 프레임 선택 (Frame Selection)</h4>
              <span style={{ fontSize: 12, color: selectedFrameIds.length === 0 ? '#dc2626' : '#4b5563' }}>
                선택됨: <strong>{selectedFrameIds.length}</strong> / {selectableFrames.length}개
                {selectedFrameIds.length === 0 && ' ⚠️ 최소 1개 이상 선택해야 변환할 수 있습니다.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSelectAllFrames}
                style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={handleDeselectAllFrames}
                style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
              >
                선택 해제
              </button>
              {selectableFrames.some((f) => f.isA4Ratio) && (
                <button
                  type="button"
                  onClick={handleSelectOnlyA4Frames}
                  style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}
                >
                  📄 A4 문서 프레임만 선택 ({selectableFrames.filter((f) => f.isA4Ratio).length}개)
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
            {selectableFrames.map((frame) => {
              const isChecked = selectedFrameIds.includes(frame.id);
              return (
                <label
                  key={frame.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${isChecked ? '#93c5fd' : '#e5e7eb'}`,
                    backgroundColor: isChecked ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleFrame(frame.id)}
                    />
                    <span style={{ fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {frame.name}
                    </span>
                    <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                      ({frame.id})
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>
                      {Math.round(frame.width)} × {Math.round(frame.height)} (비율 {frame.aspectRatio.toFixed(2)})
                    </span>
                    {frame.isA4Ratio && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                        A4 문서 권장
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {/* Mode Selection */}
      <section style={{ backgroundColor: '#f9fafb', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <h4 style={{ marginTop: 0, marginBottom: 10, fontSize: 14 }}>변환 모드 (Conversion Mode)</h4>
        <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="mode" value="balanced" checked={mode === 'balanced'} onChange={() => handleModeChange('balanced')} />
            <span><strong>Balanced</strong> (권장: 균형 모드)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="mode" value="fidelity" checked={mode === 'fidelity'} onChange={() => handleModeChange('fidelity')} />
            <span><strong>Design Fidelity</strong> (디자인 우선)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="mode" value="editability" checked={mode === 'editability'} onChange={() => handleModeChange('editability')} />
            <span><strong>Editability</strong> (편집성 우선)</span>
          </label>
        </div>
      </section>

      {/* Page Orientation Selection */}
      <section style={{ backgroundColor: '#f9fafb', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <h4 style={{ marginTop: 0, marginBottom: 10, fontSize: 14 }}>용지 방향 (Page Orientation)</h4>
        <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="orientation"
              value="portrait"
              checked={pageOrientation === 'portrait'}
              onChange={() => handleOrientationChange('portrait')}
            />
            <span><strong>A4 세로형 (Portrait)</strong> (기본값, 본문 폭 451pt / 602px)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="orientation"
              value="landscape"
              checked={pageOrientation === 'landscape'}
              onChange={() => handleOrientationChange('landscape')}
            />
            <span><strong>A4 가로형 (Landscape)</strong> (데스크톱/와이드 디자인 권장, 본문 폭 698pt / 931px)</span>
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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {docxBlob && (
            <button
              type="button"
              onClick={handleDownload}
              style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              📥 Microsoft Word 문서 (.docx) 다운로드
            </button>
          )}
          {loadedSnapshot && (() => {
            const imgStats = assessImageCompleteness(loadedSnapshot.targetNode, loadedSnapshot.imageMap);
            const isWarning = imgStats.referencedCount > 0 && !imgStats.isComplete;
            return (
              <button
                type="button"
                onClick={handleDownloadSnapshot}
                style={{
                  padding: '10px 18px',
                  borderRadius: 6,
                  border: `1px solid ${isWarning ? '#f59e0b' : '#2563eb'}`,
                  background: isWarning ? '#fffbeb' : '#eff6ff',
                  color: isWarning ? '#b45309' : '#1d4ed8',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {isWarning
                  ? '⚠️ Figma JSON 스냅샷 저장 (이미지 누락 포함)'
                  : '💾 Figma JSON 스냅샷 저장 (.json 다운로드)'}
              </button>
            );
          })()}
        </div>

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

