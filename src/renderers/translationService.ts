import { bitable } from '@lark-base-open/js-sdk';

const translateCache = new Map<string, string>();
const inFlightTranslations = new Map<string, Promise<string>>();
const LANGUAGE_USAGE_KEY = 'lightflow_translate_language_usage_v1';
const TRANSLATION_CACHE_KEY = 'lightflow_translation_cache_v1';
let lastTranslateTime = 0;
let personalBaseTokenCache: { value: string | null; loadedAt: number } | null = null;
const MIN_INTERVAL = 1200;
const FEISHU_CHUNK_LIMIT = 900;
const MYMEMORY_CHUNK_LIMIT = 420;
const TRANSLATE_TIMEOUT = 18000;
const MAX_PERSISTED_CACHE_ITEMS = 180;
const TOKEN_CACHE_TTL = 60 * 1000;

type CachedTranslation = {
  value: string;
  updatedAt: number;
};

type PrefetchTranslationItem = {
  text: string;
  sourceLang: string;
  targetLang: string;
  cacheScope?: string;
};

export type TranslationProvider = 'feishu' | 'mymemory';

export type TranslationProgress = {
  stage: 'queued' | 'provider' | 'chunk' | 'merge' | 'done';
  message: string;
  provider?: TranslationProvider;
  currentChunk?: number;
  totalChunks?: number;
};

function convertLangCode(code: string): string {
  const mapping: Record<string, string> = {
    'zh-CN': 'zh',
    'zh-TW': 'zh-Hant',
    zh: 'zh',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    'es-MX': 'es',
    es: 'es',
    'pt-BR': 'pt',
    'pt-PT': 'pt',
    id: 'id',
    tl: 'tl',
    vi: 'vi',
    th: 'th',
    fr: 'fr',
    de: 'de',
    it: 'it',
    ru: 'ru',
    ar: 'ar',
    hi: 'hi',
  };
  return mapping[code] || code;
}

async function getPersonalBaseToken(): Promise<string | null> {
  if (personalBaseTokenCache && Date.now() - personalBaseTokenCache.loadedAt < TOKEN_CACHE_TTL) {
    return personalBaseTokenCache.value;
  }

  const importedBridge = (bitable as any)?.bridge;
  const windowBridge = (window as any).bitable?.bridge;
  const candidates = [importedBridge, windowBridge].filter(Boolean);

  for (const bridge of candidates) {
    if (typeof bridge?.getPersonalBaseToken !== 'function') {
      continue;
    }

    try {
      const token = await bridge.getPersonalBaseToken();
      if (token) {
        personalBaseTokenCache = { value: token, loadedAt: Date.now() };
        return token;
      }
    } catch {
      // keep trying next candidate
    }
  }

  personalBaseTokenCache = { value: null, loadedAt: Date.now() };
  return null;
}

export async function hasFeishuTranslationProvider() {
  return !!(await getPersonalBaseToken());
}

function getLanguageUsageMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LANGUAGE_USAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLanguageUsageMap(nextMap: Record<string, number>) {
  localStorage.setItem(LANGUAGE_USAGE_KEY, JSON.stringify(nextMap));
}

export function recordLanguageUsage(code: string) {
  if (!code) return;
  const usageMap = getLanguageUsageMap();
  usageMap[code] = (usageMap[code] || 0) + 1;
  saveLanguageUsageMap(usageMap);
}

export function sortLanguageOptionsByUsage<T extends { code: string }>(
  options: T[],
  activeCodes: string[] = []
): T[] {
  const usageMap = getLanguageUsageMap();
  const activeSet = new Set(activeCodes);

  return [...options].sort((a, b) => {
    const aActive = activeSet.has(a.code) ? 1 : 0;
    const bActive = activeSet.has(b.code) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const usageDiff = (usageMap[b.code] || 0) - (usageMap[a.code] || 0);
    if (usageDiff !== 0) return usageDiff;

    return 0;
  });
}

