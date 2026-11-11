# Учебная проверка выполняется в Pyodide, отдельно от страницы и её хранилища.
import ast
import builtins
import contextlib
import copy
import json


def _lumo_assess(code, lesson):
    tree = ast.parse(code, filename='<student>')

    def is_print(node):
        return isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'print'

    def references(node, name):
        return any(isinstance(child, ast.Name) and child.id == name for child in ast.walk(node))

    def assignment(name):
        for node in tree.body:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
            if any(isinstance(target, ast.Name) and target.id == name for target in targets) and node.value is not None:
                return node
        return None

    class Output:
        # Не накапливаем неограниченный вывод даже во время скрытых пробных запусков.
        def __init__(self):
            self.text = ''
            self.has_text = False
            self.truncated = False

        def write(self, value):
            room = 12000 - len(self.text)
            self.truncated = self.truncated or len(value) > room
            self.text += value[:room]
            return len(value)

        def flush(self):
            pass

    def run(program):
        output = Output()

        def display(*args, **kwargs):
            output.has_text = output.has_text or any(isinstance(arg, str) and arg.strip() for arg in args)
            builtins.print(*args, **kwargs)

        namespace = {'__name__': '__main__', 'print': display}
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            exec(compile(program, '<student>', 'exec'), namespace)
        return namespace, output

    namespace, output = run(tree)
    checks = []

    def add(key, value):
        checks.append({'id': key, 'passed': bool(value)})

    calls = [node for node in ast.walk(tree) if is_print(node)]
    if lesson == 0:
        add('textOutput', calls and output.has_text and output.text.strip() and not output.truncated)
    elif lesson == 1:
        name = namespace.get('name')
        add('nameStored', assignment('name') is not None and isinstance(name, str) and name.strip())
        add('nameUsed', any(any(references(arg, 'name') for arg in call.args) for call in calls))
        add('nameOutput', isinstance(name, str) and name.strip() and name.strip() in [line.strip() for line in output.text.splitlines()] and not output.truncated)
    else:
        initial = assignment('points')
        add('pointsSet', initial is not None and type(namespace.get('points')) in (int, float) and namespace['points'] == 7)
        add('pointsIf', any(isinstance(node, ast.If) and references(node.test, 'points') and any(is_print(child) for statement in node.body for child in ast.walk(statement)) for node in ast.walk(tree)))
        accepted = ('Ура!', 'Great!')
        add('initialMessage', output.text.strip() in accepted and not output.truncated)
        # Меняем только значение начального присваивания. Код условия остаётся ученическим.
        outcomes = {}
        if initial is not None:
            position = tree.body.index(initial)
            for value in (4, 5, 6):
                variant = copy.deepcopy(tree)
                variant.body[position].value = ast.copy_location(ast.Constant(value=value), initial.value)
                _, trial = run(ast.fix_missing_locations(variant))
                outcomes[value] = trial.text.strip() if not trial.truncated else None
        add('pointsBelow', outcomes.get(4) == '')
        add('pointsBoundary', outcomes.get(5) in accepted and outcomes.get(6) in accepted)
    return json.dumps(checks)


_lumo_assess(_lumo_student_code, _lumo_lesson)
