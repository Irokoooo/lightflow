import React, { useState } from 'react';

interface UrlRendererProps {
  value: any;
}

function getTextFromCellValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((seg: any) => seg.text || seg.link || '')
      .join('');
  }
  return String(value);
}

function getUrlFromCellValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const firstSeg = value.find((seg: any) => seg.link);
    if (firstSeg) return firstSeg.link;
    return value.map((seg: any) => seg.text || '').join('');
  }
  return String(value);
}

function isFeishuUrl(url: string): boolean {
  return (
    url.includes('feishu.cn') ||
    url.includes('larksuite.com') ||
    url.includes('bytedance.larkoffice.com') ||
    url.includes('larkoffice.com')
  );
}

const UrlRenderer: React.FC<UrlRendererProps> = ({ value }) => {
  const [showIframe, setShowIframe] = useState(false);
  const text = getTextFromCellValue(value);
  const url = getUrlFromCellValue(value);

  if (!url && !text) {
    return <div className="renderer-empty">—</div>;
  }

  const displayText = text || url;
  const isFeishu = isFeishuUrl(url);

  return (
    <div className="renderer-url">
      <div className="url-link-row">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="url-link"
        >
          {displayText}
          <span className="url-external-icon">↗</span>
        </a>
      </div>

      {isFeishu && (
        <div className="url-preview-section">
          {!showIframe ? (
            <button
              className="btn-expand-preview"
              onClick={() => setShowIframe(true)}
            >
              展开预览
            </button>
          ) : (
            <div className="url-iframe-container">
              <div className="url-iframe-header">
                <span>飞书文档预览</span>
                <button
                  className="btn-collapse-preview"
                  onClick={() => setShowIframe(false)}
                >
                  收起
                </button>
              </div>
              <iframe
                src={url}
                className="url-iframe"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title="Feishu Document"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UrlRenderer;
