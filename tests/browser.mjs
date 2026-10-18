import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright';
import {withPackage} from './helpers/package.mjs';

const engines={chromium,firefox,webkit};
const engine=process.env.PUFF_BROWSER||'chromium';
assert(Object.hasOwn(engines,engine),'PUFF_BROWSER must be chromium, firefox, or webkit');
const software=process.env.PUFF_SOFTWARE_GL==='1';

await withPackage(async({directory,packageRoot})=>{
 const bundled=await build({absWorkingDir:directory,stdin:{contents:"import * as kit from '@yashsuthar/puff'; globalThis.kit=kit;",resolveDir:directory},bundle:true,format:'esm',write:false});
 const html='<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><link rel="stylesheet" href="/text.css"><h1>PuFF library</h1><canvas id="sky"></canvas><script type="module" src="/consumer.js"></script>';
 const assets=new Map([
  ['/consumer.js',['text/javascript',bundled.outputFiles[0].text]],
  ['/text.css',['text/css',await readFile(join(packageRoot,'src/text.css'))]],
  ['/classic.js',['text/javascript',await readFile(join(packageRoot,'dist/puff.js'))]],
  ['/fixture.css',['text/css','body{margin:20px}h1{font:bold 48px Georgia;color:#234;width:280px;touch-action:pan-y}#sky{width:256px;height:128px}']],
 ]);
 const server=createServer((request,response)=>{
  const path=new URL(request.url,'http://localhost').pathname;
  if(path==='/'||path==='/default'){
   if(path==='/')response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:");
   response.writeHead(200,{'Content-Type':'text/html'}).end(html);
  }else if(assets.has(path)){
   const [type,body]=assets.get(path);response.writeHead(200,{'Content-Type':type}).end(body);
  }else response.writeHead(404).end();
 });
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const options={headless:process.env.PUFF_HEADED!=='1'};
  if(process.env.PUFF_BROWSER_EXECUTABLE){assert.equal(engine,'chromium','Custom executables are supported only for Chromium');options.executablePath=process.env.PUFF_BROWSER_EXECUTABLE;}
  if(engine==='chromium'&&software)options.args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  browser=await engines[engine].launch(options);
  const url=`http://127.0.0.1:${server.address().port}`;
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
   const page=await browser.newPage({viewport,reducedMotion:'no-preference'});
   page.setDefaultTimeout(30000);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(allowSoftware=>{
    globalThis.cspViolations=[];
    document.addEventListener('securitypolicyviolation',event=>cspViolations.push(event.violatedDirective));
    const native=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,options){
     if(type==='webgl2'&&globalThis.rejectWebGL)return null;
     // Only the test relaxes the accelerated-context requirement on software CI.
     if(type==='webgl2'&&allowSoftware)return native.call(this,type,{...options,failIfMajorPerformanceCaveat:false});
     return native.call(this,type,options);
    };
   },software);
   try{
    await page.goto(url);
    await page.waitForFunction(()=>globalThis.kit);
    await page.evaluate(async()=>{
     await document.fonts.ready;
     globalThis.words=new kit.CloudText(document.querySelector('h1'),{injectStyles:false,formationDuration:0,idleFps:0,quality:'low',fps:60,scrollWind:0});
     globalThis.scene=new kit.CloudScene(document.querySelector('#sky'),{autoStart:false,interactive:false,quality:'cpu',raySteps:4});
     scene.setOptions({cloudColor:kit.CloudTimes.day.lit,lightDirection:kit.CloudTimes.day.direction});
     if(!scene.render(0,0))throw new Error('Scene did not render');
     words.setLighting(kit.CloudTimes.day);
    });
    await page.waitForFunction(()=>words.error||words.getPerformance().draws>0);
    const rendered=await page.evaluate(()=>{
     const target=document.querySelector('h1'),canvas=target.querySelector('canvas');
     return{error:words.getPerformance().error,ready:target.classList.contains('puff-text-ready'),styles:document.querySelectorAll('style').length,color:getComputedStyle(target).color,position:getComputedStyle(canvas).position,pixels:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)};
    });
    assert.equal(rendered.error,null);assert(rendered.ready);assert(rendered.pixels,'Cloud text produced visible pixels');
    assert.equal(rendered.styles,0,'Strict CSP mode does not inject style tags');assert.equal(rendered.position,'absolute');assert.equal(rendered.color,'rgba(0, 0, 0, 0)');
    await page.evaluate(()=>{
     for(const interactive of [false,true])for(const paused of [false,true])for(const requested of [false,true]){
      words.setPaused(false).setOptions({interactive}).setPaused(paused).setPlayMode(requested);
      if(words.playMode!==(interactive&&!paused&&requested))throw new Error('Toggle combination failed');
      if(document.querySelector('h1').style.touchAction!==(words.playMode?'none':'')){
       // The original pan-y comes from external CSS, so restoring removes inline ownership.
       throw new Error('Toggle did not restore touch ownership');
      }
     }
     words.setPaused(false).setOptions({interactive:true}).setPlayMode(true);
    });
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
    await page.waitForFunction(()=>!words.playMode);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('h1')).touchAction),'pan-y');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);
    const before=await page.evaluate(()=>{const count=words.getPerformance().draws;words.setText('New cloud');words.refresh();return count;});
    await page.waitForFunction(count=>words.getPerformance().draws>count,before);
    await page.evaluate(()=>{words.destroy();scene.destroy();});
    assert.deepEqual(await page.evaluate(()=>({canvas:document.querySelector('h1 canvas')!==null,ready:document.querySelector('h1').classList.contains('puff-text-ready'),text:document.querySelector('h1').textContent,styles:document.querySelectorAll('style').length,violations:cspViolations})),{canvas:false,ready:false,text:'New cloud',styles:0,violations:[]});
    await page.addScriptTag({url:url+'/classic.js'});
    assert.equal(await page.evaluate(()=>PuFF.createDensityField(()=>1,{width:2,height:2,depth:2}).data[0]),255);
    await page.evaluate(()=>{
     globalThis.rejectWebGL=true;globalThis.fallbackError=null;
     globalThis.fallback=new kit.CloudText(document.querySelector('h1'),{injectStyles:false,onError:error=>globalThis.fallbackError=error.message});
    });
    await page.waitForFunction(()=>globalThis.fallbackError);
    assert.deepEqual(await page.evaluate(()=>({ready:document.querySelector('h1').classList.contains('puff-text-ready'),hidden:getComputedStyle(document.querySelector('h1 canvas')).display==='none'})),{ready:false,hidden:true});
    await page.evaluate(()=>fallback.destroy());
    assert.deepEqual(errors,[]);
    console.log(`PASS ${engine} ${browser.version()} ${viewport.width}px: installed ESM/classic, real scene/text pixels, CSP, toggle combinations, reduced motion, refresh, native fallback, cleanup.`);
   }catch(error){
    console.error('Browser failure state:',await page.evaluate(()=>({playMode:globalThis.words?.playMode,paused:globalThis.words?.paused,media:matchMedia('(prefers-reduced-motion: reduce)').matches,ownerMedia:globalThis.words?.manager.motion?.matches,signalAborted:globalThis.words?.manager.events.signal.aborted,hidden:document.hidden,performance:globalThis.words?.getPerformance(),violations:globalThis.cspViolations})).catch(()=>null),errors);
    throw error;
   }finally{await page.close();}
  }
  const page=await browser.newPage();
  await page.goto(url+'/default');await page.waitForFunction(()=>globalThis.kit);
  await page.evaluate(()=>globalThis.words=new kit.CloudText(document.querySelector('h1')));
  assert.equal(await page.locator('style').count(),1,'Default mode retains automatic styles');
  await page.evaluate(()=>words.destroy());assert.equal(await page.locator('style').count(),0);await page.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
