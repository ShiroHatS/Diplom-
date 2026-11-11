import DOMPurify from 'dompurify';

export function buildPreview(code, mode, language, reducedMotion, kind) {
  const card = language === 'ru' ? 'Карточка' : 'Card';
  const fixture = kind === 'spacing' ? `<article class="card"><h1>${card}</h1><p>${language === 'ru' ? 'Место для твоих стилей.' : 'A space for your styles.'}</p></article>`
    : kind === 'flex' ? `<div class="cards">${[1, 2, 3].map(number => `<article>${card} ${number}</article>`).join('')}</div>`
    : `<h1>${language === 'ru' ? 'Моя страница' : 'My page'}</h1><p>${language === 'ru' ? 'Это пример абзаца для твоих стилей.' : 'A sample paragraph for your styles.'}</p>`;
  const html = mode === 'css'
    ? fixture
    : DOMPurify.sanitize(code, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'span', 'div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'br', 'hr', 'pre', 'code', 'button', 'label', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'style'],
      ALLOWED_ATTR: ['id', 'class', 'style', 'title', 'type', 'disabled', 'for', 'value', 'placeholder', 'role', 'lang', 'dir', 'scope'],
      ALLOW_DATA_ATTR: false,
    });
  // Экранируем только закрывающий тег: знак < нужен современным медиазапросам.
  const css = mode === 'css' ? code.replace(/<\/style/gi, match => match.replace('/', '\\/')) : '';
  const motion = reducedMotion ? '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }' : '';
  const fixtureStyle = kind === 'flex' ? '.cards > article { box-sizing: border-box; flex: 0 0 6rem; padding: .75rem; border: 1px solid #78849a; background: #edf1fa; }' : '';
  return `<!doctype html><html lang="${language}"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body { font: 16px/1.6 system-ui, sans-serif; color: #202634; background: #fff; padding: 16px; overflow-wrap: anywhere; } ${fixtureStyle} ${css}\n${motion}</style></head><body>${html}</body></html>`;
}
