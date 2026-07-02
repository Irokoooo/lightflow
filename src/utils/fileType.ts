export type FileType = 'image' | 'document' | 'pdf' | 'video' | 'audio' | 'code' | 'csv' | 'archive' | 'other';

export const TYPE_LABELS: Record<FileType, { icon: string; label: string }> = {
  image: { icon: '🖼️', label: '图片' },
  document: { icon: '📄', label: '文档' },
  pdf: { icon: '📕', label: 'PDF' },
  video: { icon: '🎬', label: '视频' },
  audio: { icon: '🎵', label: '音频' },
  code: { icon: '📝', label: '代码' },
  csv: { icon: '📗', label: 'CSV' },
  archive: { icon: '📦', label: '压缩包' },
  other: { icon: '📎', label: '其他' }
};

export function detectFileType(att: any): FileType {
  if (!att || typeof att !== 'object') return 'other';
  
  const mime = (att.type || att.mime_type || '').toLowerCase();
  const name = (att.name || '').toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('csv') || name.endsWith('.csv')) return 'csv';

  if (mime.includes('word') || mime.includes('document') ||
      name.endsWith('.doc') || name.endsWith('.docx')) return 'document';
  if (mime.includes('spreadsheet') || mime.includes('excel') ||
      name.endsWith('.xls') || name.endsWith('.xlsx')) return 'document';
  if (mime.includes('presentation') || mime.includes('powerpoint') ||
      name.endsWith('.ppt') || name.endsWith('.pptx')) return 'document';
  if (att.is_external || att.url?.includes('feishu.cn/docx') ||
      att.url?.includes('larksuite.com/docx')) return 'document';

  if (/\.(js|ts|tsx|jsx|py|java|go|rs|c|cpp|cs|rb|php|swift|kt|md|json|yaml|yml|xml|html|css|sh|sql)$/.test(name)) return 'code';

  if (/\.(zip|rar|7z|tar|gz|bz2)$/.test(name)) return 'archive';

  return 'other';
}
