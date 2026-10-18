import sys,json,urllib.parse
from playwright.sync_api import sync_playwright
shots=json.load(open(sys.argv[1]))
with sync_playwright() as pw:
    b=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    p=b.new_page(viewport={'width':800,'height':1000})
    p.on('console',lambda m:print('console',m.text))
    for name,q in shots.items():
        p.goto('http://localhost:8765/web/v2.html?'+urllib.parse.urlencode(q))
        p.wait_for_function('window.INFO',timeout=60000)
        p.locator('canvas').screenshot(path=f'/workspace/kickole/blender/shot_{name}.png')
    b.close()
