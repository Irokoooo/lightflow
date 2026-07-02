import React, { useState, useEffect } from 'react';

// #region debug-point A:doc-preview
const dbgDoc = (_hypothesisId: string, _msg: string, _data: Record<string, any> = {}) => {};
// #endregion

interface DocPreviewProps {
  url: string;
  name: string;
}

function getDocIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return '📘';
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv')) return '📗';
  if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) return '📙';
  if (lower.endsWith('.pdf')) return '📕';
  return '📄';
}

const DocPreview: React.FC<DocPreviewProps> = ({ url, name }) => {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const lower = name.toLowerCase();
  const isDocx = lower.endsWith('.docx');
  const icon = getDocIcon(name);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const fetchAndParse = async () => {
      try {
        setLoading(true);
        // #region debug-point A:doc-fetch-start
        dbgDoc('A', 'doc fetch start', { name, url, isDocx });
        // #endregion
        const response = await fetch(url, {
          method: 'GET',
        });
        // #region debug-point A:doc-fetch-response
        dbgDoc('A', 'doc fetch response', { name, url, ok: response.ok, status: response.status, contentType: response.headers.get('content-type'), disposition: response.headers.get('content-disposition'), isDocx });
        // #endregion
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();

        if (isDocx) {
          // #region debug-point A:docx-parse-start
          dbgDoc('A', 'docx parse start', { name, size: blob.size, type: blob.type });
          // #endregion
          const { default: mammoth } = await import('mammoth');
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (!cancelled) {
            setContent(result.value);
            setError(false);
            // #region debug-point A:docx-parse-ok
            dbgDoc('A', 'docx parse ok', { name, htmlLength: result.value.length });
            // #endregion
          }
        } else {
          const text = await blob.text();
          if (!cancelled) {
            setContent(text.substring(0, 5000));
            setError(false);
            // #region debug-point A:doc-text-ok
            dbgDoc('A', 'doc text fallback ok', { name, textLength: text.length });
            // #endregion
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(true);
          setContent('');
          // #region debug-point A:doc-fetch-failed
          dbgDoc('A', 'doc fetch or parse failed', { name, url, isDocx, message: (err as any)?.message || String(err) });
          // #endregion
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchAndParse();
    return () => {
      cancelled = true;
    };
  }, [url, isDocx, expanded]);

  if (error) {
    return (
      <div className="attachment-preview-fallback">
        <span className="fallback-icon">{icon}</span>
        <span className="fallback-name">{name}</span>
        <a href={url} download className="file-download">⬇</a>
      </div>
    );
  }

  return (
    <div className={`doc-preview-container ${expanded ? 'expanded' : ''}`}>
      <div
        className="attachment-preview-fallback"
        onClick={() => {
          // #region debug-point B:doc-click
          dbgDoc('B', 'doc preview clicked', { name, url, isDocx, expandedBefore: expanded, error, loading });
          // #endregion
          setExpanded(!expanded);
        }}
        role="button"
        tabIndex={0}
      >
        <span className="fallback-icon">{icon}</span>
        <span className="fallback-name">{name}</span>
        {loading && <span style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>解析中...</span>}
      </div>

      {expanded && (
        <div className="doc-expanded-view">
          <div className="doc-expanded-header">
            <span className="doc-expanded-icon">{icon}</span>
            <span className="doc-expanded-name">{name}</span>
            <button className="doc-expanded-close" onClick={(e) => { e.stopPropagation(); setExpanded(false); }}>✕</button>
          </div>
          <div className="doc-expanded-body">
            {loading ? (
              <div className="pdf-loading">正在解析文档...</div>
            ) : content ? (
              <div className="doc-content-preview" dangerouslySetInnerHTML={{ __html: isDocx ? content : `<pre>${content}</pre>` }} />
            ) : (
              <div className="pdf-loading">文档内容为空</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocPreview;
