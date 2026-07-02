import { bitable } from '@lark-base-open/js-sdk';

export type ManualType = 'docx' | 'wiki' | 'unknown';

export interface ManualChunk {
  id: string;
  text: string;
}

export interface ParsedManual {
  sourceUrl: string;
  sourceType: ManualType;
  sourceToken: string;
  documentId: string;
  title: string;
  rawContent: string;
  chunks: ManualChunk[];
  parsedAt: number;
}

export interface ManualAnswer {
  answer: string;
  citations: ManualChunk[];
}

interface FeishuResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface WikiNodeResponse {
  node?: {
    title?: string;
    obj_token?: string;
    obj_type?: string;
  };
}

interface DocInfoResponse {
  document?: {
    title?: string;
  };
}

interface DocRawContentResponse {
  content?: string;
}

const CHUNK_SIZE = 220;
const STORAGE_PREFIX = 'lightflow_manual_assistant';

function normalizeText(text: string): string {
  return text
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectDocType(rawUrl: string): { type: ManualType; token: string } {
  try {
    const url = new URL(rawUrl.trim());
    const parts = url.pathname.split('/').filter(Boolean);
    const docxIndex = parts.indexOf('docx');
    const wikiIndex = parts.indexOf('wiki');

    if (docxIndex !== -1 && parts[docxIndex + 1]) {
      return { type: 'docx', token: parts[docxIndex + 1] };
    }

    if (wikiIndex !== -1 && parts[wikiIndex + 1]) {
      return { type: 'wiki', token: parts[wikiIndex + 1] };
    }
  } catch {
    return { type: 'unknown', token: '' };
  }

  return { type: 'unknown', token: '' };
}

async function getUserAccessToken(): Promise<string> {
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
        return token;
      }
    } catch {
      // try next candidate
    }
  }

  const availableMethods = Array.from(new Set(
    candidates.flatMap((bridge) => Object.keys(bridge || {}))
  ));
  const methodsText = availableMethods.length > 0 ? availableMethods.join(', ') : '无';
  throw new Error(`当前环境拿不到 PersonalBaseToken，bridge 可用方法：${methodsText}`);
}

async function feishuGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://open.feishu.cn${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

  const data = (await response.json()) as FeishuResponse<T>;
  if (!response.ok || data.code !== 0 || !data.data) {
    throw new Error(data.msg || `请求失败 (${response.status})`);
  }

  return data.data;
}

async function resolveDocumentInfo(sourceType: ManualType, sourceToken: string, token: string) {
  if (sourceType === 'docx') {
    return {
      documentId: sourceToken,
      title: '',
    };
  }

  const wikiData = await feishuGet<WikiNodeResponse>(
    `/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(sourceToken)}`,
    token
  );

  const objType = wikiData.node?.obj_type;
  const objToken = wikiData.node?.obj_token;
  if (!objToken) {
    throw new Error('知识库节点没有返回正文文档 token');
  }

  if (objType && objType !== 'docx') {
    throw new Error(`当前仅支持 Wiki 中的 docx 页面，当前类型为 ${objType}`);
  }

  return {
    documentId: objToken,
    title: wikiData.node?.title || '',
  };
}

async function getDocumentTitle(documentId: string, token: string): Promise<string> {
  try {
    const docInfo = await feishuGet<DocInfoResponse>(
      `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}`,
      token
    );
    return docInfo.document?.title || '';
  } catch {
    return '';
  }
}

function buildChunks(rawContent: string): ManualChunk[] {
  const normalized = normalizeText(rawContent);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: ManualChunk[] = [];
  let buffer = '';
  let index = 0;

  const pushBuffer = () => {
    const next = buffer.trim();
    if (!next) return;
    chunks.push({
      id: `chunk-${index + 1}`,
      text: next,
    });
    index += 1;
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).trim().length > CHUNK_SIZE && buffer) {
      pushBuffer();
    }

    if (paragraph.length > CHUNK_SIZE * 1.5) {
      const lines = paragraph.split('\n').map((item) => item.trim()).filter(Boolean);
      for (const line of lines) {
        if ((buffer + '\n' + line).trim().length > CHUNK_SIZE && buffer) {
          pushBuffer();
        }
        buffer = buffer ? `${buffer}\n${line}` : line;
      }
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
  }

  pushBuffer();
  return chunks;
}

