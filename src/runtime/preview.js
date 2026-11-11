import DOMPurify from 'dompurify';

export function buildPreview(code, mode, language, reducedMotion) {
  const html = mode === 'css'
    ? `<h1>${language === 'ru' ? 'Моя страница' : 'My page'}</h1><p>${language === 'ru' ? 'Это пример абзаца для твоих стилей.' : 'A sample paragraph for your styles.'}</p>`
    : DOMPurify.sanitize(code, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'span', 'div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'br', 'hr', 'pre', 'code', 'button', 'label', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'style'],
      ALLOWED_ATTR: ['id', 'class', 'style', 'title', 'type', 'disabled', 'for', 'value', 'placeholder', 'role', 'lang', 'dir', 'scope'],
      ALLOW_DATA_ATTR: false,
    });
  // Экранируем только закрывающий тег: знак < нужен современным медиазапросам.
  const css = mode === 'css' ? code.replace(/<\/style/gi, match => match.replace('/', '\\/')) : '';
  const motion = reducedMotion ? '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }' : '';
  return `<!doctype html><html lang="${language}"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body { font: 16px/1.6 system-ui, sans-serif; color: #202634; background: #fff; padding: 16px; overflow-wrap: anywhere; } ${css}\n${motion}</style></head><body>${html}</body></html>`;
}
