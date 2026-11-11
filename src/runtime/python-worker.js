// Файл исполняется в изолированном Worker. В основной странице Python не запускается.
const send = self.postMessage.bind(self);
self.onmessage = async ({ data }) => {
  let initialized = false;
  let characters = 0;
  let lines = 0;
  function write(text) {
    if (lines >= 100 || characters >= 12000) return;
    text = String(text).slice(0, 12000 - characters);
    characters += text.length;
    lines++;
    send({ type: 'output', text });
  }
  try {
    const { loadPyodide } = await import(data.runtimeURL + 'pyodide.mjs');
    const python = await loadPyodide({
      indexURL: data.runtimeURL, stdout: write, stderr: write,
      stdin: () => null, jsglobals: Object.create(null),
    });
    initialized = true;
    send({ type: 'running' });
    if (Number.isInteger(data.assessment) && data.assessment >= 0 && data.assessment <= 2) {
      // AST и повторные запуски остаются внутри того же изолированного Worker.
      python.globals.set('_lumo_student_code', data.code);
      python.globals.set('_lumo_lesson', data.assessment);
      const assessment = JSON.parse(python.runPython(data.assessmentSource));
      send({ type: 'done', assessment });
      return;
    }
    const result = python.runPython(data.code, { filename: '<student>' });
    result?.destroy?.();
    send({ type: 'done', truncated: lines >= 100 || characters >= 12000 });
  } catch (error) {
    const message = String(error?.message || error);
    if (!initialized) { send({ type: 'load-error', message }); return; }
    const line = [...message.matchAll(/File "<student>", line (\d+)/g)].at(-1)?.[1];
    const name = message.match(/\b(SyntaxError|IndentationError|TabError|NameError|TypeError|ValueError|ZeroDivisionError|EOFError|ModuleNotFoundError|ImportError|RuntimeError)\b/)?.[1] || 'Error';
    send({ type: 'error', name, message, line: Number(line) || null });
  }
};
