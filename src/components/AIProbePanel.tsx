import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  answerManualQuestion,
  detectDocType,
  manualAssistantStorage,
  parseManualFromUrl,
  ParsedManual,
} from './manualAssistant';

type AssistantStage = 'idle' | 'connected' | 'parsing' | 'ready' | 'error';
const BUBBLE_POSITION_KEY = 'lightflow_manual_assistant:bubble_position';
const EDGE_GAP = 16;
const PANEL_WIDTH = 392;
const BUBBLE_WIDTH = 110;
const BUBBLE_HEIGHT = 42;

function getViewportSize() {
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  };
}

function clampPosition(left: number, top: number) {
  const { width, height } = getViewportSize();
  const maxLeft = Math.max(EDGE_GAP, width - BUBBLE_WIDTH - EDGE_GAP);
  const maxTop = Math.max(EDGE_GAP, height - BUBBLE_HEIGHT - EDGE_GAP);

  return {
    left: Math.min(Math.max(EDGE_GAP, left), maxLeft),
    top: Math.min(Math.max(EDGE_GAP, top), maxTop),
  };
}

function getInitialBubblePosition() {
  try {
    const raw = localStorage.getItem(BUBBLE_POSITION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
        return clampPosition(parsed.left, parsed.top);
      }
    }
  } catch {
    // ignore broken cache
  }

  return { left: 16, top: 12 };
}

