import json, re, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(root, p), encoding='utf8').read()
lib = rd('src/lib.glsl')
scenes = {n: rd(f'shaders/{n}.glsl') for n in ['void', 'nebula', 'station', 'angel', 'tunnel']}
js = '\n'.join([
  'const SHADER_LIB = ' + json.dumps(lib) + ';',
  'const SHADERS = ' + json.dumps(scenes) + ';',
  rd('src/render.js'), rd('src/sprites.js'), rd('src/music.js'), rd('src/main.js')])
assert '</script' not in js
html = rd('src/index.html').replace('<!--SCRIPTS-->', '<script>\n' + js + '\n</script>')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'dist', 'neon-rust-requiem.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf8').write(html)
print(out, len(html), 'bytes')
