import javascriptSource from './javascript-worker.js?raw';
import pythonSource from './python-worker.js?raw';
import bridgeSource from './sandbox-bridge.js?raw';
import pythonAssessment from '../assessment/python-assessment.py?raw';
import { parse } from 'acorn';
import { curriculum } from '../../shared/curriculum.js';

const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

export function executeCode(language, code, onEvent, options = {}) {
  const runtimeURL = new URL('./runtime/python/', document.baseURI).href;
  const frame = document.createElement('iframe');
  frame.className = 'runner-frame';
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.title = 'Isolated code runner';
  const resources = language === 'python' ? runtimeURL : '';
  const policy = `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' data: ${resources}; worker-src data: ${resources}; connect-src ${resources || "'none'"}; base-uri 'none'; form-action 'none';`;
  frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><script>${bridgeSource}</script>`;
  const marker = '// __STUDENT_CODE__';
  const prefixLines = javascriptSource.slice(0, javascriptSource.indexOf(marker)).split('\n').length - 1;
  // Имя для чтения значения задаёт только наш проверяющий код, а не пользовательский ввод.
  const inspect = ['name', 'age'].includes(options.inspect) ? options.inspect : null;
  const studentSource = code + (inspect ? `\nreturn ['string', 'number'].includes(typeof ${inspect}) ? ${inspect} : null;` : '');
  const source = language === 'python' ? pythonSource : javascriptSource.replace(marker, () => studentSource);
  if (language === 'javascript') {
    // Разбираем синтаксис, но никогда не исполняем пользовательский JavaScript в странице.
    try { parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
    catch (error) {
      onEvent({ type: 'error', name: 'SyntaxError', message: String(error.message).replace(/ \(\d+:\d+\)$/, ''), line: Math.min(code.split('\n').length, Math.max(1, (error.loc?.line || 1) - prefixLines)) });
      return () => {};
    }
  }
  let finished = false;
  let outputCount = 0;
  let outputLength = 0;
  let timeout;

  function dispose() {
    finished = true;
    clearTimeout(timeout);
    window.removeEventListener('message', receive);
    frame.contentWindow?.postMessage({ type: 'stop' }, '*');
    frame.remove();
  }
  function finish(event) { if (!finished) { dispose(); onEvent(event); } }
  function receive(event) {
    if (finished || event.source !== frame.contentWindow || event.origin !== 'null') return;
    const message = event.data;
    if (message?.type === 'ready') {
      frame.contentWindow.postMessage({ type: 'start', language, code, runtimeURL, source, prefixLines, assessment: options.assessment, assessmentCount: curriculum.python.length, assessmentSource: pythonAssessment }, '*');
    } else if (message?.type === 'running') {
      clearTimeout(timeout);
      // Это защита вкладки от бесконечного цикла, не ограничение времени на задание.
      timeout = setTimeout(() => finish({ type: 'timeout' }), 5000);
      onEvent({ type: 'running' });
    } else if (message?.type === 'output' && typeof message.text === 'string') {
      if (outputCount++ < 100 && outputLength < 12000) {
        const text = message.text.slice(0, 12000 - outputLength);
        outputLength += text.length;
        onEvent({ type: 'output', text, hasText: Boolean(message.hasText) });
      }
    } else if (message?.type === 'done' || message?.type === 'error' || message?.type === 'load-error') {
      finish({ ...message, truncated: Boolean(message.truncated) || outputCount >= 100 || outputLength >= 12000 });
    }
  }
  window.addEventListener('message', receive);
  timeout = setTimeout(() => finish({ type: 'load-error' }), 45000);
  document.body.append(frame);
  return () => { if (!finished) dispose(); };
}
