import { useState, useMemo, useEffect } from 'react';
import { detectFileType, TYPE_LABELS, type FileType } from '../utils/fileType';
import './AttachmentFilter.css';

interface Props {
  attachments: any[];
  onFilteredChange: (filtered: any[]) => void;
}

export function AttachmentFilter({ attachments, onFilteredChange }: Props) {
  const [activeType, setActiveType] = useState<string>(() => {
    return localStorage.getItem('lightflow_attachment_filter') || 'all';
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: attachments.length };
    Object.keys(TYPE_LABELS).forEach((k) => (c[k] = 0));
    attachments.forEach((att) => {
      const type = detectFileType(att);
      c[type] = (c[type] || 0) + 1;
    });
    return c;
  }, [attachments]);

  useEffect(() => {
    const filtered =
      activeType === 'all'
        ? attachments
        : attachments.filter((att) => detectFileType(att) === activeType);
    onFilteredChange(filtered);
  }, [activeType, attachments, onFilteredChange]);

  const handleTypeChange = (type: string) => {
    setActiveType(type);
    localStorage.setItem('lightflow_attachment_filter', type);
  };

  return (
    <div className="attachment-filter-tabs">
      <button
        className={`filter-tab ${activeType === 'all' ? 'active' : ''}`}
        onClick={() => handleTypeChange('all')}
      >
        全部 {counts.all}
      </button>
      {(Object.keys(TYPE_LABELS) as FileType[]).map((type) =>
        counts[type] > 0 ? (
          <button
            key={type}
            className={`filter-tab ${activeType === type ? 'active' : ''}`}
            onClick={() => handleTypeChange(type)}
          >
            {TYPE_LABELS[type].icon} {TYPE_LABELS[type].label} {counts[type]}
          </button>
        ) : null
      )}
    </div>
  );
}