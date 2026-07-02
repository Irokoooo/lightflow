export type DetectedLanguage = {
  code: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
};

type LatinRule = {
  code: string;
  name: string;
  strongPatterns?: RegExp[];
  keywords: string[];
  regionKeywords?: string[];
};

function tokenizeLatinText(text: string): string[] {
  return (text.toLowerCase().match(/[a-z\u00c0-\u024f']+/g) || []).filter((token) => token.length >= 2);
}

function scoreLatinLanguage(sample: string, tokens: string[], rule: LatinRule): number {
  let score = 0;
  const uniqueTokens = new Set(tokens);

  for (const token of rule.keywords) {
    if (uniqueTokens.has(token)) {
      score += token.length <= 3 ? 1 : 2;
    }
  }

  for (const token of rule.regionKeywords || []) {
    if (uniqueTokens.has(token)) {
      score += 4;
    }
  }

  for (const pattern of rule.strongPatterns || []) {
    if (pattern.test(sample)) {
      score += 5;
    }
  }

  return score;
}

const LATIN_LANGUAGE_RULES: LatinRule[] = [
  {
    code: 'pt-BR',
    name: '葡语（巴西）',
    strongPatterns: [/[ãõç]/i],
    keywords: ['não', 'para', 'como', 'muito', 'obrigado', 'obrigada', 'estou', 'está', 'estão', 'com', 'uma', 'esse', 'essa'],
    regionKeywords: ['você', 'vocês', 'pra', 'ônibus', 'celular', 'trem', 'legal', 'valeu', 'brigado'],
  },
  {
    code: 'pt-PT',
    name: '葡语（葡萄牙）',
    strongPatterns: [/[ãõç]/i],
    keywords: ['não', 'para', 'como', 'muito', 'obrigado', 'obrigada', 'estou', 'está', 'estão', 'com', 'uma', 'esse', 'essa'],
    regionKeywords: ['telemóvel', 'autocarro', 'fixe', 'miúdo', 'giro', 'tu'],
  },
  {
    code: 'es-MX',
    name: '西语（墨西哥）',
    strongPatterns: [/[ñ¿¡]/i],
    keywords: ['hola', 'gracias', 'favor', 'qué', 'cómo', 'dónde', 'cuándo', 'porque', 'muy', 'para', 'con'],
    regionKeywords: ['órale', 'neta', 'chido', 'güey', 'ahorita', 'platicar', 'manejar', 'mande', 'cel'],
  },
  {
    code: 'es',
    name: '西语（西班牙）',
    strongPatterns: [/[ñ¿¡]/i],
    keywords: ['hola', 'gracias', 'favor', 'qué', 'cómo', 'dónde', 'cuándo', 'porque', 'muy', 'para', 'con'],
    regionKeywords: ['vale', 'vosotros', 'móvil', 'coche'],
  },
  {
    code: 'tl',
    name: '菲律宾语',
    keywords: ['ang', 'mga', 'ako', 'ikaw', 'siya', 'kami', 'kayo', 'sila', 'po', 'opo', 'hindi', 'wala', 'pwede', 'lang', 'naman', 'dito', 'iyan'],
    regionKeywords: ['kamusta', 'salamat', 'bahay', 'trabaho'],
  },
  {
    code: 'id',
    name: '印尼语',
    keywords: ['yang', 'dan', 'dari', 'untuk', 'tidak', 'apa', 'bagaimana', 'sudah', 'belum', 'bisa', 'dengan', 'karena', 'juga', 'kalau'],
    regionKeywords: ['nggak', 'gak', 'aja', 'kok', 'dong'],
  },
  {
    code: 'vi',
    name: '越南语',
    strongPatterns: [/[\u0102\u0103\u0110\u0111\u01a0\u01a1\u01af\u01b0]/],
    keywords: ['là', 'của', 'và', 'có', 'không', 'được', 'rất', 'cho', 'một', 'này'],
  },
  {
    code: 'fr',
    name: '法语',
    strongPatterns: [/[àâçéèêëîïôûùüÿœæ]/i],
    keywords: ['bonjour', 'merci', 'pour', 'avec', 'vous', 'nous', 'dans', 'une', 'des', 'est', 'sont'],
  },
  {
    code: 'de',
    name: '德语',
    strongPatterns: (/[äöüß]/i ? [/[äöüß]/i] : []),
    keywords: ['und', 'oder', 'ist', 'sind', 'war', 'haben', 'nicht', 'bitte', 'danke', 'mit', 'für'],
  },
  {
    code: 'it',
    name: '意大利语',
    keywords: ['ciao', 'grazie', 'per', 'come', 'dove', 'quando', 'sono', 'una', 'con', 'non'],
  },
];

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.length < 3) {
    return { code: 'en', name: '英语', confidence: 'low' };
  }

  const sample = text.slice(0, 500);
  const tokens = tokenizeLatinText(sample);

  if (/[\u4e00-\u9fff]/.test(sample)) {
    return { code: 'zh-CN', name: '中文（简体）', confidence: 'high' };
  }

  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) {
    return { code: 'ja', name: '日语', confidence: 'high' };
  }

  if (/[\uac00-\ud7af]/.test(sample)) {
    return { code: 'ko', name: '韩语', confidence: 'high' };
  }

  if (/[\u0400-\u04ff]/.test(sample)) {
    return { code: 'ru', name: '俄语', confidence: 'high' };
  }

  if (/[\u0600-\u06ff]/.test(sample)) {
    return { code: 'ar', name: '阿拉伯语', confidence: 'high' };
  }

  if (/[\u0900-\u097f]/.test(sample)) {
    return { code: 'hi', name: '印地语', confidence: 'high' };
  }

  if (/[\u0e00-\u0e7f]/.test(sample)) {
    return { code: 'th', name: '泰语', confidence: 'high' };
  }

  const ranked = LATIN_LANGUAGE_RULES
    .map((rule) => ({
      code: rule.code,
      name: rule.name,
      score: scoreLatinLanguage(sample, tokens, rule),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  if (best && best.score >= 4) {
    const confidence =
      best.score >= 8 || (best.score >= 5 && (!second || best.score - second.score >= 3))
        ? 'high'
        : 'medium';
    return { code: best.code, name: best.name, confidence };
  }

  return { code: 'en', name: '英语', confidence: 'low' };
}

export const SUPPORTED_TARGET_LANGS = [
  { code: 'zh-CN', name: '中文（简体）', flag: '🇨🇳', shortLabel: 'CN' },
  { code: 'zh-TW', name: '中文（繁体）', flag: '🇹🇼', shortLabel: 'TW' },
  { code: 'en', name: '英语', flag: '🇺🇸', shortLabel: 'EN' },
  { code: 'ja', name: '日语', flag: '🇯🇵', shortLabel: 'JA' },
  { code: 'ko', name: '韩语', flag: '🇰🇷', shortLabel: 'KO' },
  { code: 'es-MX', name: '西语（墨西哥）', flag: '🇲🇽', shortLabel: 'MX' },
  { code: 'es', name: '西语（西班牙）', flag: '🇪🇸', shortLabel: 'ES' },
  { code: 'pt-BR', name: '葡语（巴西）', flag: '🇧🇷', shortLabel: 'BR' },
  { code: 'pt-PT', name: '葡语（葡萄牙）', flag: '🇵🇹', shortLabel: 'PT' },
  { code: 'id', name: '印尼语', flag: '🇮🇩', shortLabel: 'ID' },
  { code: 'tl', name: '菲律宾语', flag: '🇵🇭', shortLabel: 'PH' },
  { code: 'vi', name: '越南语', flag: '🇻🇳', shortLabel: 'VI' },
  { code: 'th', name: '泰语', flag: '🇹🇭', shortLabel: 'TH' },
  { code: 'fr', name: '法语', flag: '🇫🇷', shortLabel: 'FR' },
  { code: 'de', name: '德语', flag: '🇩🇪', shortLabel: 'DE' },
  { code: 'it', name: '意大利语', flag: '🇮🇹', shortLabel: 'IT' },
  { code: 'ru', name: '俄语', flag: '🇷🇺', shortLabel: 'RU' },
  { code: 'ar', name: '阿拉伯语', flag: '🇸🇦', shortLabel: 'AR' },
  { code: 'hi', name: '印地语', flag: '🇮🇳', shortLabel: 'HI' },
];

export function getLangInfo(code: string) {
  return SUPPORTED_TARGET_LANGS.find((l) => l.code === code) || { code, name: code, flag: '🌐' };
}
