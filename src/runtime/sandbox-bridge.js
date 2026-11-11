// Только эта доверенная рамка общается с родительской страницей.
let worker;
let started = false;
let prefixLines = 0;
let messages = 0;
let running = false;
const notify = data => parent.postMessage(data, '*');
addEventListener('message', event => {
  if (event.source !== parent) return;
  const data = event.data;
  if (data?.type === 'stop') { worker?.terminate(); return; }
  if (data?.type !== 'start' || started) return;
  started = true;
  prefixLines = data.prefixLines || 0;
  try {
    const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(data.source);
    worker = new Worker(url, { type: 'module', credentials: 'omit' });
    worker.onmessage = ({ data: message }) => {
      // Даже если код ученика вызывает postMessage сам, поток сообщений ограничен.
      if (++messages > 250) { worker.terminate(); notify({ type: 'error', name: 'RuntimeError', message: 'Message limit reached.' }); return; }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'output') notify({ type: 'output', text: String(message.text).slice(0, 12000), hasText: Boolean(message.hasText) });
      if (message.type === 'running' && !running) { running = true; notify({ type: 'running' }); }
      if (message.type === 'done') {
        const assessment = Array.isArray(message.assessment) ? message.assessment.slice(0, 10).map(check => ({ id: String(check.id).slice(0, 60), passed: Boolean(check.passed) })) : undefined;
        notify({ type: 'done', truncated: Boolean(message.truncated), inspected: ['string', 'number'].includes(typeof message.inspected) ? message.inspected : null, assessment });
        worker.terminate();
      }
      if (message.type === 'load-error') { notify({ type: 'load-error' }); worker.terminate(); }
      if (message.type === 'error') {
        const stackLine = String(message.stack || '').match(/:(\d+):\d+\)?(?:\n|$)/)?.[1];
        notify({ type: 'error', name: String(message.name || 'Error').slice(0, 80), message: String(message.message || '').slice(0, 4000), line: message.line || (stackLine ? Math.max(1, Number(stackLine) - prefixLines) : null) });
        worker.terminate();
      }
    };
    worker.onerror = event => {
      event.preventDefault();
      notify({ type: 'error', name: event.lineno ? 'SyntaxError' : 'RuntimeError', message: event.message || 'Worker could not start.', line: event.lineno ? Math.max(1, event.lineno - prefixLines) : null });
      worker.terminate();
    };
    if (data.language === 'python') worker.postMessage({ code: data.code, runtimeURL: data.runtimeURL, assessment: data.assessment, assessmentSource: data.assessmentSource });
  } catch (error) { notify({ type: 'error', name: 'RuntimeError', message: String(error) }); }
});
notify({ type: 'ready' });
