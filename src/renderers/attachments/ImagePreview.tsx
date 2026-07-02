import React, { useState } from 'react';

interface ImagePreviewProps {
  url: string;
  name: string;
  fullUrl?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ url, name, fullUrl }) => {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(100);

  if (error) {
    return (
      <div className="attachment-preview-fallback">
        <span className="fallback-icon">🖼️</span>
        <span className="fallback-name">{name}</span>
      </div>
    );
  }

  return (
    <div className={`image-preview-container ${expanded ? 'expanded' : ''}`}>
      <div
        className="image-preview-thumb"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <img
          src={url}
          alt={name}
          onError={() => setError(true)}
          loading="lazy"
        />
        {!expanded && (
          <div className="image-preview-overlay">
            <span className="image-preview-label">{name}</span>
            <span className="image-preview-hint">点击查看大图</span>
          </div>
        )}
      </div>
      {expanded && (
        <div className="image-expanded-view">
          <div className="image-expanded-header">
            <span className="image-expanded-name">{name}</span>
            <div className="image-expanded-actions">
              <label className="image-zoom-control">
                <span>大小</span>
                <input
                  type="range"
                  min="50"
                  max="160"
                  step="10"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <button className="image-expanded-close" onClick={() => setExpanded(false)}>✕</button>
            </div>
          </div>
          <div className="image-expanded-body">
            <img src={fullUrl || url} alt={name} style={{ width: `${zoom}%`, maxWidth: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ImagePreview;
