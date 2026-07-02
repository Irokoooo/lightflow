import React, { useEffect, useState } from 'react';
import { fetchAttachmentBlob } from './attachmentFetch';

// #region debug-point A:pdf-preview
const dbgPdf = (_hypothesisId: string, _msg: string, _data: Record<string, any> = {}) => {};
// #endregion

interface PdfPreviewProps {
  url: string;
  name: string;
  token?: string;
  tableId?: string;
  fieldId?: string;
  recordId?: string;
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ url, name, token, tableId, fieldId, recordId }) => {
  const [expanded, setExpanded] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revokedUrl = '';
    let cancelled = false;

    if (!expanded) {
      return;
    }

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        dbgPdf('A', 'pdf fetch start', { name, url });
        const blob = await fetchAttachmentBlob({ url, token, tableId, fieldId, recordId });
        dbgPdf('A', 'pdf fetch response', { name, url, ok: true, size: blob.size, type: blob.type });
        revokedUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setBlobUrl(revokedUrl);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'PDF 预览加载失败');
          dbgPdf('A', 'pdf fetch failed', { name, url, message: err?.message || String(err) });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [expanded, fieldId, name, recordId, tableId, token, url]);

  return (
    <div className={`pdf-preview-container ${expanded ? 'expanded' : ''}`}>
      <div
        className="attachment-preview-fallback"
        onClick={() => {
          // #region debug-point A:pdf-expand-toggle
          dbgPdf('A', 'pdf expand toggled', { name, url, expandedBefore: expanded });
          // #endregion
          setExpanded(!expanded);
        }}
        role="button"
        tabIndex={0}
      >
        <span className="fallback-icon">📕</span>
        <span className="fallback-name">{name}</span>
      </div>
      {expanded && (
        <div className="pdf-expanded-view">
          <div className="pdf-expanded-header">
            <span className="pdf-expanded-name">{name}</span>
            <button className="pdf-expanded-close" onClick={() => setExpanded(false)}>✕</button>
          </div>
          <div className="pdf-expanded-body">
            {loading && <div className="renderer-empty">PDF 加载中...</div>}
            {!loading && error && <div className="inline-edit-error">{error}</div>}
            {!loading && !error && blobUrl && (
              <iframe
                src={blobUrl}
                title={name}
                className="pdf-expanded-iframe"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfPreview;