function buildCacheKey(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  cacheScope?: string;
}) {
  const normalizedText = params.text.trim();
  return `${params.cacheScope || 'default'}|${params.sourceLang}|${params.targetLang}|${normalizedText.length}|${hashText(normalizedText)}`;
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function loadPersistedCache(): Record<string, CachedTranslation> {
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistedCache(nextCache: Record<string, CachedTranslation>) {
  try {
    const entries = Object.entries(nextCache)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_PERSISTED_CACHE_ITEMS);
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage may be full or unavailable in the host iframe.
  }
}

function getPersistedTranslation(cacheKey: string) {
  const persisted = loadPersistedCache();
  return persisted[cacheKey]?.value || '';
}

function persistTranslation(cacheKey: string, value: string) {
  const persisted = loadPersistedCache();
  persisted[cacheKey] = {
    value,
    updatedAt: Date.now(),
  };
  savePersistedCache(persisted);
}

export function getCachedTranslation(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  cacheScope?: string;
}) {
  const normalizedText = params.text.trim();
  if (!normalizedText) return '';
  const cacheKey = buildCacheKey({ ...params, text: normalizedText });
  if (translateCache.has(cacheKey)) {
    return translateCache.get(cacheKey)!;
  }
  const persisted = getPersistedTranslation(cacheKey);
  if (persisted) {
    translateCache.set(cacheKey, persisted);
  }
  return persisted;
}

export async function translateText(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  cacheScope?: string;
  allowFallback?: boolean;
  forceRefresh?: boolean;
  preferredProvider?: TranslationProvider;
  signal?: AbortSignal;
  onProgress?: (progress: TranslationProgress) => void;
}): Promise<string> {
  const normalizedText = params.text.trim();
  if (!normalizedText) {
    throw new Error('没有可翻译的内容');
  }

  const cacheKey = buildCacheKey({ ...params, text: normalizedText });
  const cached = params.forceRefresh
    ? ''
    : getCachedTranslation({ ...params, text: normalizedText });
  if (cached) {
    return cached;
  }

  const shouldReuseInFlight = !params.signal && !params.onProgress && !params.preferredProvider;
  const inFlightKey = `${cacheKey}|fallback:${params.allowFallback !== false}|force:${params.forceRefresh === true}`;
  if (shouldReuseInFlight && inFlightTranslations.has(inFlightKey)) {
    return inFlightTranslations.get(inFlightKey)!;
  }

  const task = runTranslation({ ...params, text: normalizedText }, cacheKey);
  if (shouldReuseInFlight) {
    inFlightTranslations.set(inFlightKey, task);
    task.finally(() => inFlightTranslations.delete(inFlightKey));
  }
  return task;
}

async function runTranslation(
  params: {
    text: string;
    sourceLang: string;
    targetLang: string;
    cacheScope?: string;
    allowFallback?: boolean;
    preferredProvider?: TranslationProvider;
    signal?: AbortSignal;
    onProgress?: (progress: TranslationProgress) => void;
  },
  cacheKey: string
) {
  assertNotAborted(params.signal);
  const elapsed = Date.now() - lastTranslateTime;
  if (elapsed < MIN_INTERVAL) {
    params.onProgress?.({
      stage: 'queued',
      message: '翻译请求排队中...',
    });
    await sleep(MIN_INTERVAL - elapsed, params.signal);
  }

  params.onProgress?.({
    stage: 'provider',
    message: '正在获取翻译服务...',
  });
  lastTranslateTime = Date.now();
  const sourceLangCode = convertLangCode(params.sourceLang);
  const targetLangCode = convertLangCode(params.targetLang);
  const token = params.preferredProvider === 'mymemory' ? null : await getPersonalBaseToken();
  if (!token && params.allowFallback === false) {
    throw new Error('NO_FEISHU_TRANSLATION_PROVIDER');
  }
  const provider: TranslationProvider = params.preferredProvider === 'mymemory' ? 'mymemory' : token ? 'feishu' : 'mymemory';
  const chunkLimit = provider === 'feishu' ? FEISHU_CHUNK_LIMIT : MYMEMORY_CHUNK_LIMIT;
  const chunks = splitTextIntoChunks(params.text, chunkLimit);
  params.onProgress?.({
    stage: 'provider',
    provider,
    currentChunk: 0,
    totalChunks: chunks.length,
    message:
      provider === 'feishu'
        ? `已连接飞书翻译，准备处理 ${chunks.length} 段内容...`
        : `将使用 MyMemory 手动翻译，准备处理 ${chunks.length} 段内容...`,
  });

  const translatedChunks: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    assertNotAborted(params.signal);
    params.onProgress?.({
      stage: 'chunk',
      provider,
      currentChunk: index + 1,
      totalChunks: chunks.length,
      message: `${provider === 'feishu' ? '飞书' : 'MyMemory'} 翻译中（${index + 1}/${chunks.length}）`,
    });
    translatedChunks.push(
      provider === 'feishu'
        ? await translateWithFeishu(token!, chunk, sourceLangCode, targetLangCode, params.signal)
        : await translateWithMyMemory(chunk, params.sourceLang, params.targetLang, params.signal)
    );
  }

  params.onProgress?.({
    stage: 'merge',
    provider,
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    message: '正在整理翻译结果...',
  });
  const finalText = mergeTranslatedChunks(params.text, translatedChunks);
  assertNotAborted(params.signal);
  translateCache.set(cacheKey, finalText);
  persistTranslation(cacheKey, finalText);
  params.onProgress?.({
    stage: 'done',
    provider,
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    message: '翻译完成',
  });
  return finalText;
}

