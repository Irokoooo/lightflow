import React from 'react';

interface DateRendererProps {
  value: any;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
  if (hasTime) {
    return `${y}-${m}-${d} ${h}:${min}`;
  }
  return `${y}-${m}-${d}`;
}

const DateRenderer: React.FC<DateRendererProps> = ({ value }) => {
  if (value == null) {
    return <div className="renderer-empty">—</div>;
  }
  const timestamp = typeof value === 'number' ? value : Number(value);
  if (isNaN(timestamp) || timestamp === 0) {
    return <div className="renderer-empty">—</div>;
  }
  return (
    <div className="renderer-date">
      {formatDate(timestamp)}
    </div>
  );
};

export default DateRenderer;
