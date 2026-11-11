// Этот исходник запускается только как Worker с непрозрачным origin в sandbox-рамке.
const send = self.postMessage.bind(self);
let characters = 0;
let lines = 0;
function write(...args) {
  if (lines >= 100 || characters >= 12000) return;
  const text = args.map(value => typeof value === 'string' ? value : String(value)).join(' ').slice(0, 12000 - characters);
  characters += text.length;
  lines++;
  send({ type: 'output', text, hasText: args.some(value => typeof value === 'string' && value.trim().length > 0) });
}
console.log = write;
console.info = write;
console.warn = write;
console.error = write;
send({ type: 'running' });
;(async () => {
// __STUDENT_CODE__
})().then(inspected => send({ type: 'done', inspected: typeof inspected === 'string' ? inspected.slice(0, 2000) : typeof inspected === 'number' ? inspected : null, truncated: lines >= 100 || characters >= 12000 })).catch(error => {
  send({ type: 'error', name: String(error?.name || 'Error'), message: String(error?.message || error), stack: String(error?.stack || '') });
});
