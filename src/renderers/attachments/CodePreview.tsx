import React, { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodePreviewProps {
  url: string;
  name: string;
  mimeType: string;
}

function detectLanguage(name: string, mimeType: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'markup',
    xml: 'markup',
    sh: 'bash',
    bash: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    go: 'go',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    c: 'c',
    cpp: 'cpp',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    sql: 'sql',
  };
  if (langMap[ext]) return langMap[ext];
  if (mimeType.includes('javascript')) return 'javascript';
  if (mimeType.includes('json')) return 'json';
  if (mimeType.includes('html')) return 'markup';
  if (mimeType.includes('css')) return 'css';
  return 'text';
}

const CodePreview: React.FC<CodePreviewProps> = ({ url, name, mimeType }) => {
  const [code, setCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const language = detectLanguage(name, mimeType);

  useEffect(() => {
    let cancelled = false;
    async function fetchCode() {
      try {
        setLoading(true);
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const text = await res.text();
        if (!cancelled) {
          setCode(text);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }
    fetchCode();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="attachment-preview-fallback">
        <span className="fallback-icon">💻</span>
        <span className="fallback-name">{name}</span>
      </div>
    );
  }

  return (
    <div className="code-preview">
      <div className="code-header">
        <span className="code-name">{name}</span>
        <span className="code-lang">{language}</span>
      </div>
      {loading ? (
        <div className="code-loading">加载中...</div>
      ) : (
        <div className="code-body">
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '12px' }}
            showLineNumbers
            wrapLines
          >
            {code}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
};

export default CodePreview;
