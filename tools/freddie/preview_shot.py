from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b=pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    p=b.new_page(viewport={'width':1200,'height':900})
    p.on('console',lambda m:print('console',m.text))
    p.goto('http://localhost:8765/web/index.html')
    p.wait_for_function('window.INFO',timeout=60000)
    print(p.evaluate('window.INFO'))
    p.locator('canvas').screenshot(path='/workspace/kickole/out/preview.png')
    b.close()
