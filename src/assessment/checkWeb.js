import { buildPreview } from '../runtime/preview.js';

// Здесь разрешён доступ родителя к документу, но выполнение любых скриптов запрещено.
// CSS и HTML остаются в рамке; они не применяются к интерфейсу платформы.
function probe(code, mode, width, rootSize, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const frame = document.createElement('iframe');
    frame.className = 'assessment-probe';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.title = 'Assignment measurement';
    frame.tabIndex = -1;
    frame.inert = true;
    frame.style.width = `${width}px`;
    let timeout;
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); frame.remove(); };
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    frame.onload = () => {
      try {
        const doc = frame.contentDocument;
        const view = frame.contentWindow;
        const headings = [...doc.querySelectorAll('h1')];
        const paragraphs = [...doc.querySelectorAll('p')];
        const visibleHeading = headings.some(heading => {
          const bounds = heading.getBoundingClientRect();
          for (let element = heading; element; element = element.parentElement) {
            const style = view.getComputedStyle(element);
            if (style.visibility !== 'visible' || Number(style.opacity) === 0 || element.getAttribute('aria-hidden') === 'true') return false;
          }
          return Boolean(heading.innerText.trim() && bounds.width > 0 && bounds.height > 0);
        });
        const rules = [];
        function collect(list) {
          for (const rule of list) { rules.push(rule); if (rule.cssRules) collect(rule.cssRules); }
        }
        for (const sheet of doc.styleSheets) collect(sheet.cssRules);
        const result = {
          heading: headings.length > 0, visibleHeading,
          colours: paragraphs.map(p => view.getComputedStyle(p).color),
          sizes: paragraphs.map(p => parseFloat(view.getComputedStyle(p).fontSize)),
          media: rules.some(rule => rule.type === CSSRule.MEDIA_RULE && /width/i.test(rule.conditionText)),
        };
        cleanup(); resolve(result);
      } catch { cleanup(); reject({ type: 'load-error' }); }
    };
    signal.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => { cleanup(); reject({ type: 'load-error' }); }, 10000);
    let html = buildPreview(code, mode, 'en', true);
    if (mode === 'css') {
      // Разные абзацы исключают случайное попадание только в первый элемент.
      html = html.replace('</body>', '<section><p>Another paragraph</p></section></body>');
      html = html.replace('<style>', `<style>html { font-size: ${rootSize}px; } p { font-size: 1.25rem; } `);
    }
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

export async function checkWeb(code, index, signal) {
  if (index === 0) {
    const result = await probe(code, 'html', 600, 16, signal);
    return [{ id: 'heading', passed: result.heading }, { id: 'headingText', passed: result.visibleHeading }];
  }
  if (index === 1) {
    const result = await probe(code, 'css', 600, 16, signal);
    return [{ id: 'paragraphColour', passed: result.colours.length > 0 && result.colours.every(colour => colour === 'rgb(40, 80, 200)') }];
  }
  const narrow = await probe(code, 'css', 360, 16, signal);
  const boundary = await probe(code, 'css', 600, 16, signal);
  const wide = await probe(code, 'css', 601, 16, signal);
  const scaled = await probe(code, 'css', 360, 20, signal);
  const sized = (result, expected) => result.sizes.length > 0 && result.sizes.every(size => Math.abs(size - expected) < .01);
  return [
    { id: 'mediaQuery', passed: narrow.media },
    { id: 'narrowSize', passed: sized(narrow, 16) && sized(boundary, 16) },
    { id: 'wideSize', passed: sized(wide, 20) },
    { id: 'relativeSize', passed: sized(scaled, 20) },
  ];
}
