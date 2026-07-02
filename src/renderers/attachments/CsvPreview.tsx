import React, { useEffect, useMemo, useState } from 'react';
import { fetchAttachmentText } from './attachmentFetch';

interface CsvPreviewProps {
  url: string;
  name: string;
  token?: string;
  tableId?: string;
  fieldId?: string;
  recordId?: string;
}

function detectDelimiter(text: string): string {
  const sample = text.replace(/\uFEFF/g, '').split(/\r?\n/).slice(0, 6).join('\n');
  const candidates = [',', ';', '\t', '|'];

  const scores = candidates.map((delimiter) => {
    const counts = sample
      .split('\n')
      .map((line) => {
        let inQuotes = false;
        let count = 0;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const next = line[i + 1];
          if (char === '"') {
            if (inQuotes && next === '"') {
              i++;
            } else {
              inQuotes = !inQuotes;
            }
            continue;
          }
          if (!inQuotes && char === delimiter) {
            count += 1;
          }
        }
        return count;
      })
      .filter((count) => count > 0);

    if (counts.length === 0) {
      return { delimiter, score: 0 };
    }

    const total = counts.reduce((sum, count) => sum + count, 0);
    return { delimiter, score: total + counts.length * 2 };
  });

  return scores.sort((a, b) => b.score - a.score)[0]?.delimiter || ',';
}

function parseCsv(text: string): string[][] {
  const normalizedText = text.replace(/\uFEFF/g, '');
  const delimiter = detectDelimiter(normalizedText);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText[i];
    const next = normalizedText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cellValue) => cellValue !== ''));
}

const CsvPreview: React.FC<CsvPreviewProps> = ({ url, name, token, tableId, fieldId, recordId }) => {
  const [expanded, setExpanded] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    let cancelled = false;
    const loadCsv = async () => {
      try {
        setLoading(true);
        setError(null);
        const text = await fetchAttachmentText({ url, token, tableId, fieldId, recordId });
        if (!cancelled) {
          setCsvText(text);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'CSV 预览加载失败');
          setCsvText('');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCsv();
    return () => {
      cancelled = true;
    };
  }, [expanded, fieldId, name, recordId, tableId, token, url]);

  const rows = useMemo(() => parseCsv(csvText), [csvText]);
  const maxColumnCount = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.length), 0),
    [rows]
  );
  const headers = useMemo(() => {
    const firstRow = rows[0] || [];
    return Array.from({ length: maxColumnCount }, (_, index) => firstRow[index] || `列 ${index + 1}`);
  }, [maxColumnCount, rows]);
  const bodyRows = rows.slice(1);

  return (
    <div className={`csv-preview-container ${expanded ? 'expanded' : ''}`}>
      <div
        className="attachment-preview-fallback"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <span className="fallback-icon">📗</span>
        <span className="fallback-name">{name}</span>
      </div>

      {expanded && (
        <div className="doc-expanded-view">
          <div className="doc-expanded-header">
            <span className="doc-expanded-icon">📗</span>
            <span className="doc-expanded-name">{name}</span>
            <button className="doc-expanded-close" onClick={(e) => { e.stopPropagation(); setExpanded(false); }}>✕</button>
          </div>
          <div className="doc-expanded-body">
            {loading && <div className="pdf-loading">正在读取 CSV...</div>}
            {!loading && error && <div className="inline-edit-error">{error}</div>}
            {!loading && !error && rows.length === 0 && <div className="pdf-loading">CSV 内容为空</div>}
            {!loading && !error && rows.length > 0 && (
              <div className="csv-table-wrapper">
                <table className="csv-table">
                  <thead>
                    <tr>
                      {headers.map((header, index) => (
                        <th key={`header-${index}`}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bodyRows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`}>
                        {headers.map((_, colIndex) => (
                          <td key={`cell-${rowIndex}-${colIndex}`}>{row[colIndex] || ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CsvPreview;
