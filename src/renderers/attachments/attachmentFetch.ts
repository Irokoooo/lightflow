import { bitable } from '@lark-base-open/js-sdk';

interface AttachmentFetchParams {
  url: string;
  token?: string;
  tableId?: string;
  fieldId?: string;
  recordId?: string;
}

async function tryFetchBlob(url: string): Promise<Blob> {
  const attempts: Array<RequestInit> = [
    { credentials: 'include', cache: 'no-store' },
    { credentials: 'omit', cache: 'no-store' },
  ];

  let lastError: unknown = null;
  for (const init of attempts) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.blob();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('fetch failed');
}

async function resolveFreshUrl(params: AttachmentFetchParams): Promise<string> {
  const { token, tableId, fieldId, recordId, url } = params;
  if (!token || !tableId || !fieldId || !recordId) {
    return url;
  }

  try {
    const table = await bitable.base.getTableById(tableId);
    const urlList = await table.getCellAttachmentUrls([token], fieldId, recordId);
    return urlList?.[0] || url;
  } catch {
    return url;
  }
}

export async function fetchAttachmentBlob(params: AttachmentFetchParams): Promise<Blob> {
  const urls = [params.url];
  const freshUrl = await resolveFreshUrl(params);
  if (freshUrl && freshUrl !== params.url) {
    urls.push(freshUrl);
  }

  let lastError: unknown = null;
  for (const url of urls.filter(Boolean)) {
    try {
      return await tryFetchBlob(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('fetch failed');
}

export async function fetchAttachmentText(params: AttachmentFetchParams): Promise<string> {
  const blob = await fetchAttachmentBlob(params);
  return await blob.text();
}
