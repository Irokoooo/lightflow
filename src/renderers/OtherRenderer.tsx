import React from 'react';

interface OtherRendererProps {
  value: any;
}

const OtherRenderer: React.FC<OtherRendererProps> = ({ value }) => {
  if (value == null) {
    return <div className="renderer-empty">—</div>;
  }
  let display = '';
  if (typeof value === 'boolean') {
    display = value ? '✅' : '⬜';
  } else if (typeof value === 'string') {
    display = value;
  } else if (typeof value === 'object') {
    display = JSON.stringify(value);
  } else {
    display = String(value);
  }
  return <div className="renderer-other">{display || '—'}</div>;
};

export default OtherRenderer;
