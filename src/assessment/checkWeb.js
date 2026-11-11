import { buildPreview } from '../runtime/preview.js';

// Здесь разрешён доступ родителя к документу, но выполнение любых скриптов запрещено.
// CSS и HTML остаются в рамке; они не применяются к интерфейсу платформы.
function probe(code, mode, width, rootSize, signal, kind) {
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
        const visible = node => {
          const bounds = node.getBoundingClientRect();
          for (let element = node; element; element = element.parentElement) {
            const style = view.getComputedStyle(element);
            if (style.visibility !== 'visible' || Number(style.opacity) === 0 || element.getAttribute('aria-hidden') === 'true') return false;
          }
          return Boolean(node.innerText.trim() && bounds.width > 0 && bounds.height > 0);
        };
        const visibleHeading = headings.some(visible);
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
          paragraph: paragraphs.some(visible),
          list: [...doc.querySelectorAll('ul')].some(list => [...list.children].filter(node => node.tagName === 'LI' && visible(node)).length >= 2),
          cards: [...doc.querySelectorAll('.card')].map(node => {
            const style = view.getComputedStyle(node);
            return { visible: visible(node), padding: ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(style[`padding${side}`])),
              margin: ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(style[`margin${side}`])),
              borders: ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ width: parseFloat(style[`border${side}Width`]), style: style[`border${side}Style`] })) };
          }),
          containers: [...doc.querySelectorAll('.cards')].map(node => {
            const style = view.getComputedStyle(node);
            return { visible: visible(node), display: style.display, wrap: style.flexWrap, gaps: [parseFloat(style.rowGap), parseFloat(style.columnGap)] };
          }),
        };
        cleanup(); resolve(result);
      } catch { cleanup(); reject({ type: 'load-error' }); }
    };
    signal.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => { cleanup(); reject({ type: 'load-error' }); }, 10000);
    let html = buildPreview(code, mode, 'en', true, kind);
    if (mode === 'css') {
      // Разные абзацы исключают случайное попадание только в первый элемент.
      html = html.replace('</body>', '<section><p>Another paragraph</p></section></body>');
      html = html.replace('<style>', `<style>html { font-size: ${rootSize}px; } p { font-size: 1.25rem; } `);
      if (kind === 'spacing') html = html.replace('</body>', '<section><article class="card">Second card</article></section></body>');
      if (kind === 'flex') html = html.replace('</body>', '<section><div class="cards"><article>Another card</article><article>One more</article></div></section></body>');
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
  if (index === 3) {
    const result = await probe(code, 'html', 600, 16, signal);
    return [{ id: 'paragraphText', passed: result.paragraph }, { id: 'listItems', passed: result.list }];
  }
  if (index === 4 || index === 5) {
    const kind = index === 4 ? 'spacing' : 'flex';
    const normal = await probe(code, 'css', 320, 16, signal, kind);
    const scaled = await probe(code, 'css', 320, 20, signal, kind);
    const every = (items, check) => items.length > 0 && items.every(item => item.visible && check(item));
    const equal = (numbers, target) => numbers.every(number => Math.abs(number - target) < .01);
    if (index === 4) return [
      { id: 'cardSpacing', passed: every(normal.cards, card => equal(card.padding, 16) && equal(card.margin, 16)) },
      { id: 'cardBorder', passed: every(normal.cards, card => card.borders.every(border => border.width === 2 && border.style === 'solid')) },
      { id: 'cardRelative', passed: every(scaled.cards, card => equal(card.padding, 20) && equal(card.margin, 20)) },
    ];
    return [
      { id: 'flexLayout', passed: every(normal.containers, box => box.display === 'flex') },
      { id: 'flexGap', passed: every(normal.containers, box => equal(box.gaps, 16)) && every(scaled.containers, box => equal(box.gaps, 20)) },
      { id: 'flexWrap', passed: every(normal.containers, box => box.wrap === 'wrap') },
    ];
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
