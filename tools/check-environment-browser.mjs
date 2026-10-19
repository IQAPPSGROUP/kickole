// npm install --prefix .validation --no-save playwright-core
// CHROMIUM=/path/to/chrome URL=http://127.0.0.1:5189 node tools/check-environment-browser.mjs [gallery|game]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../.validation/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const beach=process.env.THEME==='beach';
const theme=beach?'beach':'environment';
const out=new URL(beach?'../beach-shots/':'../environment-shots/',import.meta.url); mkdirSync(out,{recursive:true});
const url=process.env.URL??'http://127.0.0.1:5189';
const gameUrl=beach?`${url}/?environment=beach`:url;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const reports=[];
async function checkSwitch(){
  const switching=await browser.newPage({viewport:{width:390,height:844}}),switchErrors=[];
  switching.on('pageerror',e=>switchErrors.push(e.message));
  await switching.goto(gameUrl);await switching.getByRole('button',{name:'SETTINGS',exact:true}).waitFor();
  await switching.waitForTimeout(900);
  for(const q of ['LOW','MEDIUM','HIGH','LOW']){
    await switching.getByRole('button',{name:'SETTINGS',exact:true}).click();
    await switching.getByRole('button',{name:q,exact:true}).click();
    await switching.getByRole('button',{name:'DONE',exact:true}).click();
    await switching.waitForTimeout(850);
    const graphicsError=await switching.locator('.gl-error').count();
    assert.equal(graphicsError,0,graphicsError ? await switching.locator('.gl-error').textContent() : 'unexpected graphics error');
  }
  await switching.getByRole('button',{name:/LET.S PLAY/}).click();
  assert.deepEqual(switchErrors,[]);assert.equal(await switching.locator('.gl-error').count(),0);
  reports.push({qualitySwitch:'LOW / MEDIUM / HIGH / LOW without page errors',errors:switchErrors});
  console.log('PASS quality switch');
  const lost=await switching.evaluate(()=>{
    const gl=document.querySelector('canvas').getContext('webgl2');
    const extension=gl?.getExtension('WEBGL_lose_context');extension?.loseContext();return !!extension;
  });
  assert.equal(lost,true,'context-loss extension available');
  await switching.getByRole('heading',{name:"Can't start 3D graphics"}).waitFor();
  reports.push({contextLoss:'a real current-canvas loss still shows the recovery screen'});
  console.log('PASS current context loss');await switching.close();
}
try{
  if(process.argv[2]==='switch'){
    await checkSwitch();
  }else if((process.argv[2]??'gallery')==='gallery'){
    const manifest=JSON.parse(readFileSync(new URL(`../public/models/${theme}/manifest.json`,import.meta.url),'utf8'));
    const page=await browser.newPage({viewport:{width:1600,height:1000}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    for(const a of manifest.assets){
      await page.goto(`${url}/tools/environment-preview.html?theme=${theme}&asset=${a.file}`);
      await page.waitForFunction(()=>window.__environmentReview?.loaded||window.__environmentReview?.error);
      await page.waitForTimeout(350);
      const result=await page.evaluate(()=>window.__environmentReview);
      assert.equal(result.error,'');assert.equal(result.draws,2); // model + review ground
      assert.equal(result.triangles,a.triangles+2);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:new URL(a.file.replace('.glb','.png'),out).pathname.replace(/^\/(\w:)/,'$1')});
      reports.push(result); console.log('PASS gallery',a.file);
    }
  }else{
    for(const quality of ['low','medium','high']) for(const [width,height] of [[320,568],[390,844],[844,390]]){
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
      await context.addInitScript(q=>localStorage.setItem('kicky.settings.v1',JSON.stringify({sound:false,vibration:false,quality:q,skinId:'kicky-teal'})),quality);
      const page=await context.newPage(),errors=[],models=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.url().includes(`/models/${theme}/`)&&r.url().endsWith('.glb'))models.push({url:r.url(),status:r.status()});});
      await page.goto(gameUrl); await page.getByRole('button',{name:/LET.S PLAY/}).waitFor();
      if(process.argv[2]!=='production') await page.waitForFunction(()=>window.__kicky);
      await page.waitForTimeout(1600);
      await page.getByRole('button',{name:/LET.S PLAY/}).click();
      if(process.argv[2]==='production') await page.keyboard.press('KeyA');
      else await page.evaluate(()=>{window.__kicky.press('left');window.__kicky.release('left');});
      await page.waitForTimeout(300);
      const phase=process.argv[2]==='production'?'production inputs exercised':await page.evaluate(()=>window.__kicky.engine.phase);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1);
      assert.equal(overflow,false);assert.deepEqual(errors,[]);
      assert.equal(models.length,1);assert.equal(models[0].status,200);
      assert.ok(models[0].url.endsWith(`${beach?'beach':'hillside'}-lod${{high:0,medium:1,low:2}[quality]}.glb`));
      assert.equal(await page.locator('.gl-error').count(),0);
      await page.screenshot({path:new URL(`game-${quality}-${width}x${height}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});
      reports.push({quality,width,height,phase,overflow,models,errors});console.log('PASS game',quality,width,height);
      await context.close();
    }
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route(`**/models/${theme}/*.glb`,route=>route.abort());
    await page.goto(gameUrl);await page.getByRole('button',{name:/LET.S PLAY/}).waitFor();await page.waitForTimeout(2000);
    await page.getByRole('button',{name:/LET.S PLAY/}).click();await page.waitForTimeout(350);
    assert.equal(await page.locator('.gl-error').count(),0);
    assert.equal(await page.locator('canvas').count(),1);
    await page.screenshot({path:new URL('fallback.png',out).pathname.replace(/^\/(\w:)/,'$1')});
    reports.push({fallback:'aborted environment model still leaves game canvas and controls usable'});
    console.log('PASS fallback');
    // Reuse the same page through quality changes: cached GLBs must survive remounts.
    await checkSwitch();
  }
}finally{
  await browser.close();
  writeFileSync(new URL(`${process.argv[2]??'gallery'}-browser.json`,out),JSON.stringify(reports,null,2)+'\n');
}
