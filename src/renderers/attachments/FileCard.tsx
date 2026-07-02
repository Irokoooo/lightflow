import React from 'react';

interface FileCardProps {
  name: string;
  size?: number;
  type?: string;
  url?: string;
  icon?: string;
}

function getFileIcon(type: string): string {
  if (!type) return '📄';
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('doc')) return '📘';
  if (type.includes('sheet') || type.includes('excel') || type.includes('xls')) return '📗';
  if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return '🗜️';
  if (type.includes('text') || type.includes('txt')) return '📝';
  return '📎';
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const FileCard: React.FC<FileCardProps> = ({ name, size, type, url, icon }) => {
  return (
    <div className="file-card">
      <div className="file-icon">{icon || getFileIcon(type || '')}</div>
      <div className="file-info">
        <div className="file-name" title={name}>
          {name}
        </div>
        <div className="file-meta">
          {type ? type.split('/')[1] || type : ''}
          {size != null ? ` · ${formatSize(size)}` : ''}
        </div>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="file-download"
          download={name}
        >
          ⬇
        </a>
      )}
    </div>
  );
};

export default FileCard;
