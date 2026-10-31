import glob

def check_brackets(content):
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    in_str = None
    in_line_comment = False
    in_block_comment = False
    escaped = False
    i = 0
    line = 1
    col = 1
    
    while i < len(content):
        c = content[i]
        col += 1
        if c == '\n':
            line += 1
            col = 1
            in_line_comment = False
            
        if in_line_comment:
            i += 1
            continue
            
        if in_block_comment:
            if c == '*' and i + 1 < len(content) and content[i+1] == '/':
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue
            
        if in_str:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == in_str:
                in_str = None
            i += 1
            continue
            
        # Check start of comment
        if c == '/' and i + 1 < len(content):
            if content[i+1] == '/':
                in_line_comment = True
                i += 2
                continue
            elif content[i+1] == '*':
                in_block_comment = True
                i += 2
                continue
                
        # Check start of string
        if c in ("'", '"', '`'):
            in_str = c
            escaped = False
            i += 1
            continue
            
        if c in '({[':
            stack.append((c, line, col))
        elif c in ')}]':
            if not stack:
                return f'Error: cierre inesperado {c} en L{line}:{col}'
            top, tl, tc = stack.pop()
            if pairs[c] != top:
                return f'Error: desbalance: esperado cierre para {top} (L{tl}:{tc}), pero se encontro {c} en L{line}:{col}'
        i += 1
        
    if stack:
        top, tl, tc = stack[-1]
        return f'Error: {top} sin cerrar abierto en L{tl}:{tc}'
    return 'SINTAXIS CORRECTA'

for f in sorted(glob.glob('backend/public/js/*.js')):
    with open(f, 'r', encoding='utf-8') as js:
        res = check_brackets(js.read())
        print(f'{f}: {res}')

