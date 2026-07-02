import React, { useState, useEffect, useMemo } from 'react';
import { bitable, ImageQuality } from '@lark-base-open/js-sdk';
import ImagePreview from './attachments/ImagePreview';
import PdfPreview from './attachments/PdfPreview';
import VideoPreview from './attachments/VideoPreview';
import AudioPreview from './attachments/AudioPreview';
import CodePreview from './attachments/CodePreview';
import CsvPreview from './attachments/CsvPreview';
import DocPreview from './attachments/DocPreview';
import FileCard from './attachments/FileCard';
import { IOpenAttachment } from '../types';
import { AttachmentFilter } from '../components/AttachmentFilter';
import { detectFileType, TYPE_LABELS } from '../utils/fileType';
import './attachments/attachments.css';

interface AttachmentRendererProps {
  value: any;
  fieldId?: string;
  tableId?: string;
  recordId?: string;
}

function isImage(mime: string): boolean {
  return /^image\//.test(mime);
}

function isPdf(mime: string, name: string): boolean {
  return mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
}

function isVideo(mime: string): boolean {
  return /^video\//.test(mime);
}

function isAudio(mime: string): boolean {
  return /^audio\//.test(mime);
}

function isCodeFile(mime: string, name: string): boolean {
  const codeExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.json', '.yml', '.yaml',
    '.sh', '.bash', '.c', '.cpp', '.h', '.java', '.go', '.rs', '.rb', '.php',
    '.swift', '.kt', '.sql', '.css', '.scss', '.html', '.xml', '.md', '.txt', '.log'];
  const lower = name.toLowerCase();
  if (codeExts.some((ext) => lower.endsWith(ext))) return true;
  if (mime.startsWith('text/') && mime !== 'text/html') return true;
  if (mime.includes('javascript') || mime.includes('json')) return true;
  return false;
}