function extractKeywords(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const matches = normalized.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9_]{2,}/g) || [];
  return Array.from(new Set(matches));
}

function scoreChunk(chunk: ManualChunk, keywords: string[], query: string): number {
  const text = chunk.text.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      const hits = text.split(keyword).length - 1;
      score += 8 + hits * 2;
    }
  }

  if (query.length >= 4 && text.includes(query.toLowerCase())) {
    score += 15;
  }

  if (text.includes('注意') || text.includes('规范') || text.includes('要求')) {
    score += 2;
  }

  return score;
}

function pickFollowupQuestion(query: string): string {
  if (query.includes('什么意思') || query.includes('选项')) {
    return '你现在犹豫的是哪两个选项，还是某个术语本身不清楚？';
  }
  if (query.includes('规范') || query.includes('怎么写') || query.includes('填写')) {
    return '你想确认的是格式、长度、必填条件，还是示例写法？';
  }
  if (query.includes('优先') || query.includes('两个规则')) {
    return '这两个规则各自命中了什么条件，有没有手册里的例外条款？';
  }
  return '你现在最卡的是规则定义、适用范围，还是例外情况？';
}

export async function parseManualFromUrl(rawUrl: string): Promise<ParsedManual> {
  const { type, token: sourceToken } = detectDocType(rawUrl);
  if (type === 'unknown' || !sourceToken) {
    throw new Error('手册链接暂未识别，请使用飞书 docx 或 wiki 链接');
  }

  const userToken = await getUserAccessToken();
  const { documentId, title: resolvedTitle } = await resolveDocumentInfo(type, sourceToken, userToken);

  const rawData = await feishuGet<DocRawContentResponse>(
    `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content?lang=0`,
    userToken
  );

  const rawContent = normalizeText(rawData.content || '');
  if (!rawContent) {
    throw new Error('手册正文为空，暂时无法建立问答索引');
  }

  const title = resolvedTitle || (await getDocumentTitle(documentId, userToken)) || '未命名手册';
  const chunks = buildChunks(rawContent);

  return {
    sourceUrl: rawUrl.trim(),
    sourceType: type,
    sourceToken,
    documentId,
    title,
    rawContent,
    chunks,
    parsedAt: Date.now(),
  };
}

export function answerManualQuestion(manual: ParsedManual, query: string): ManualAnswer {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error('请输入你的问题');
  }

  const keywords = extractKeywords(trimmedQuery);
  const ranked = manual.chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, keywords, trimmedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return {
      answer: [
        '仅是AI参考，若仍有不理解请联系相关负责人询问。',
        `我暂时没在《${manual.title}》里检索到和这个问题足够直接对应的原文。`,
        '建议你换一种问法，尽量把字段名、选项名、冲突规则名写全。',
      ].join('\n'),
      citations: [],
    };
  }

  const answerLines = [
    '仅是AI参考，若仍有不理解请联系相关负责人询问。',
    `我先按《${manual.title}》里最接近的规则给你定位到 ${ranked.length} 段原文。`,
    '判断时建议优先看：定义描述、适用条件、例外说明、边界案例。',
    pickFollowupQuestion(trimmedQuery),
  ];

  return {
    answer: answerLines.join('\n'),
    citations: ranked.map(({ score: _score, ...chunk }) => chunk),
  };
}

export const manualAssistantStorage = {
  parsedKey: `${STORAGE_PREFIX}:parsed_manual`,
  urlKey: `${STORAGE_PREFIX}:url`,
};
