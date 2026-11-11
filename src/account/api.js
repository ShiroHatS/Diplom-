const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function api(path, { method = 'GET', data, signal, accountId } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${base}/api${path}`, {
      method, credentials: 'include', signal: controller.signal,
      headers: {
        ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-Lumo-Request': '1' } : {}),
        ...(accountId ? { 'X-Lumo-Account': accountId } : {}),
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'SERVER_ERROR'), { code: result.error || 'SERVER_ERROR', status: response.status, data: result });
    return result;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error.code) throw error;
    throw Object.assign(new Error('NETWORK'), { code: 'NETWORK' });
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
