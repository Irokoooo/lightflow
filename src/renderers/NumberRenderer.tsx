import React from 'react';

interface NumberRendererProps {
  value: any;
}

const NumberRenderer: React.FC<NumberRendererProps> = ({ value }) => {
  if (value == null) {
    return <div className="renderer-empty">—</div>;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) {
    return <div className="renderer-empty">—</div>;
  }
  return (
    <div className="renderer-number">
      {num.toLocaleString()}
    </div>
  );
};

export default NumberRenderer;
