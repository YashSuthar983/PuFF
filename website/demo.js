(() => {
 'use strict';
 const kit=window.CloudKit,$=id=>document.getElementById(id);
 let words;
 try{words=new kit.CloudText('[data-cloud]',{timeOfDay:'dawn',onError:error=>{$('status').textContent='Showing native HTML: '+error.message;},onFrame:()=>{const message='Sweep the words. Tap on a phone, or enable finger sweeping.';if($('status').textContent!==message)$('status').textContent=message;}});}catch(error){$('status').textContent=error.message;return;}
 const groups=new Map(),controls=[];
 for(const [type,schema]of [['text',kit.CloudControls.text],['physics',kit.CloudControls.volume]])for(const [key,c]of Object.entries(schema)){
  const name=type==='physics'?'Recovery & weathering':c.group;if(!groups.has(name)){const group=document.createElement('details');group.innerHTML=`<summary>${name}</summary>`;groups.set(name,group);$('controls').append(group);}
  const row=document.createElement('div');row.className='range';row.innerHTML=`<label for="${type}-${key}">${c.label}</label><output>${c.default}</output><input id="${type}-${key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.default}">`;groups.get(name).append(row);const input=row.querySelector('input'),output=row.querySelector('output');controls.push({type,key,c,input,output});input.addEventListener('input',()=>{const value=Number(input.value);words.setOptions(type==='physics'?{physics:{[key]:value}}:{[key]:value});output.value=String(value);});
 }
 function sky(time){const t=kit.CloudTimes[time];for(const key of ['top','middle','bottom'])document.documentElement.style.setProperty('--sky-'+key,`rgb(${t[key].join(',')})`);}
 function sync(){const o=words.getOptions();for(const {type,key,c,input,output}of controls){const value=(type==='physics'?o.physics[key]:o[key])??c.default;input.value=value;output.value=String(value);}$('quality').value=o.quality;$('timeOfDay').value=o.timeOfDay;$('lightColor').value=o.lightColor;$('interactive').checked=o.interactive;if(o.cloudColor)$('cloudColor').value=o.cloudColor;sky(o.timeOfDay);}
 $('quality').addEventListener('change',()=>words.setOptions({quality:$('quality').value}));$('timeOfDay').addEventListener('change',()=>{words.setOptions({timeOfDay:$('timeOfDay').value});sky($('timeOfDay').value);});
 for(const key of ['lightColor','cloudColor'])$(key).addEventListener('input',()=>words.setOptions({[key]:$(key).value}));$('interactive').addEventListener('change',()=>words.setOptions({interactive:$('interactive').checked}));
 $('word').addEventListener('input',()=>{const element=$('editableWord'),node=Array.from(element.childNodes).find(n=>n.nodeType===3);if(node)node.nodeValue=$('word').value||'Cloud';});
 $('puff').addEventListener('click',()=>words.puff());$('gust').addEventListener('click',()=>words.gust());
 $('playMode').addEventListener('click',()=>{words.setPlayMode(!words.playMode);$('playMode').setAttribute('aria-pressed',words.playMode);$('playMode').textContent='Finger sweeping: '+(words.playMode?'On':'Off');});
 $('pause').addEventListener('click',()=>{words.setPaused(!words.paused);$('pause').setAttribute('aria-pressed',words.paused);$('pause').textContent=words.paused?'Resume':'Pause';$('playMode').setAttribute('aria-pressed',words.playMode);$('playMode').textContent='Finger sweeping: '+(words.playMode?'On':'Off');});
 $('export').addEventListener('click',()=>{$('configuration').value=JSON.stringify(words.getOptions(),null,2);});$('apply').addEventListener('click',()=>{try{words.setOptions(JSON.parse($('configuration').value));sync();$('configStatus').textContent='Configuration applied.';}catch(error){$('configStatus').textContent=error.message;}});
 const metrics=setInterval(()=>{const s=words.getPerformance();$('metrics').textContent=`GPU renderers: ${s.rendererCount} · Visible words: ${s.visibleElements}/${s.elements} · Cached masks: ${s.cachedLayers} · Render scale: ${Math.round(s.renderScale*100)}% · Draws: ${s.draws} · Last CPU submission: ${s.cpuSubmitMs.toFixed(2)}ms`;},1000);
 window.addEventListener('pagehide',event=>{if(!event.persisted){clearInterval(metrics);words.destroy();}});
 sync();
})();