export default function AIProbePanel() {
  const [url, setUrl] = useState(() => localStorage.getItem(manualAssistantStorage.urlKey) || '');
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [stage, setStage] = useState<AssistantStage>(() => {
    const storedManual = localStorage.getItem(manualAssistantStorage.parsedKey);
    return storedManual ? 'ready' : 'idle';
  });
  const [manual, setManual] = useState<ParsedManual | null>(() => {
    try {
      const raw = localStorage.getItem(manualAssistantStorage.parsedKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [parseError, setParseError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Array<{ id: string; text: string }>>([]);
  const [asking, setAsking] = useState(false);
  const [bubblePosition, setBubblePosition] = useState(getInitialBubblePosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0,
  });

  const env = useMemo(() => {
    const win = window as any;
    return {
      hasBitable: typeof win.bitable !== 'undefined',
      hasLark: typeof win.lark !== 'undefined',
      hasLarkAi: !!win.lark?.ai,
    };
  }, []);

  const parsed = useMemo(() => detectDocType(url), [url]);

  useEffect(() => {
    if (manual?.sourceUrl) {
      localStorage.setItem(manualAssistantStorage.urlKey, manual.sourceUrl);
    }
  }, [manual]);

  useEffect(() => {
    localStorage.setItem(BUBBLE_POSITION_KEY, JSON.stringify(bubblePosition));
  }, [bubblePosition]);

  useEffect(() => {
    const handleResize = () => {
      setBubblePosition((prev) => clampPosition(prev.left, prev.top));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const connectManual = () => {
    const nextUrl = url.trim();
    if (!nextUrl) return;

    setSaved(false);
    localStorage.setItem(manualAssistantStorage.urlKey, nextUrl);
    setStage('connected');
    setParseError('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const startParsing = async () => {
    if (!url.trim() || parsed.type === 'unknown') return;

    try {
      setStage('parsing');
      setParseError('');
      setAnswer('');
      setCitations([]);
      const nextManual = await parseManualFromUrl(url.trim());
      setManual(nextManual);
      localStorage.setItem(manualAssistantStorage.parsedKey, JSON.stringify(nextManual));
      localStorage.setItem(manualAssistantStorage.urlKey, nextManual.sourceUrl);
      setStage('ready');
    } catch (error: any) {
      setStage('error');
      setParseError(error?.message || '手册解析失败');
    }
  };

  const resetManual = () => {
    localStorage.removeItem(manualAssistantStorage.urlKey);
    localStorage.removeItem(manualAssistantStorage.parsedKey);
    setUrl('');
    setStage('idle');
    setSaved(false);
    setParseError('');
    setManual(null);
    setQuestion('');
    setAnswer('');
    setCitations([]);
  };

  const saveUrl = () => {
    localStorage.setItem(manualAssistantStorage.urlKey, url.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const askQuestion = async () => {
    if (!manual || !question.trim()) return;

    try {
      setAsking(true);
      const result = answerManualQuestion(manual, question);
      setAnswer(result.answer);
      setCitations(result.citations);
    } catch (error: any) {
      setAnswer(error?.message || '问答失败');
      setCitations([]);
    } finally {
      setAsking(false);
    }
  };

  const canParse = !!url.trim() && parsed.type !== 'unknown';
  const { width: viewportWidth } = getViewportSize();
  const openToLeft = bubblePosition.left > viewportWidth / 2;
  const panelStyle = openToLeft
    ? { right: 0, left: 'auto' as const }
    : { left: 0, right: 'auto' as const };
  const assistantStatusText =
    stage === 'ready'
      ? `已解析《${manual?.title || '手册'}》，可以直接问规则`
      : stage === 'parsing'
        ? '正在读取飞书手册正文并建立索引...'
        : stage === 'connected'
          ? '手册链接已连接，可以开始解析'
          : stage === 'error'
            ? parseError || '手册解析失败'
            : '尚未连接手册';

  const handleBubblePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: bubblePosition.left,
      originTop: bubblePosition.top,
    };
    setIsDragging(false);
  };

  const handleBubblePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const nextLeft = drag.originLeft + deltaX;
    const nextTop = drag.originTop + deltaY;
    const nextPosition = clampPosition(nextLeft, nextTop);

    if (!drag.moved && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
      drag.moved = true;
      setIsDragging(true);
    }

    setBubblePosition(nextPosition);
  };

  const handleBubblePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.active = false;

    if (drag.moved) {
      const { width } = getViewportSize();
      const snapLeft =
        bubblePosition.left + BUBBLE_WIDTH / 2 >= width / 2
          ? Math.max(EDGE_GAP, width - BUBBLE_WIDTH - EDGE_GAP)
          : EDGE_GAP;

      setBubblePosition((prev) => clampPosition(snapLeft, prev.top));
      setTimeout(() => setIsDragging(false), 0);
      return;
    }

    setOpen((prev) => !prev);
  };

  const handleBubblePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    setIsDragging(false);
  };

  return (
    <div
      className={`ai-assistant-shell ${isDragging ? 'dragging' : ''}`}
      style={{ left: `${bubblePosition.left}px`, top: `${bubblePosition.top}px` }}
    >
      {open && <div className="ai-assistant-mask" onClick={() => setOpen(false)} />}

      <button
        className={`ai-assistant-bubble ${open ? 'open' : ''}`}
        title="打开作业手册助手"
        onPointerDown={handleBubblePointerDown}
        onPointerMove={handleBubblePointerMove}
        onPointerUp={handleBubblePointerUp}
        onPointerCancel={handleBubblePointerCancel}
      >
        <span className="ai-assistant-bubble-icon">💬</span>
        <span className="ai-assistant-bubble-text">手册助手</span>
      </button>

      <div className={`ai-probe-panel floating ${open ? 'open' : ''}`} style={panelStyle}>
        <div className="ai-probe-header">
          <div>
            <div className="ai-probe-title">作业手册助手</div>
            <div className="ai-probe-subtitle">{assistantStatusText}</div>
          </div>
          <button className="ai-probe-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className="ai-probe-flow">
          <div className={`ai-probe-step ${stage !== 'idle' ? 'done' : 'active'}`}>
            1. 填写手册链接
          </div>
          <div className={`ai-probe-step ${stage === 'parsing' ? 'active' : stage === 'ready' ? 'done' : stage === 'connected' ? 'active' : ''}`}>
            2. 接入正文解析
          </div>
          <div className={`ai-probe-step ${stage === 'ready' ? 'active' : ''}`}>
            3. 进入规则问答
          </div>
        </div>

        <div className="ai-probe-form stacked">
          <input
            className="ai-probe-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴飞书 docx / wiki 链接"
          />
          <div className="ai-probe-actions">
            <button className="ai-probe-save secondary" onClick={saveUrl} disabled={!url.trim()}>
              {saved ? '已保存' : '仅保存'}
            </button>
            <button className="ai-probe-save" onClick={connectManual} disabled={!url.trim()}>
              连接手册
            </button>
            <button
              className="ai-probe-save"
              onClick={startParsing}
              disabled={!canParse || stage === 'parsing'}
            >
              {stage === 'parsing' ? '解析中...' : manual?.sourceUrl === url.trim() && stage === 'ready' ? '重新解析' : '开始解析'}
            </button>
          </div>
        </div>

        <div className="ai-probe-summary card">
          <div>链接类型：`{parsed.type}`</div>
          <div>Token：{parsed.token || '未识别'}</div>
          <div>AI 环境：{env.hasLarkAi ? 'window.lark.ai 可用' : 'window.lark.ai 当前不可用'}</div>
          <div>当前状态：{stage === 'ready' ? '已完成正文解析' : stage === 'connected' ? '已接入链接，等待解析' : stage === 'parsing' ? '准备解析中' : stage === 'error' ? '解析失败' : '未连接'}</div>
          {manual && (
            <>
              <div>手册标题：{manual.title}</div>
              <div>文档块数：{manual.chunks.length} 段</div>
            </>
          )}
          {parseError && <div className="ai-probe-error">{parseError}</div>}
        </div>

        <div className="ai-probe-qa-card">
          <div className="ai-probe-qa-header">
            <span>规则问答入口</span>
            <span className={`ai-probe-badge ${stage === 'ready' ? 'ok' : 'warn'}`}>
              {stage === 'ready' ? '可提问' : '等待解析'}
            </span>
          </div>
          <textarea
            className="ai-probe-question"
            placeholder={
              stage === 'ready'
                ? '例如：这个字段填写的规范是什么？'
                : '先连接手册并完成解析，然后在这里直接提问'
            }
            disabled={stage !== 'ready'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="ai-probe-actions">
            <button className="ai-probe-save" onClick={askQuestion} disabled={stage !== 'ready' || !question.trim() || asking}>
              {asking ? '检索中...' : '提问'}
            </button>
          </div>
          <div className="ai-probe-qa-note">
            当前优先走本地检索回答。等后面飞书内置 AI 能力跑通，再把生成式总结接上。
          </div>
          {answer && <pre className="ai-probe-answer">{answer}</pre>}
          {citations.length > 0 && (
            <div className="ai-probe-citations">
              {citations.map((citation, index) => (
                <div key={citation.id} className="ai-probe-citation">
                  <div className="ai-probe-citation-title">引用 {index + 1}</div>
                  <div className="ai-probe-citation-text">{citation.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ai-probe-footer">
          <button className="ai-probe-link" onClick={() => setShowDiagnostics((prev) => !prev)}>
            {showDiagnostics ? '收起诊断信息' : '展开诊断信息'}
          </button>
          <button className="ai-probe-link danger" onClick={resetManual}>
            清空手册
          </button>
        </div>

        {showDiagnostics && (
          <div className="ai-probe-grid">
            <div className="ai-probe-item">
              <span className="ai-probe-label">window.bitable</span>
              <strong>{String(env.hasBitable)}</strong>
            </div>
            <div className="ai-probe-item">
              <span className="ai-probe-label">window.lark</span>
              <strong>{String(env.hasLark)}</strong>
            </div>
            <div className="ai-probe-item">
              <span className="ai-probe-label">window.lark.ai</span>
              <strong>{String(env.hasLarkAi)}</strong>
            </div>
            <div className="ai-probe-item">
              <span className="ai-probe-label">当前阶段</span>
              <strong>{stage}</strong>
            </div>
            {manual && (
              <div className="ai-probe-item">
                <span className="ai-probe-label">document_id</span>
                <strong>{manual.documentId}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
