import glob
import re

def check_brackets(content):
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    i = 0
    line = 1
    col = 1
    length = len(content)
    
    # State flags
    in_str = None
    in_regex = False
    in_line_comment = False
    in_block_comment = False
    escaped = False
    last_token = None
    
    # Tokens after which a '/' can start a RegExp literal (not division)
    regex_prefixes = {'(', ',', '=', ':', '[', '!', '&', '|', '?', ';', '{', '}', 'return', 'typeof'}
    
    while i < length:
        c = content[i]
        
        if c == '\n':
            line += 1
            col = 1
            in_line_comment = False
            if in_regex: # Regex cannot cross line breaks
                in_regex = False
            i += 1
            continue
            
        col += 1
        
        if in_line_comment:
            i += 1
            continue
            
        if in_block_comment:
            if c == '*' and i + 1 < length and content[i+1] == '/':
                in_block_comment = False
                i += 2
                col += 1
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
                last_token = 'str'
            i += 1
            continue

        if in_regex:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == '[':
                # Character class inside regex (e.g. [/])
                # Skip to closing ]
                pass
            elif c == '/':
                in_regex = False
                last_token = 'regex'
            i += 1
            continue
            
        # Check start of comment
        if c == '/' and i + 1 < length:
            if content[i+1] == '/':
                in_line_comment = True
                i += 2
                col += 1
                continue
            elif content[i+1] == '*':
                in_block_comment = True
                i += 2
                col += 1
                continue

        # Check start of regex
        if c == '/':
            if last_token in regex_prefixes or last_token is None:
                in_regex = True
                escaped = False
                i += 1
                continue

        # Check start of string
        if c in ("'", '"', '`'):
            in_str = c
            escaped = False
            i += 1
            continue

        if not c.isspace():
            if c in '({[':
                stack.append((c, line, col))
                last_token = c
            elif c in ')}]':
                if not stack:
                    return f'Error: cierre inesperado {c} en L{line}:{col}'
                top, tl, tc = stack.pop()
                if pairs[c] != top:
                    return f'Error: desbalance: esperado cierre para {top} (L{tl}:{tc}), pero se encontro {c} en L{line}:{col}'
                last_token = c
            else:
                last_token = c
        i += 1
        
    if stack:
        top, tl, tc = stack[-1]
        return f'Error: {top} sin cerrar abierto en L{tl}:{tc}'
    return 'SINTAXIS CORRECTA'

if __name__ == '__main__':
    for f in sorted(glob.glob('backend/public/js/*.js')):
        with open(f, 'r', encoding='utf-8') as js:
            res = check_brackets(js.read())
            print(f'{f}: {res}')