export async function prefetchTranslations(items: PrefetchTranslationItem[]) {
  const uniqueItems = items.filter((item, index, list) => {
    if (!item.text.trim()) return false;
    const key = buildCacheKey(item);
    const inFlightKey = `${key}|fallback:false|force:false`;
    if (translateCache.has(key) || getPersistedTranslation(key) || inFlightTranslations.has(inFlightKey)) return false;
    return list.findIndex((next) => buildCacheKey(next) === key) === index;
  });

  for (const item of uniqueItems) {
    try {
      await translateText({ ...item, allowFallback: false });
    } catch {
      // Background prefetch must never block the active record.
    }
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0) {
    assertNotAborted(signal);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const handleAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('TRANSLATION_ABORTED'));
    };

    const cleanup = () => signal?.removeEventListener('abort', handleAbort);
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

async function translateWithFeishu(
  token: string,
  text: string,
  sourceLangCode: string,
  targetLangCode: string,
  signal?: AbortSignal
) {
  const response = await fetchWithTimeout(
    'https://open.feishu.cn/open-apis/translation/v1/text/translate',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        source_language: sourceLangCode,
        text,
        target_language: targetLangCode,
      }),
    },
    signal
  );

  const data = await response.json();
  if (data.code !== 0 || !data.data?.text) {
    throw new Error(data.msg || '飞书翻译失败');
  }
  return data.data.text;
}

async function translateWithMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal
) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const res = await fetchWithTimeout(url, undefined, signal);
  const data = await res.json();

  if (data.responseStatus !== 200) {
    throw new Error(data.responseDetails || '翻译失败');
  }

  if (!data.responseData?.translatedText) {
    throw new Error('未返回翻译结果');
  }

  return data.responseData.translatedText;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT);
  const handleAbort = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', handleAbort, { once: true });
  }
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (signal?.aborted) {
        throw new Error('TRANSLATION_ABORTED');
      }
      throw new Error('翻译超时，请稍后重试');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', handleAbort);
  }
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('TRANSLATION_ABORTED');
  }
}

function splitTextIntoChunks(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let current = '';
  const paragraphs = text.split(/(\n\s*\n)/);

  for (const part of paragraphs) {
    if (!part) continue;

    if ((current + part).length <= limit) {
      current += part;
      continue;
    }

    if (current.trim()) {
      chunks.push(current);
      current = '';
    }

    if (part.length <= limit) {
      current = part;
      continue;
    }

    const sentenceChunks = splitLongText(part, limit);
    chunks.push(...sentenceChunks.slice(0, -1));
    current = sentenceChunks[sentenceChunks.length - 1] || '';
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks.filter((chunk) => chunk.trim());
}

function splitLongText(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let current = '';
  const sentences = text.split(/(?<=[。！？!?\.])\s+|(?<=[;；])\s*/);

  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((current + sentence).length <= limit) {
      current += sentence;
      continue;
    }

    if (current.trim()) {
      chunks.push(current);
      current = '';
    }

    if (sentence.length <= limit) {
      current = sentence;
      continue;
    }

    for (let i = 0; i < sentence.length; i += limit) {
      chunks.push(sentence.slice(i, i + limit));
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

function mergeTranslatedChunks(originalText: string, translatedChunks: string[]) {
  const separator = /\n\s*\n/.test(originalText) ? '\n\n' : '\n';
  return translatedChunks.join(separator).trim();
}
