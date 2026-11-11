import { useEffect, useMemo, useRef, useState } from 'react';
import { executeCode } from './runtime/execute.js';
import { buildPreview } from './runtime/preview.js';
import { editorText } from './editorText.js';

export default function CodeEditor({ value, onChange, mode, language, reduceMotion, previewKind, onCheck }) {
  const t = editorText[language];
  const input = useRef(null);
  const gutter = useRef(null);
  const cancel = useRef(null);
  const [status, setStatus] = useState('ready');
  const [output, setOutput] = useState('');
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [width, setWidth] = useState('full');
  const [systemMotion, setSystemMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const web = mode === 'html' || mode === 'css';
  // Показываем последний запущенный код; язык и уменьшение движения применяются сразу.
  const preview = useMemo(() => web && snapshot !== null
    ? buildPreview(snapshot, mode, language, reduceMotion || systemMotion, previewKind) : '',
  [web, snapshot, mode, language, reduceMotion, systemMotion, previewKind]);
  const busy = status === 'loading' || status === 'running';
  const stale = snapshot !== null && snapshot !== value;
  const blankOutput = status === 'done' && output.length > 0 && !output.trim();
  const filenames = { python: 'main.py', javascript: 'script.js', html: 'index.html', css: 'styles.css' };

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemMotion(query.matches);
    query.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); cancel.current?.(); };
  }, []);

  function run() {
    cancel.current?.();
    setError(null);
    setOutput('');
    setTruncated(false);
    setSnapshot(value);
    onChange(value);
    if (web) {
      setStatus('previewDone');
      return;
    }
    setStatus(mode === 'python' ? 'loading' : 'running');
    cancel.current = executeCode(mode, value, event => {
      if (event.type === 'output') setOutput(current => current + event.text + '\n');
      else if (event.type === 'running') setStatus('running');
      else if (event.type === 'error') {
        setError({ ...event, line: Number.isInteger(event.line) && event.line > 0 && event.line <= value.split('\n').length ? event.line : null });
        setStatus('failed');
      } else if (event.type === 'load-error') setStatus('loadError');
      else { setStatus(event.type); setTruncated(Boolean(event.truncated)); }
    });
  }

  function stop() { cancel.current?.(); setStatus('stopped'); }

  function indent() {
    const element = input.current;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (value.length - (end - start) + 4 > 2000) return;
    onChange(value.slice(0, start) + '    ' + value.slice(end));
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(start + 4, start + 4); });
  }

  function goToError() {
    const lines = value.split('\n');
    const start = lines.slice(0, error.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
    input.current.focus();
    input.current.setSelectionRange(start, start + lines[error.line - 1].length);
    input.current.scrollTop = (error.line - 2) * parseFloat(getComputedStyle(input.current).lineHeight);
  }

  return <div className="code-editor">
    <div className="editor-title"><label htmlFor="practice-answer">{t.label}</label><span>{filenames[mode]}</span></div>
    <p id="practice-help" className="lesson-help">{t.help}</p>
    <div className={`editor-input${error && !stale ? ' has-error' : ''}`}>
      <pre className="editor-gutter" aria-hidden="true" ref={gutter}>{value.split('\n').map((_, index) => <span className={!stale && error?.line === index + 1 ? 'error-line' : ''} key={index}>{!stale && error?.line === index + 1 ? '!' : index + 1}{'\n'}</span>)}</pre>
      {/* Нативное поле сохраняет привычное чтение, выделение, копирование и выход по Tab. */}
      <textarea id="practice-answer" ref={input} value={value} onChange={event => onChange(event.target.value)} onScroll={event => { if (gutter.current) gutter.current.scrollTop = event.target.scrollTop; }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); } }} aria-keyshortcuts="Control+Enter Meta+Enter" aria-describedby={`practice-help${error && !stale ? ' editor-error' : ''}`} aria-invalid={error && !stale ? true : undefined} rows="8" maxLength="2000" spellCheck="false" autoCapitalize="off" autoComplete="off" wrap="off" />
    </div>
    {/* aria-disabled сохраняет фокус после остановки и завершения программы. */}
    <div className="editor-toolbar"><button className="editor-run" type="button" onClick={run}>{web ? t.preview : t.run}<span aria-hidden="true"> ▷</span></button>{!web && <button type="button" onClick={() => { if (busy) stop(); }} aria-disabled={!busy}>{t.stop}</button>}<button type="button" onClick={indent}>{t.indent}</button>{onCheck && <button type="button" onClick={onCheck}>{t.goCheck}</button>}</div>
    {/* Пустая строка — допустимый вывод; объясняем её текстом в области статуса. */}
    <p className="editor-status" role="status">{stale && !busy ? t.changed : `${t[status]}${blankOutput ? ` ${t.blankOutput}` : ''}`}</p>
    {onCheck && <p className="lesson-help">{t.checkHelp}</p>}
    {error && !stale && <div className="editor-error" id="editor-error"><p>{t.hints[error.name] || t.hints.Error}</p>{error.line && <button type="button" onClick={goToError}>{t.goLine} {error.line}</button>}<details><summary>{t.details}</summary><pre>{error.message}</pre></details></div>}
    {!web && <section className="editor-result" aria-labelledby="output-title"><h5 id="output-title">{t.output}</h5><pre tabIndex={0}>{output || (status === 'done' ? t.noOutput : '—')}</pre>{truncated && <p>{t.truncated}</p>}{mode === 'javascript' && <p className="lesson-help">{t.jsHelp}</p>}</section>}
    {web && <div className="web-preview"><p className="lesson-help">{t.previewHelp}</p><label className="preview-width">{t.width}<select value={width} onChange={event => setWidth(event.target.value)}><option value="full">{t.fullWidth}</option><option value="phone">{t.phoneWidth}</option></select></label>{preview && <iframe title={t.previewTitle} sandbox="" referrerPolicy="no-referrer" srcDoc={preview} style={{ maxWidth: width === 'phone' ? '360px' : '100%' }} />}</div>}
  </div>;
}
