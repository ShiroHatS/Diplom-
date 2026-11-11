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
    elif lesson == 2:
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
    elif lesson == 3:
        price, count, total = assignment('price'), assignment('count'), assignment('total')
        add('costValues', price is not None and count is not None and type(namespace.get('price')) in (int, float) and type(namespace.get('count')) in (int, float) and namespace['price'] == 12 and namespace['count'] == 3)
        add('costExpression', total is not None and references(total.value, 'price') and references(total.value, 'count') and any(isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult) for node in ast.walk(total.value)))
        add('costOutput', any(any(references(arg, 'total') for arg in call.args) for call in calls) and output.text.strip() == '36' and not output.truncated)
        changed = False
        if price is not None and count is not None:
            variant = copy.deepcopy(tree)
            for original, value in ((price, 5), (count, 4)):
                variant.body[tree.body.index(original)].value = ast.copy_location(ast.Constant(value=value), original.value)
            _, trial = run(ast.fix_missing_locations(variant))
            changed = trial.text.strip() == '20' and not trial.truncated
        add('costChanges', changed)
    elif lesson == 4:
        loops = [node for node in ast.walk(tree) if isinstance(node, ast.For) and isinstance(node.target, ast.Name) and isinstance(node.iter, ast.Call) and isinstance(node.iter.func, ast.Name) and node.iter.func.id == 'range' and len(node.iter.args) == 2]
        loop = next((node for node in loops if any(is_print(child) and any(references(arg, node.target.id) for arg in child.args) for statement in node.body for child in ast.walk(statement))), None)
        add('loopUsed', loop is not None)
        add('loopOutput', output.text.strip().splitlines() == ['1', '2', '3'] and not output.truncated)
        changed = False
        if loop is not None:
            variant = copy.deepcopy(tree)
            cloned = next(node for node in ast.walk(variant) if isinstance(node, ast.For) and node.lineno == loop.lineno and node.col_offset == loop.col_offset)
            cloned.iter.args[1] = ast.copy_location(ast.Constant(value=5), cloned.iter.args[1])
            _, trial = run(ast.fix_missing_locations(variant))
            changed = trial.text.strip().splitlines() == ['1', '2', '3', '4'] and not trial.truncated
        add('loopChanges', changed)
    elif lesson == 5:
        function = next((node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'double'), None)
        add('functionDefined', function is not None and len(function.args.args) == 1)
        add('functionOutput', output.text.strip() == '10' and not output.truncated and any(any(isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == 'double' for child in ast.walk(call)) for call in calls))
        correct = callable(namespace.get('double'))
        if correct:
            try:
                with contextlib.redirect_stdout(Output()), contextlib.redirect_stderr(Output()):
                    correct = all(type(result := namespace['double'](value)) in (int, float) and result == value * 2 for value in (0, 3, -2))
            except Exception:
                correct = False
        add('functionValues', correct)
    return json.dumps(checks)


_lumo_assess(_lumo_student_code, _lumo_lesson)
