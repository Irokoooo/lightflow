import React from 'react';
import { IFieldMeta } from '@lark-base-open/js-sdk';

interface SelectRendererProps {
  value: any;
  meta?: IFieldMeta;
}

// 飞书多维表格单/多选选项配色（按 color 序号取值），越界时循环取色
const OPTION_COLORS = [
  '#F53F3F',
  '#F77234',
  '#FF7D00',
  '#FCB400',
  '#9FDB1D',
  '#00B42A',
  '#14C9C9',
  '#206ECF',
  '#275AE0',
  '#6A3DE8',
  '#A61EAB',
  '#722ED1',
  '#EB0AA4',
  '#D91AD9',
  '#3491FA',
  '#0FC6C2',
  '#7BE188',
  '#FADC19',
  '#F7BA1E',
  '#F9925A',
];

const NEUTRAL_COLOR = '#86909C';

function getOptionColor(colorIndex?: number): string {
  if (colorIndex == null || Number.isNaN(colorIndex)) {
    return NEUTRAL_COLOR;
  }
  return OPTION_COLORS[((colorIndex % OPTION_COLORS.length) + OPTION_COLORS.length) % OPTION_COLORS.length];
}

function buildOptionColorMap(meta?: IFieldMeta) {
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  const options = (meta as any)?.property?.options || [];
  options.forEach((opt: any) => {
    if (opt == null || opt.color == null) return;
    if (opt.id != null) byId.set(String(opt.id), opt.color);
    const label = opt.name ?? opt.text;
    if (label) byName.set(String(label), opt.color);
  });
  return { byId, byName };
}

const SelectRenderer: React.FC<SelectRendererProps> = ({ value, meta }) => {
  if (value == null) {
    return <div className="renderer-empty">—</div>;
  }

  const options = Array.isArray(value) ? value : [value];
  if (options.length === 0) {
    return <div className="renderer-empty">—</div>;
  }

  const { byId, byName } = buildOptionColorMap(meta);

  return (
    <div className="renderer-select">
      {options.map((opt: any, idx: number) => {
        const label = typeof opt === 'string' ? opt : opt?.text || opt?.name || String(opt);
        const colorIndex =
          (opt?.id != null ? byId.get(String(opt.id)) : undefined) ??
          byName.get(String(label)) ??
          (typeof opt?.color === 'number' ? opt.color : undefined);
        const color = getOptionColor(colorIndex);
        return (
          <span
            key={opt?.id || `${label}-${idx}`}
            className="select-badge"
            style={{
              backgroundColor: `${color}1F`,
              color,
              borderColor: `${color}40`,
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
};

export default SelectRenderer;
