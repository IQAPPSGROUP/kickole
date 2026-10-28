// Optional: npm install --prefix .validation --no-save playwright-core
// URL=http://127.0.0.1:5189 CHROMIUM=/path/to/chrome node tools/check-movement-browser.mjs [review|contact|game]
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../.validation/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const out=new URL('../movement-shots/',import.meta.url);mkdirSync(out,{recursive:true});
const url=process.env.URL??'http://127.0.0.1:5189',mode=process.argv[2]??'review';
const chromeCandidates=[
  process.env.CHROMIUM,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath=chromeCandidates.find((path)=>existsSync(path));
if(!executablePath){
  console.error('Set CHROMIUM to a Chrome or Chromium binary.');
  process.exit(1);
}
const browser=await chromium.launch({executablePath,headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const results=[];
try{
  if(mode==='review'){
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${url}/tools/movement-preview.html`);
    await page.waitForFunction(()=>window.__movementReview?.ready);
    const model=await page.evaluate(()=>({url:window.__movementReview.modelUrl,rig:window.__movementReview.rig,clips:window.__movementReview.clips}));
    assert.ok(model.url.endsWith('/models/kickole_player_v4.glb'));assert.equal(model.rig,'contract');assert.equal(model.clips,5);
    // Regression: a selected movement must animate even if the previous sample was paused.
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    const frozen=await page.evaluate(()=>window.__movementReview.time);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>window.__movementReview.time),frozen);
    await page.getByLabel('Movement',{exact:true}).selectOption('shimmy');
    await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
    await page.waitForFunction(()=>window.__movementReview.scenario==='shimmy'&&window.__movementReview.time>.15);
    console.log('PASS review selection restarts playback from paused state');
    const signatures=new Set();
    for(const renderer of ['glb','primitive']) for(const [scenario,time] of [['idle',.8],['ready',.4],['left',.14],['right',.26],['stall',.6],['fist',.35],['shimmy',.35],['salute',.4],['miss',.3]]){
      await page.getByLabel('Character renderer').selectOption(renderer);
      await page.getByLabel('Movement',{exact:true}).selectOption(scenario);
      await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
      await page.evaluate(time=>window.__movementReview.set({time,playing:false}),time);
      await page.waitForTimeout(350);
      const info=await page.evaluate(()=>({error:window.__movementReview.error,selected:window.__movementReview.scenario,joints:window.__movementReview.joints,...window.__movementReview.sample()}));
      assert.equal(info.error,'');assert.deepEqual(errors,[]);
      assert.equal(info.selected,scenario);
      if(renderer==='glb'){
        assert.equal(info.joints.expressive.length,18);assert.equal(info.joints.base.length,18);
        signatures.add(info.joints.expressive.map(n=>n.toFixed(5)).join(','));
        if(info.phase==='playing')for(let i=9;i<15;i++)assert.ok(Math.abs(info.joints.expressive[i]-info.joints.base[i])<1e-5,'v2 foot accents retain base transforms');
      }
      assert.ok(info.motion.name);await page.screenshot({path:fileURLToPath(new URL(`${renderer}-${scenario}.png`,out))});
      results.push({renderer,scenario,time,motion:info.motion.name,phase:info.phase,model,joints:info.joints});console.log('PASS review',renderer,scenario);
    }
    assert.equal(signatures.size,9,'all nine UI selections produce different rendered v2 poses');
    // A compact animation sequence for review, with the same player rendered on both sides.
    await page.evaluate(()=>window.__movementReview.set({renderer:'glb',scenario:'shimmy',time:0,playing:false}));
    await page.waitForTimeout(350);
    for(let i=0;i<16;i++){
      await page.evaluate(t=>window.__movementReview.set({time:t,playing:false}),i/14);
      await page.waitForTimeout(80);
      await page.screenshot({path:fileURLToPath(new URL(`frame-${String(i).padStart(2,'0')}.png`,out))});
    }
  }else if(mode==='contact'){
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${url}/?inspect&environment=beach`);
    await page.waitForFunction(()=>window.__inspect?.info().foot?.every(Number.isFinite));
    const held=new Map();
    for(const side of ['left','right']) for(const type of ['kick','stall']) for(const t of type==='kick'?[.25,.3,.35]:[.3,.5,.7]){
      await page.evaluate(o=>window.__inspect.set(o),{side,mode:type,t});await page.waitForTimeout(300);
      const info=await page.evaluate(()=>window.__inspect.info());assert.ok(info.foot);
      if((type==='kick'&&t===.3)||(type==='stall'&&t<=.5)){
        assert.ok(info.foot[1]>.2&&info.foot[2]>.15);assert.equal(Math.sign(info.foot[0]),side==='left'?-1:1);
      }
      if(type==='stall'&&t===.3)held.set(side,info.ball);
      // V2 retains main's procedural stall flex. Check the trapped ball here; unit tests
      // and the comparison viewer verify expressive/base foot transforms at equal times.
      if(type==='stall'&&t===.5){assert.equal(info.ball.vy,0);for(const k of ['x','y','z'])assert.equal(info.ball[k],held.get(side)[k]);}
      if(type==='stall'&&t===.7)assert.ok(info.ball.vy>0);
      results.push({side,type,t,...info});await page.screenshot({path:fileURLToPath(new URL(`contact-${side}-${type}-${t}.png`,out))});
      console.log('PASS contact',side,type,t);
    }
    assert.deepEqual(errors,[]);
  }else if(mode==='production'){
    for(const quality of ['low','high'])for(const [width,height] of [[390,844],[844,390]]){
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
      await context.addInitScript(q=>localStorage.setItem('kicky.settings.v1',JSON.stringify({sound:false,vibration:false,quality:q,skinId:'kicky-teal'})),quality);
      const page=await context.newPage(),errors=[],character=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.url().endsWith('/models/kickole_player_v4.glb'))character.push(r.status());});
      await page.goto(url);await page.getByRole('button',{name:/LET.S PLAY/}).waitFor();await page.waitForTimeout(650);
      await page.getByRole('button',{name:/LET.S PLAY/}).click();await page.keyboard.press('KeyA');await page.waitForTimeout(300);
      assert.equal(await page.locator('.zones').count(),1);assert.equal(await page.locator('.gl-error').count(),0);
      assert.deepEqual(errors,[]);assert.ok(character.some(s=>s===200||s===206));
      await page.screenshot({path:fileURLToPath(new URL(`production-${quality}-${width}x${height}.png`,out))});
      results.push({quality,width,height,character,errors});console.log('PASS production',quality,width,height);await context.close();
    }
  }else{
    for(const theme of ['street','beach'])for(const quality of ['low','high']){
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await context.addInitScript(q=>localStorage.setItem('kicky.settings.v1',JSON.stringify({sound:false,vibration:false,quality:q,skinId:'kicky-teal'})),quality);
      const page=await context.newPage(),errors=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='warn'||m.type()==='error')warnings.push(m.text().slice(0,500));});
      await page.goto(`${url}/?environment=${theme}`);await page.getByRole('button',{name:/LET.S PLAY/}).waitFor();await page.waitForTimeout(700);
      await page.waitForFunction(()=>window.__inspectorState);
      await page.evaluate(()=>{window.__inspectorState.trace=[];});
      await page.waitForTimeout(500);
      console.log('renderer',JSON.stringify({theme,quality,frames:await page.evaluate(()=>window.__inspectorState.trace.length),warnings}));
      await page.getByRole('button',{name:/LET.S PLAY/}).click();
      // Fixed-step playback removes software-GPU timing jitter; only normal inputs/ticks drive the unmodified engine.
      await page.evaluate(()=>{
        window.__inspectorState.active=true;
        const c=window.__kicky; c.press('right');c.release('right');let side='left';
        window.__movementBot=setInterval(()=>{for(let i=0;i<2;i++){
          if(c.engine.phase==='playing'&&!c.engine.contact&&c.engine.ball.vy<0&&c.engine.timingDeltaMs()<=0){c.press(side);c.release(side);side=side==='left'?'right':'left';}
          c.tick(c.engine.config.fixedStep);
        }},16);
      });
      await page.waitForFunction(()=>window.__kicky.engine.stats.kickUps>=3,{timeout:30000});
      await page.screenshot({path:fileURLToPath(new URL(`game-${theme}-${quality}.png`,out))});
      const info=await page.evaluate(()=>{
        clearInterval(window.__movementBot);
        const trace=window.__inspectorState.trace??[];return {stats:window.__kicky.engine.stats,states:[...new Set(trace.map(s=>s.state))],frames:trace.length};
      });
      console.log(JSON.stringify({theme,quality,...info,warnings}));
      assert.ok(info.frames>2,'GLB renderer produced joint traces');assert.deepEqual(errors,[]);
      assert.equal(await page.locator('.gl-error').count(),0);results.push({theme,quality,...info});console.log('PASS game',theme,quality);
      await context.close();
    }
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/models/kickole_player_v4.glb',r=>r.abort());
    await page.goto(`${url}/?environment=beach`);await page.getByRole('button',{name:/LET.S PLAY/}).waitFor();await page.waitForTimeout(600);
    await page.getByRole('button',{name:/LET.S PLAY/}).click();
    assert.equal(await page.locator('.gl-error').count(),0);await page.screenshot({path:fileURLToPath(new URL('fallback.png',out))});
    results.push({fallback:'character request aborted; primitive animated scene remains usable'});console.log('PASS fallback');
  }
}finally{
  await browser.close();writeFileSync(new URL(`${mode}-browser.json`,out),JSON.stringify(results,null,2)+'\n');
}
