import React, { useState, useRef } from 'react';
import { FigmaParser, ParseResult } from '../../../src/parser/figmaParser';
import { DocxRenderer } from '../../../src/renderer/docxRenderer';
import { FigmaCanvasParser } from '../../../src/canvas/parser/figmaCanvasParser';
import { DocxCanvasRenderer } from '../../../src/canvas/renderer/docxCanvasRenderer';
import { HwpxCanvasRenderer } from '../../../src/canvas/renderer/hwpxCanvasRenderer';
import { DocxCanvasParser } from '../../../src/canvas/parser/docxCanvasParser';
import { CanvasDocument } from '../../../src/canvas/types';
import { resolveImageMapUrls } from '../../../src/canvas/utils/imageResolver';
import { FigmaClient, parseFigmaUrl, FigmaApiError } from '../../../src/api/index';
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
  const [engine, setEngine] = useState<'canvas' | 'flow'>('canvas');
  const [targetFormat, setTargetFormat] = useState<'docx' | 'hwpx' | 'both'>('both');
  const [mode, setMode] = useState<'balanced' | 'fidelity' | 'editability'>('balanced');
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [inputTab, setInputTab] = useState<'preset' | 'url' | 'docx-to-hwpx'>('preset');
  const [figmaUrl, setFigmaUrl] = useState<string>('');
  const [accessToken, setAccessToken] = useState<string>('');
  const [jsonInput, setJsonInput] = useState<string>('');
  const [selectedFixture, setSelectedFixture] = useState<string>('syn-brief');
  const [status, setStatus] = useState<string>('대기 중');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocument | null>(null);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [hwpxBlob, setHwpxBlob] = useState<Blob | null>(null);
  const [outputBaseName, setOutputBaseName] = useState<string>('single-page-brief');
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
  const [docxConvertFileInfo, setDocxConvertFileInfo] = useState<{ name: string; size: number } | null>(null);

  const conversionReqIdRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docxFileInputRef = useRef<HTMLInputElement>(null);

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
    setHwpxBlob(null);
  };

  const handleSelectAllFrames = () => {
    conversionReqIdRef.current++;
    setSelectedFrameIds(selectableFrames.map((f) => f.id));
    setDocxBlob(null);
    setHwpxBlob(null);
  };

  const handleDeselectAllFrames = () => {
    conversionReqIdRef.current++;
    setSelectedFrameIds([]);
    setDocxBlob(null);
    setHwpxBlob(null);
  };

  const handleSelectOnlyA4Frames = () => {
    conversionReqIdRef.current++;
    const a4Ids = selectableFrames.filter((f) => f.isRecommendedA4).map((f) => f.id);
    setSelectedFrameIds(a4Ids.length > 0 ? a4Ids : selectableFrames.map((f) => f.id));
    setDocxBlob(null);
    setHwpxBlob(null);
  };

  const handleClearUploadedFile = () => {
    conversionReqIdRef.current++;
    setUploadedFileInfo(null);
    setLoadedSnapshot(null);
    setSelectableFrames([]);
    setSelectedFrameIds([]);
    setDocxBlob(null);
    setHwpxBlob(null);
    setParseResult(null);
    setCanvasDoc(null);
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
    let fixtureNode: any = null;
    let baseName = 'document';

    if (preset === 'syn-brief') {
      const data = await import('../../../samples/synthetic-figma/single-page-brief.json');
      fixtureNode = data.default || data;
      baseName = 'single-page-brief';
    } else if (preset === 'syn-report') {
      const data = await import('../../../samples/synthetic-figma/multi-page-report.json');
      fixtureNode = data.default || data;
      baseName = 'multi-page-report';
    } else if (preset === 'syn-portfolio') {
      const data = await import('../../../samples/synthetic-figma/image-centric-portfolio.json');
      fixtureNode = data.default || data;
      baseName = 'image-centric-portfolio';
    } else if (preset === 'syn-article') {
      const data = await import('../../../samples/synthetic-figma/text-centric-article.json');
      fixtureNode = data.default || data;
      baseName = 'text-centric-article';
    } else if (preset === 'syn-infographic') {
      const data = await import('../../../samples/synthetic-figma/vector-centric-infographic.json');
      fixtureNode = data.default || data;
      baseName = 'vector-centric-infographic';
    } else if (preset === 'syn-dashboard') {
      const data = await import('../../../samples/synthetic-figma/complex-nested-dashboard.json');
      fixtureNode = data.default || data;
      baseName = 'complex-nested-dashboard';
    } else if (preset === 'syn-table') {
      const data = await import('../../../samples/synthetic-figma/table-card-hybrid.json');
      fixtureNode = data.default || data;
      baseName = 'table-card-hybrid';
    } else if (preset === 'simple') {
      fixtureNode = simpleDocumentFixture;
      baseName = 'simple-document';
    } else if (preset === 'card') {
      fixtureNode = cardLayoutFixture;
      baseName = 'card-layout';
    } else if (preset === 'auto') {
      fixtureNode = autoLayoutFixture;
      baseName = 'auto-layout';
    } else if (preset === 'e2e-doc') {
      const data = await import('../../../samples/real-world/sample-e2e-document.json');
      fixtureNode = data.default || data;
      baseName = 'sample-e2e-document';
    } else if (preset === 'e2e-card') {
      const data = await import('../../../samples/real-world/sample-e2e-card-grid.json');
      fixtureNode = data.default || data;
      baseName = 'sample-e2e-card-grid';
    } else if (preset === 'e2e-complex') {
      const data = await import('../../../samples/real-world/sample-e2e-complex-layout.json');
      fixtureNode = data.default || data;
      baseName = 'sample-e2e-complex-layout';
    }

    if (fixtureNode) {
      setJsonInput(JSON.stringify(fixtureNode, null, 2));
      setOutputBaseName(baseName);
      const root = 'document' in fixtureNode ? fixtureNode.document : fixtureNode;
      updateFramesFromNode(root);
    }
    setDocxBlob(null);
    setHwpxBlob(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    conversionReqIdRef.current++;
    setDocxBlob(null);
    setHwpxBlob(null);
    setParseResult(null);
    setCanvasDoc(null);

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
          setStatus(`Figma 스냅샷 [${parsedData.metadata?.fileName || file.name}] 로드 완료`);
        } else {
          const targetNode = parsedData?.document || parsedData;
          if (
            !targetNode ||
            typeof targetNode !== 'object' ||
            Array.isArray(targetNode) ||
            (!targetNode.type && !Array.isArray(targetNode.children))
          ) {
            throw new Error('유효한 Figma 노드 구조(type 또는 children)가 없습니다.');
          }
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
        setJsonInput('');
        setOutputBaseName(file.name.replace(/\.[^/.]+$/, ''));
        setErrorMsg(null);
      } catch (err: any) {
        setErrorMsg(`JSON 파일 읽기 실패: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleDocxUploadAndConvert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const currentReqId = ++conversionReqIdRef.current;
    setDocxConvertFileInfo({ name: file.name, size: file.size });
    setDocxBlob(null);
    setHwpxBlob(null);
    setCanvasDoc(null);
    setIsLoading(true);
    setErrorMsg(null);
    setStatus(`DOCX 바이너리 파싱 및 HWPX 변환 중...`);
    const startTime = performance.now();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const docxParser = new DocxCanvasParser();
      const parsedDoc = await docxParser.parse(arrayBuffer);

      if (currentReqId !== conversionReqIdRef.current) return;

      const hwpxRenderer = new HwpxCanvasRenderer();
      const generatedHwpxBlob = await hwpxRenderer.renderToBlob(parsedDoc);

      if (currentReqId !== conversionReqIdRef.current) return;
      const endTime = performance.now();

      setCanvasDoc(parsedDoc);
      setHwpxBlob(generatedHwpxBlob);
      setOutputBaseName(file.name.replace(/\.docx$/i, ''));
      setDuration(Math.round(endTime - startTime));
      setStatus(`DOCX → HWPX 직접 변환 성공 (${parsedDoc.pages.length}페이지, ${parsedDoc.pages.reduce((acc, p) => acc + p.elements.length, 0)}개 요소)`);
    } catch (err: any) {
      if (currentReqId !== conversionReqIdRef.current) return;
      console.error(err);
      setErrorMsg(`DOCX 변환 실패: ${err.message}`);
      setStatus('오류 발생');
    } finally {
      if (currentReqId === conversionReqIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const executeCanvasConversion = async (targetNode: any, imageMap: Record<string, string>) => {
    const effectiveNode = selectedFrameIds.length > 0 && selectableFrames.length > 0
      ? filterFigmaNodeByFrames(targetNode, selectedFrameIds)
      : targetNode;

    const parser = new FigmaCanvasParser({
      imageMap,
      selectedFrameIds: selectedFrameIds.length > 0 ? selectedFrameIds : undefined,
      titleOverride: outputBaseName,
    });

    const doc = parser.parse(effectiveNode);

    let generatedDocx: Blob | null = null;
    let generatedHwpx: Blob | null = null;

    if (targetFormat === 'docx' || targetFormat === 'both') {
      const docxRenderer = new DocxCanvasRenderer();
      generatedDocx = await docxRenderer.renderToBlob(doc);
    }
    if (targetFormat === 'hwpx' || targetFormat === 'both') {
      const hwpxRenderer = new HwpxCanvasRenderer();
      generatedHwpx = await hwpxRenderer.renderToBlob(doc);
    }

    setCanvasDoc(doc);
    setDocxBlob(generatedDocx);
    setHwpxBlob(generatedHwpx);
  };

  const executeFlowConversion = async (targetNode: any, imageMap: Record<string, string>) => {
    const effectiveNode = selectedFrameIds.length > 0 && selectableFrames.length > 0
      ? filterFigmaNodeByFrames(targetNode, selectedFrameIds)
      : targetNode;

    const parser = new FigmaParser({ imageMap });
    const result = parser.parse(effectiveNode);

    if (result.stats.totalElements === 0) {
      throw new Error(`변환 가능한 Figma 요소를 찾지 못했습니다.`);
    }

    result.document.metadata.conversionMode = mode;
    result.document.pageConfig.orientation = pageOrientation;

    const renderer = new DocxRenderer();
    const blob = await renderer.renderToBlob(result.document);

    setParseResult(result);
    setDocxBlob(blob);
    setHwpxBlob(null);
    setCanvasDoc(null);
  };

  const handleConvert = async () => {
    if (isLoading) return;
    const currentReqId = ++conversionReqIdRef.current;
    setDocxBlob(null);
    setHwpxBlob(null);

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setStatus(`오프라인 ${engine === 'canvas' ? 'Canvas 듀얼 엔진' : 'Flow 엔진'} 변환 중...`);
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
        } else {
          targetNode = parsedData.document || parsedData;
          imageMap = parsedData.images || parsedData.meta?.images || {};
        }
      }

      if (selectableFrames.length > 0 && selectedFrameIds.length === 0) {
        setErrorMsg('변환할 프레임이 선택되지 않았습니다. 최소 1개 이상의 프레임을 선택해주세요.');
        return;
      }

      if (engine === 'canvas') {
        await executeCanvasConversion(targetNode, imageMap);
      } else {
        await executeFlowConversion(targetNode, imageMap);
      }

      if (currentReqId !== conversionReqIdRef.current) return;
      const endTime = performance.now();
      setDuration(Math.round(endTime - startTime));
      setStatus(`변환 성공 (${engine === 'canvas' ? 'Canvas 듀얼 엔진' : 'Flow 엔진'}, ${targetFormat.toUpperCase()})`);
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
    setIsLoading(true);
    setErrorMsg(null);
    setDocxBlob(null);
    setHwpxBlob(null);

    try {
      setStatus('Figma API에서 파일 구조 조회 중...');
      const urlInfo = parseFigmaUrl(figmaUrl);
      const client = new FigmaClient({ accessToken });

      const fileData = await client.fetchFile(urlInfo.fileKey);
      let targetNode = fileData.document;
      if (urlInfo.nodeId) {
        const findNode = (n: any, id: string): any => {
          if (!n) return undefined;
          if (n.id === id || n.id.replace(/:/g, '-') === id || n.id.replace(/-/g, ':') === id) return n;
          if (n.children) {
            for (const child of n.children) {
              const res = findNode(child, id);
              if (res) return res;
            }
          }
          return undefined;
        };
        const found = findNode(fileData.document, urlInfo.nodeId);
        if (found) targetNode = found;
      }

      let imageMap: Record<string, string> = {};
      try {
        setStatus('Figma 이미지 리소스 확인 중...');
        const rawImageMap = await client.fetchImageFills(urlInfo.fileKey);
        setStatus('Figma 이미지 다운로드 중...');
        imageMap = await resolveImageMapUrls(rawImageMap, (imgUrl) => client.downloadImageAsBase64(imgUrl));
      } catch {
        // Continue if images fail
      }

      setLoadedSnapshot({
        targetNode,
        imageMap,
        fileName: fileData.name || 'figma-document',
        fileKey: urlInfo.fileKey,
        nodeId: urlInfo.nodeId,
      });
      setOutputBaseName(fileData.name || 'figma-document');
      updateFramesFromNode(targetNode);

      if (engine === 'canvas') {
        await executeCanvasConversion(targetNode, imageMap);
      } else {
        await executeFlowConversion(targetNode, imageMap);
      }

      if (currentReqId !== conversionReqIdRef.current) return;
      setStatus(`Figma 실시간 연동 및 변환 완료!`);
    } catch (err: any) {
      if (currentReqId !== conversionReqIdRef.current) return;
      console.error(err);
      setErrorMsg(err.message || 'Figma 실시간 연동 중 오류 발생');
      setStatus('오류 발생');
    } finally {
      if (currentReqId === conversionReqIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleDownloadDocx = () => {
    if (!docxBlob) return;
    const url = URL.createObjectURL(docxBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${outputBaseName}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadHwpx = () => {
    if (!hwpxBlob) return;
    const url = URL.createObjectURL(hwpxBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${outputBaseName}.hwpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBoth = () => {
    handleDownloadDocx();
    setTimeout(() => {
      handleDownloadHwpx();
    }, 200);
  };

  const handleDownloadSnapshot = () => {
    if (!loadedSnapshot) return;
    const snapshot = createFigmaSnapshot(
      loadedSnapshot.targetNode,
      loadedSnapshot.imageMap,
      {
        fileName: loadedSnapshot.fileName || outputBaseName,
        fileKey: loadedSnapshot.fileKey,
        nodeId: loadedSnapshot.nodeId,
      }
    );
    const jsonBlob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${loadedSnapshot.fileName || outputBaseName || 'figma-snapshot'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const countElementTypes = (doc: CanvasDocument) => {
    let text = 0, card = 0, image = 0, vector = 0, oval = 0;
    for (const page of doc.pages) {
      for (const el of page.elements) {
        if (el.type === 'text') text++;
        else if (el.type === 'card') card++;
        else if (el.type === 'image') image++;
        else if (el.type === 'vector') vector++;
        else if (el.type === 'oval') oval++;
      }
    }
    return { text, card, image, vector, oval, total: text + card + image + vector + oval };
  };

  return (
    <div style={{ maxWidth: 920, margin: '30px auto', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '0 20px', color: '#1f2937' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: '0 0 6px 0', fontSize: 26, color: '#111827' }}>Figma2Word & Hancom MVP</h1>
            <p style={{ margin: 0, color: '#4b5563', fontSize: 14 }}>
              Figma 2차원 디자인을 편집 가능한 Microsoft Word(.docx) 및 한컴 한글(.hwpx)로 정밀 변환
            </p>
          </div>
          <span style={{ fontSize: 12, padding: '4px 10px', background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, borderRadius: 20 }}>
            Phase 15 Local MVP
          </span>
        </div>
      </header>

      {/* Engine & Format Controls */}
      <section style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: 18, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#166534', display: 'block', marginBottom: 6 }}>변환 렌더링 엔진:</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="engine"
                  value="canvas"
                  checked={engine === 'canvas'}
                  onChange={() => { setEngine('canvas'); setDocxBlob(null); setHwpxBlob(null); }}
                />
                <span style={{ fontWeight: engine === 'canvas' ? 700 : 400, color: engine === 'canvas' ? '#15803d' : '#374151' }}>
                  🎯 Canvas IR Dual Engine (권장: 시각 충실도 0.87+)
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="engine"
                  value="flow"
                  checked={engine === 'flow'}
                  onChange={() => { setEngine('flow'); setDocxBlob(null); setHwpxBlob(null); }}
                />
                <span style={{ fontWeight: engine === 'flow' ? 700 : 400, color: engine === 'flow' ? '#15803d' : '#374151' }}>
                  📄 Flow Engine (레거시: Word 전용)
                </span>
              </label>
            </div>
          </div>

          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#166534', display: 'block', marginBottom: 6 }}>출력 포맷:</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => { setTargetFormat('docx'); setDocxBlob(null); setHwpxBlob(null); }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: targetFormat === 'docx' ? '2px solid #16a34a' : '1px solid #d1d5db',
                  background: targetFormat === 'docx' ? '#dcfce7' : '#fff',
                  fontWeight: targetFormat === 'docx' ? 700 : 500,
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                DOCX (Word)
              </button>
              <button
                type="button"
                onClick={() => { setTargetFormat('hwpx'); setDocxBlob(null); setHwpxBlob(null); }}
                disabled={engine === 'flow'}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: targetFormat === 'hwpx' ? '2px solid #16a34a' : '1px solid #d1d5db',
                  background: targetFormat === 'hwpx' ? '#dcfce7' : '#fff',
                  fontWeight: targetFormat === 'hwpx' ? 700 : 500,
                  fontSize: 12,
                  cursor: engine === 'flow' ? 'not-allowed' : 'pointer',
                  opacity: engine === 'flow' ? 0.5 : 1
                }}
              >
                HWPX (한글)
              </button>
              <button
                type="button"
                onClick={() => { setTargetFormat('both'); setDocxBlob(null); setHwpxBlob(null); }}
                disabled={engine === 'flow'}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: targetFormat === 'both' ? '2px solid #16a34a' : '1px solid #d1d5db',
                  background: targetFormat === 'both' ? '#dcfce7' : '#fff',
                  fontWeight: targetFormat === 'both' ? 700 : 500,
                  fontSize: 12,
                  cursor: engine === 'flow' ? 'not-allowed' : 'pointer',
                  opacity: engine === 'flow' ? 0.5 : 1
                }}
              >
                듀얼 (DOCX + HWPX)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Input Selection Tabs */}
      <section style={{ backgroundColor: '#f9fafb', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 12, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setInputTab('preset')}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: inputTab === 'preset' ? '#2563eb' : '#e5e7eb', color: inputTab === 'preset' ? '#fff' : '#374151', cursor: 'pointer', fontWeight: 600 }}
          >
            Figma 샘플 프리셋 및 JSON
          </button>
          <button
            type="button"
            onClick={() => setInputTab('docx-to-hwpx')}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: inputTab === 'docx-to-hwpx' ? '#2563eb' : '#e5e7eb', color: inputTab === 'docx-to-hwpx' ? '#fff' : '#374151', cursor: 'pointer', fontWeight: 600 }}
          >
            🔄 DOCX → HWPX 직접 변환
          </button>
          <button
            type="button"
            onClick={() => setInputTab('url')}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: inputTab === 'url' ? '#2563eb' : '#e5e7eb', color: inputTab === 'url' ? '#fff' : '#374151', cursor: 'pointer', fontWeight: 600 }}
          >
            Figma URL 라이브 연동
          </button>
        </div>

        {inputTab === 'docx-to-hwpx' ? (
          <div>
            <div style={{ padding: 16, background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: 14, color: '#1e40af' }}>Word 문서(.docx)를 한컴 한글(.hwpx)로 원클릭 변환</h4>
              <p style={{ margin: 0, fontSize: 12, color: '#3b82f6' }}>
                Figma2Word에서 생성된 DOCX 또는 VML 도형 기반 Word 문서를 업로드하면, Canvas IR로 파싱하여 표준 KS X 6101 HWPX 문서로 즉시 변환합니다.
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <input
                ref={docxFileInputRef}
                type="file"
                accept=".docx"
                onChange={handleDocxUploadAndConvert}
                style={{ fontSize: 13 }}
              />
            </div>
            {docxConvertFileInfo && (
              <div style={{ fontSize: 12, color: '#4b5563' }}>
                선택된 파일: <strong>{docxConvertFileInfo.name}</strong> ({(docxConvertFileInfo.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>
        ) : inputTab === 'url' ? (
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
              {isLoading ? '연동 및 변환 중...' : 'Figma 실시간 가져오기 & 변환 실행'}
            </button>

            {loadedSnapshot && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#065f46', marginBottom: 8 }}>
                  ⚡ <strong>메모리 스냅샷 보존 중</strong>: [{loadedSnapshot.fileName || 'Figma 디자인'}]
                  {loadedSnapshot.imageMap && ` (오프라인 이미지 ${Object.keys(loadedSnapshot.imageMap).length}개 포함)`}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleDownloadSnapshot}
                    style={{ padding: '8px 16px', borderRadius: 5, border: '1px solid #059669', background: '#fff', color: '#065f46', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    💾 Figma JSON 스냅샷 저장 (.json 다운로드)
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>검증용 프리셋 선택:</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', width: '100%', marginTop: 2 }}>
                🎯 Phase 15 합성 아키타입 (Synthetic Benchmarks):
              </span>
              <button type="button" onClick={() => loadPreset('syn-brief')} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', background: selectedFixture === 'syn-brief' ? '#2563eb' : '#eff6ff', color: selectedFixture === 'syn-brief' ? '#fff' : '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                1. 단일 메모 (Brief)
              </button>
              <button type="button" onClick={() => loadPreset('syn-report')} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', background: selectedFixture === 'syn-report' ? '#2563eb' : '#eff6ff', color: selectedFixture === 'syn-report' ? '#fff' : '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                2. 다중 보고서 (Report 3p)
              </button>
              <button type="button" onClick={() => loadPreset('syn-portfolio')} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', background: selectedFixture === 'syn-portfolio' ? '#2563eb' : '#eff6ff', color: selectedFixture === 'syn-portfolio' ? '#fff' : '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                3. 이미지 갤러리 (Portfolio)
              </button>
              <button type="button" onClick={() => loadPreset('syn-article')} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', background: selectedFixture === 'syn-article' ? '#2563eb' : '#eff6ff', color: selectedFixture === 'syn-article' ? '#fff' : '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                4. 텍스트 아티클 (Article)
              </button>
              <button type="button" onClick={() => loadPreset('syn-infographic')} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', background: selectedFixture === 'syn-infographic' ? '#2563eb' : '#eff6ff', color: selectedFixture === 'syn-infographic' ? '#fff' : '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                5. 벡터 인포그래픽 (Vectors)
              </button>
              <button type="button" onClick={() => loadPreset('syn-dashboard')} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', background: selectedFixture === 'syn-dashboard' ? '#2563eb' : '#eff6ff', color: selectedFixture === 'syn-dashboard' ? '#fff' : '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                6. 중첩 대시보드 (Dashboard)
              </button>
              <button type="button" onClick={() => loadPreset('syn-table')} style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #2563eb', background: selectedFixture === 'syn-table' ? '#2563eb' : '#eff6ff', color: selectedFixture === 'syn-table' ? '#fff' : '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                7. 표/카드 하이브리드 (Table-Card)
              </button>

              <span style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', width: '100%', marginTop: 8 }}>
                📁 E2E 및 기본 샘플:
              </span>
              <button type="button" onClick={() => loadPreset('e2e-doc')} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'e2e-doc' ? '#4b5563' : '#fff', color: selectedFixture === 'e2e-doc' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 11 }}>
                E2E: 문서형
              </button>
              <button type="button" onClick={() => loadPreset('e2e-card')} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'e2e-card' ? '#4b5563' : '#fff', color: selectedFixture === 'e2e-card' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 11 }}>
                E2E: 카드형
              </button>
              <button type="button" onClick={() => loadPreset('e2e-complex')} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'e2e-complex' ? '#4b5563' : '#fff', color: selectedFixture === 'e2e-complex' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 11 }}>
                E2E: 복합형
              </button>
              <button type="button" onClick={() => loadPreset('simple')} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: selectedFixture === 'simple' ? '#4b5563' : '#fff', color: selectedFixture === 'simple' ? '#fff' : '#374151', cursor: 'pointer', fontSize: 11 }}>
                기본: 심플
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                {uploadedFileInfo ? '다른 Figma JSON 파일로 교체:' : '또는 로컬 Figma JSON 파일 업로드:'}
              </label>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} />
            </div>

            {uploadedFileInfo ? (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                  📁 {uploadedFileInfo.name} ({(uploadedFileInfo.sizeBytes / 1024).toFixed(1)} KB, 프레임 {uploadedFileInfo.frameCount}개)
                </span>
                <button type="button" onClick={handleClearUploadedFile} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                  해제
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder="Figma AST JSON을 여기에 붙여넣으세요..."
                  rows={4}
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 11, padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleConvert}
              disabled={isLoading}
              style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              변환 실행
            </button>
          </div>
        )}
      </section>

      {/* Frame Selection (if frames exist) */}
      {selectableFrames.length > 0 && inputTab !== 'docx-to-hwpx' && (
        <section style={{ backgroundColor: '#f9fafb', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              변환 대상 프레임 ({selectedFrameIds.length} / {selectableFrames.length}개 선택됨)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={handleSelectAllFrames} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                전체 선택
              </button>
              <button type="button" onClick={handleDeselectAllFrames} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                선택 해제
              </button>
              {selectableFrames.some((f) => f.isA4Ratio) && (
                <button type="button" onClick={handleSelectOnlyA4Frames} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>
                  A4 비율만 선택
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            {selectableFrames.map((frame) => {
              const isChecked = selectedFrameIds.includes(frame.id);
              return (
                <label key={frame.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 4, border: `1px solid ${isChecked ? '#93c5fd' : '#e5e7eb'}`, background: isChecked ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={isChecked} onChange={() => handleToggleFrame(frame.id)} />
                    <span style={{ fontWeight: 600 }}>{frame.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {Math.round(frame.width)} × {Math.round(frame.height)} {frame.isA4Ratio ? '(A4 권장)' : ''}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: 6, color: '#991b1b', marginBottom: 20, fontSize: 14 }}>
          <strong>오류:</strong> {errorMsg}
        </div>
      )}

      {/* Results & Download Section */}
      <section style={{ backgroundColor: '#f9fafb', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>진행 상태 및 변환 결과</h3>
        <p style={{ margin: '0 0 14px 0', fontSize: 14 }}>
          <strong>상태:</strong> {status} {duration !== null && `(${duration}ms)`}
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {docxBlob && (
            <button
              type="button"
              onClick={handleDownloadDocx}
              style={{ padding: '10px 18px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📥 Word 문서 (.docx) 다운로드
            </button>
          )}

          {hwpxBlob && (
            <button
              type="button"
              onClick={handleDownloadHwpx}
              style={{ padding: '10px 18px', borderRadius: 6, border: 'none', background: '#0284c7', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📥 한컴 한글 문서 (.hwpx) 다운로드
            </button>
          )}

          {docxBlob && hwpxBlob && (
            <button
              type="button"
              onClick={handleDownloadBoth}
              style={{ padding: '10px 18px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📦 Word + 한글 동시 다운로드
            </button>
          )}

          {loadedSnapshot && (
            <button
              type="button"
              onClick={handleDownloadSnapshot}
              style={{ padding: '10px 18px', borderRadius: 6, border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              💾 Figma JSON 스냅샷 저장 (.json 다운로드)
            </button>
          )}
        </div>

        {/* Canvas Engine Diagnostics & Element Stats */}
        {canvasDoc && (() => {
          const stats = countElementTypes(canvasDoc);
          return (
            <div>
              <h4 style={{ margin: '14px 0 8px 0', fontSize: 14 }}>Canvas IR 정밀 구조 통계</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>페이지 수</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{canvasDoc.pages.length}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#2563eb' }}>텍스트 (Text)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#2563eb' }}>{stats.text}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#16a34a' }}>카드 (Card)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{stats.card}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#d97706' }}>이미지 (Image)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#d97706' }}>{stats.image}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#7c3aed' }}>벡터 (Vector)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#7c3aed' }}>{stats.vector}</div>
                </div>
                <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#059669' }}>원형 (Oval)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>{stats.oval}</div>
                </div>
              </div>

              {canvasDoc.diagnostics.warnings.length > 0 && (
                <div style={{ marginTop: 10, padding: 8, background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 4, fontSize: 12 }}>
                  <strong style={{ color: '#92400e' }}>경고 사항:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {canvasDoc.diagnostics.warnings.map((w, idx) => (
                      <li key={idx} style={{ color: '#b45309' }}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

        {/* Flow Engine Stats (if flow engine used) */}
        {parseResult && (
          <div>
            <h4 style={{ margin: '14px 0 8px 0', fontSize: 14 }}>Flow 파싱 통계</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#6b7280' }}>전체 노드</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{parseResult.stats.totalNodes}</div>
              </div>
              <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#16a34a' }}>지원</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{parseResult.stats.supportedNodes}</div>
              </div>
              <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#2563eb' }}>부분 지원</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2563eb' }}>{parseResult.stats.partiallySupportedNodes}</div>
              </div>
              <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#dc2626' }}>미지원</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>{parseResult.stats.unsupportedNodes}</div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
