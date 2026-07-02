import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { detectLanguage, SUPPORTED_TARGET_LANGS } from '../utils/languageDetector';
import RenderableText from './RenderableText';
import {
  getCachedTranslation,
  recordLanguageUsage,
  sortLanguageOptionsByUsage,
  type TranslationProgress,
  type TranslationProvider,
  translateText,
} from './translationService';

interface Props {
  text: string;
  defaultTarget?: string;
  sourceLanguageHint?: string;
  cachedTranslatedText?: string;
  cachedTranslatedFieldName?: string;
  autoTranslate?: boolean;
  enableRichRender?: boolean;
  onWriteBack?: (text: string) => Promise<void> | void;
}

function LangDropdown({
  value,
  onChange,
  options,
  className = ''
}: {
  value: string;
  onChange: (code: string) => void;
  options: typeof SUPPORTED_TARGET_LANGS;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.code === value);

  return (
    <div className={`lang-dropdown ${className}`} ref={ref}>
      <button className="lang-dropdown-btn" onClick={() => setOpen(!open)}>
        <span>{selected?.flag} {(selected as any)?.shortLabel || selected?.code.toUpperCase()}</span>
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="lang-dropdown-menu">
          {options.map((l) => (
            <div
              key={l.code}
              className={`lang-dropdown-item ${value === l.code ? 'active' : ''}`}
              onClick={() => {
                onChange(l.code);
                setOpen(false);
              }}
            >
              {l.flag} {l.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TranslateButton({
  text,
  defaultTarget = 'zh-CN',
  sourceLanguageHint,
  cachedTranslatedText = '',
  cachedTranslatedFieldName,
  autoTranslate = false,
  enableRichRender = true,
  onWriteBack,
}: Props) {
  const detected = detectLanguage(text);
  const hintedSourceLang = sourceLanguageHint || detected.code;

  const [mode, setMode] = useState<'field' | 'manual'>('field');
  const [manualText, setManualText] = useState('');
  const [sourceLang, setSourceLang] = useState(hintedSourceLang);
  const [targetLang, setTargetLang] = useState(defaultTarget);
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [manualSource, setManualSource] = useState(false);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeText = mode === 'manual' ? manualText : text;
  const fieldModeCachedText =
    mode === 'field' && targetLang === 'zh-CN' && cachedTranslatedText.trim()
      ? cachedTranslatedText.trim()
      : '';
  const languageOptions = useMemo(
    () => sortLanguageOptionsByUsage(SUPPORTED_TARGET_LANGS, [sourceLang, targetLang]),
    [sourceLang, targetLang]
  );

  useEffect(() => {
    requestSeqRef.current += 1;
    setSourceLang(hintedSourceLang);
    setManualSource(false);
    setError('');
    setProgress(null);
    setLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;
    if (mode === 'field') {
      setTargetLang(defaultTarget);
      setTranslatedText(
        cachedTranslatedText.trim() ||
          getCachedTranslation({
            text,
            sourceLang: hintedSourceLang,
            targetLang: defaultTarget,
            cacheScope: 'field',
          })
      );
    }
  }, [text, hintedSourceLang, defaultTarget, cachedTranslatedText, mode]);

  useEffect(() => {
    requestSeqRef.current += 1;
    setError('');
    setProgress(null);
    setManualSource(false);
    abortRef.current?.abort();
    abortRef.current = null;

    if (mode === 'manual') {
      setSourceLang('zh-CN');
      setTargetLang('en');
      setTranslatedText('');
      return;
    }

    setSourceLang(hintedSourceLang);
    setTargetLang(defaultTarget);
    setTranslatedText(
      cachedTranslatedText.trim() ||
        getCachedTranslation({
          text,
          sourceLang: hintedSourceLang,
          targetLang: defaultTarget,
          cacheScope: 'field',
        })
    );
  }, [mode, defaultTarget, hintedSourceLang, text, cachedTranslatedText]);

  const updateSourceLang = (code: string) => {
    recordLanguageUsage(code);
    setManualSource(true);
    setSourceLang(code);
    setTranslatedText('');
    setError('');
    setProgress(null);
  };

  const updateTargetLang = (code: string) => {
    recordLanguageUsage(code);
    setTargetLang(code);
    setTranslatedText('');
    setError('');
    setProgress(null);
  };

  const cancelTranslation = useCallback((message = '已中断当前翻译') => {
    requestSeqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setProgress({
      stage: 'done',
      message,
    });
  }, []);

  const handleTranslate = useCallback(async (options: { auto?: boolean; force?: boolean; preferredProvider?: TranslationProvider } = {}) => {
    setProgress(null);
    if (!activeText.trim()) {
      setError(mode === 'manual' ? '先输入要翻译的内容' : '当前字段没有可翻译内容');
      return;
    }

    if (fieldModeCachedText && !options.force) {
      setTranslatedText(fieldModeCachedText);
      setLoading(false);
      return;
    }

    const cached = options.force
      ? ''
      : getCachedTranslation({
          text: activeText,
          sourceLang,
          targetLang,
          cacheScope: mode,
        });
    if (cached) {
      setTranslatedText(cached);
      setLoading(false);
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    setProgress({
      stage: 'queued',
      provider: options.preferredProvider,
      message:
        options.preferredProvider === 'mymemory'
          ? '准备改用 MyMemory 手动翻译...'
          : options.auto
            ? '准备自动翻译...'
            : '准备翻译...',
    });
    try {
      const nextText = await translateText({
        text: activeText,
        sourceLang,
        targetLang,
        cacheScope: mode,
        allowFallback: !options.auto,
        forceRefresh: options.force,
        preferredProvider: options.preferredProvider,
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (requestSeqRef.current !== requestSeq) return;
          setProgress(nextProgress);
        },
      });
      if (requestSeqRef.current !== requestSeq) return;
      setTranslatedText(nextText);
      setProgress((current) =>
        current || {
          stage: 'done',
          message: '翻译完成',
        }
      );
    } catch (err: any) {
      if (requestSeqRef.current !== requestSeq) return;
      if (err.message.includes('TRANSLATION_ABORTED')) {
        setProgress({
          stage: 'done',
          message:
            options.preferredProvider === 'mymemory'
              ? '已取消 MyMemory 翻译'
              : options.auto
                ? '已中断自动翻译'
                : '已取消翻译',
        });
        setError('');
      } else if (err.message.includes('NO_FEISHU_TRANSLATION_PROVIDER')) {
        if (!options.auto) {
          setError('当前环境没有飞书翻译授权；手动翻译会尝试免费兜底接口');
        } else {
          setError('当前环境没有飞书翻译授权；可中断后手动改用 MyMemory');
        }
      } else if (err.message.includes('Failed to fetch')) {
        setError('网络错误：请检查网络连接');
      } else if (err.message.includes('翻译超时')) {
        setError('翻译超时，已停止等待，可稍后重试');
      } else if (err.message.includes('YOU USED ALL AVAILABLE FREE')) {
        setError('免费兜底翻译额度已用完，明天自动恢复；自动翻译不会再消耗该额度');
      } else {
        setError(err.message || '翻译失败，请重试');
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [activeText, mode, sourceLang, targetLang, fieldModeCachedText]);

  const handleFallbackToMyMemory = useCallback(() => {
    cancelTranslation('已中断当前翻译，准备改用 MyMemory');
    setTranslatedText('');
    setError('');
    setTimeout(() => {
      handleTranslate({
        force: true,
        preferredProvider: 'mymemory',
      });
    }, 0);
  }, [cancelTranslation, handleTranslate]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleWriteBack = async () => {
    if (!onWriteBack || !translatedText.trim()) return;
    await onWriteBack(translatedText);
  };

  useEffect(() => {
    if (!autoTranslate || mode !== 'field' || !activeText.trim() || translatedText || loading || fieldModeCachedText) {
      return;
    }
    if (!manualSource && sourceLang !== hintedSourceLang) {
      return;
    }
    handleTranslate({ auto: true });
  }, [autoTranslate, mode, activeText, translatedText, loading, manualSource, sourceLang, hintedSourceLang, fieldModeCachedText, handleTranslate]);

  return (
    <div className="translate-container">
      <div className="translate-mode-switch">
        <button
          className={`translate-mode-btn ${mode === 'field' ? 'active' : ''}`}
          onClick={() => setMode('field')}
        >
          字段内容
        </button>
        <button
          className={`translate-mode-btn ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setMode('manual')}
        >
          手动输入
        </button>
      </div>

      {mode === 'manual' && (
        <textarea
          className="translate-input"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="默认按中文 -> 英文翻译。适合 QC 先写中文反馈，再快速翻给 CB。"
        />
      )}
      <div className="translate-bar">
        <LangDropdown
          value={sourceLang}
          onChange={updateSourceLang}
          options={languageOptions}
          className="source-lang"
        />

        <button
          className={`detection-badge ${manualSource ? 'manual' : detected.confidence}`}
          title={manualSource ? `已手动选择源语言：${sourceLang}` : sourceLanguageHint ? `根据 Prompt ID 提示：${sourceLanguageHint}` : `自动识别：${detected.name}`}
          onClick={() => {
            setManualSource(false);
            setSourceLang(hintedSourceLang);
            setTranslatedText('');
            setError('');
            setProgress(null);
          }}
        >
          {manualSource ? '手动' : `${sourceLanguageHint ? 'ID提示' : '自动'} ${sourceLanguageHint || detected.confidence === 'high' ? '✓' : '≈'}`}
        </button>

        <span className="arrow">→</span>

        <LangDropdown
          value={targetLang}
          onChange={updateTargetLang}
          options={languageOptions}
          className="target-lang"
        />

        <button className="translate-btn" onClick={() => (loading ? cancelTranslation() : handleTranslate({ force: true }))}>
          {loading ? '停止' : '翻译'}
        </button>
        {loading && (
          <button className="translate-btn secondary" onClick={handleFallbackToMyMemory}>
            改用 MyMemory
          </button>
        )}
      </div>

      {progress?.message && (
        <div className={`translate-progress ${progress.provider || ''}`}>
          <span className="translate-progress-text">{progress.message}</span>
          {typeof progress.currentChunk === 'number' && typeof progress.totalChunks === 'number' && progress.totalChunks > 0 && (
            <span className="translate-progress-meta">
              {progress.currentChunk}/{progress.totalChunks}
            </span>
          )}
        </div>
      )}

      {error && <div className="translate-error">⚠️ {error}</div>}

      {translatedText && (
        <div className="translate-result">
          <div className="result-label">
            {mode === 'manual'
              ? '翻译结果：'
              : fieldModeCachedText
                ? `译文（缓存字段${cachedTranslatedFieldName ? `：${cachedTranslatedFieldName}` : ''}）：`
                : '译文：'}
          </div>
          <div className="result-text rich">
            <RenderableText content={translatedText} enableRichRender={enableRichRender} />
          </div>
          {mode === 'manual' && typeof onWriteBack === 'function' && (
            <div className="feedback-assistant-actions">
              <button className="translate-btn secondary" onClick={handleWriteBack}>
                一键填入字段
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