function isFeishuDoc(name: string): boolean {
  return /\.(docx|wiki|sheet|bitable|mindnote|file)$/i.test(name) ||
    name.toLowerCase().includes('feishu') ||
    name.toLowerCase().includes('lark');
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const AttachmentRenderer: React.FC<AttachmentRendererProps> = ({ value, fieldId, tableId, recordId }) => {
  const [attachments, setAttachments] = useState<IOpenAttachment[]>([]);
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [thumbUrlMap, setThumbUrlMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('lightflow_attachment_collapsed') === 'true';
  });
  const [filtered, setFiltered] = useState<any[]>([]);

  useEffect(() => {
    if (!value) {
      setAttachments([]);
      setUrlMap({});
      setThumbUrlMap({});
      setFiltered([]);
      return;
    }
    const attList: IOpenAttachment[] = Array.isArray(value) ? value.filter((a: any) => a && typeof a === 'object') : [value];
    setAttachments(attList);
    setUrlMap(
      Object.fromEntries(attList.map((a: any) => [a.token, a.url || a.tmp_url || a.download_url || '']))
    );
    setFiltered(attList);
  }, [value]);

  useEffect(() => {
    if (!fieldId || !tableId || !recordId) return;
    if (attachments.length === 0) return;

    const hasEmptyUrl = attachments.some((att) => !urlMap[att.token]);
    if (!hasEmptyUrl) {
      return;
    }

    let cancelled = false;
    async function refreshUrls() {
      try {
        setLoading(true);
        const table = await bitable.base.getTableById(tableId as string);
        const tokens = attachments.map((att) => att.token).filter(Boolean);
        const urlList = tokens.length
          ? await table.getCellAttachmentUrls(tokens, fieldId as string, recordId as string)
          : [];
        let thumbList: string[] = [];
        try {
          thumbList = tokens.length
            ? await table.getCellThumbnailUrls(
                tokens,
                fieldId as string,
                recordId as string,
                ImageQuality.Mid
              )
            : [];
        } catch {
          thumbList = [];
        }
        if (!cancelled) {
          setUrlMap(
            Object.fromEntries(
              attachments.map((att, index) => [
                att.token,
                urlList[index] || (att as any).url || (att as any).tmp_url || '',
              ])
            )
          );
          setThumbUrlMap(
            Object.fromEntries(
              attachments.map((att, index) => [att.token, thumbList[index] || ''])
            )
          );
          setError(false);
        }
      } catch (e) {
        if (!cancelled) {
          const hasLocalFallback = attachments.some(
            (att: any) => att?.url || att?.tmp_url || att?.download_url
          );
          setError(!hasLocalFallback);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    refreshUrls();
    return () => {
      cancelled = true;
    };
  }, [fieldId, tableId, recordId, attachments, urlMap]);

  const totalSize = useMemo(() => {
    return attachments.reduce((sum, att) => sum + (att.size || 0), 0);
  }, [attachments]);

  const toggleCollapsed = () => {
    const newVal = !collapsed;
    setCollapsed(newVal);
    localStorage.setItem('lightflow_attachment_collapsed', String(newVal));
  };

  const safeAttachments = attachments.filter((a) => a && typeof a === 'object');
  
  if (safeAttachments.length === 0) {
    return <div className="renderer-empty">—</div>;
  }

  return (
    <div className="renderer-attachment">
      <div className="attachment-header">
        <span className="attachment-title">
          📎 附件 ({safeAttachments.length} 个 · {formatSize(totalSize)})
        </span>
        <button className="attachment-toggle" onClick={toggleCollapsed}>
          {collapsed ? '▶ 展开' : '▼ 收起'}
        </button>
      </div>

      {!collapsed && (
        <>
          <AttachmentFilter attachments={safeAttachments} onFilteredChange={setFiltered} />

          <div className="attachment-grid">
            {filtered.map((att: IOpenAttachment, idx: number) => {
              if (!att || typeof att !== 'object') return null;
              
              const mime = att.type || '';
              const name = att.name || '';
              const url = urlMap[att.token] || (att as any).url || (att as any).tmp_url || '';
              const thumbUrl = thumbUrlMap[att.token] || url;

              const fileType = detectFileType(att);

              if (fileType === 'image') {
                return (
                  <React.Fragment key={att.token || idx}>
                    {url ? (
                      <ImagePreview url={thumbUrl} fullUrl={url} name={name} />
                    ) : (
                      <div className="attachment-item">
                        <FileCard name={name} size={att.size} type={mime} />
                      </div>
                    )}
                  </React.Fragment>
                );
              }

              if (fileType === 'pdf') {
                return (
                  <React.Fragment key={att.token || idx}>
                    {url ? (
                      <PdfPreview
                        url={url}
                        name={name}
                        token={att.token}
                        tableId={tableId}
                        fieldId={fieldId}
                        recordId={recordId}
                      />
                    ) : (
                      <div className="attachment-item">
                        <FileCard name={name} size={att.size} type={mime} />
                      </div>
                    )}
                  </React.Fragment>
                );
              }

              if (fileType === 'csv') {
                return (
                  <React.Fragment key={att.token || idx}>
                    {url ? (
                      <CsvPreview
                        url={url}
                        name={name}
                        token={att.token}
                        tableId={tableId}
                        fieldId={fieldId}
                        recordId={recordId}
                      />
                    ) : (
                      <div className="attachment-item">
                        <FileCard name={name} size={att.size} type={mime} />
                      </div>
                    )}
                  </React.Fragment>
                );
              }

              if (fileType === 'video') {
                return (
                  <div key={att.token || idx} className="attachment-item">
                    {url ? (
                      <VideoPreview url={url} name={name} />
                    ) : (
                      <FileCard name={name} size={att.size} type={mime} />
                    )}
                  </div>
                );
              }

              if (fileType === 'audio') {
                return (
                  <div key={att.token || idx} className="attachment-item">
                    {url ? (
                      <AudioPreview url={url} name={name} />
                    ) : (
                      <FileCard name={name} size={att.size} type={mime} />
                    )}
                  </div>
                );
              }

              if (fileType === 'code') {
                return (
                  <div key={att.token || idx} className="attachment-item">
                    {url ? (
                      <CodePreview url={url} name={name} mimeType={mime} />
                    ) : (
                      <FileCard name={name} size={att.size} type={mime} />
                    )}
                  </div>
                );
              }

              if (fileType === 'document') {
                const fileIcon = TYPE_LABELS[fileType]?.icon || '📎';
                return (
                  <React.Fragment key={att.token || idx}>
                    {url ? (
                      <DocPreview url={url} name={name} />
                    ) : (
                      <div className="attachment-item">
                        <FileCard name={name} size={att.size} type={mime} icon={fileIcon} />
                      </div>
                    )}
                  </React.Fragment>
                );
              }

              if (fileType === 'archive' || fileType === 'other') {
                const fileIcon = TYPE_LABELS[fileType]?.icon || '📎';
                return (
                  <div key={att.token || idx} className="attachment-item">
                    <FileCard
                      name={name}
                      size={att.size}
                      type={mime}
                      url={url || undefined}
                      icon={fileIcon}
                    />
                  </div>
                );
              }

              return (
                <div key={att.token || idx} className="attachment-item">
                  <FileCard
                    name={name}
                    size={att.size}
                    type={mime}
                    url={url || undefined}
                  />
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="attachment-empty">该类型暂无附件</div>
          )}
        </>
      )}

      {loading && <div className="attachment-loading">正在获取附件链接...</div>}
      {error && <div className="attachment-error">附件加载失败</div>}
    </div>
  );
};

export default AttachmentRenderer;
