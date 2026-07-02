import React from 'react';

interface DocsPreviewProps {
  name: string;
  token?: string;
}

const DocsPreview: React.FC<DocsPreviewProps> = ({ name, token }) => {
  if (!token) {
    return (
      <div className="attachment-preview-fallback">
        <span className="fallback-icon">📄</span>
        <span className="fallback-name">{name}</span>
      </div>
    );
  }

  const docUrl = `https://bytedance.larkoffice.com/docx/${token}`;

  return (
    <div className="docs-preview-card">
      <div className="docs-header">
        <span className="docs-icon">📄</span>
        <span className="docs-name">{name}</span>
      </div>
      <div className="docs-iframe-wrapper">
        <iframe
          src={docUrl}
          title={name}
          className="docs-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
      <a
        href={docUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="docs-open-link"
      >
        在飞书中打开 →
      </a>
    </div>
  );
};

export default DocsPreview;
