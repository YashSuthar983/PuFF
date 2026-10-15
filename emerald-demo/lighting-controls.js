(() => {
 'use strict';
 const c=(label,min,max,step,value,group)=>({label,min,max,step,default:value,group});
 const schema={
  rimX:c('Rim position X',0,1,.01,.3,'Rim light'),rimY:c('Rim position Y',0,1,.01,.4,'Rim light'),rimHeight:c('Rim depth',-2,2,.05,.2,'Rim light'),rimPower:c('Rim strength',0,2,.01,.14,'Rim light'),rimReach:c('Rim spread',.05,2,.01,.36,'Rim light'),
  fillX:c('Fill position X',0,1,.01,.1,'Fill light'),fillY:c('Fill position Y',0,1,.01,.52,'Fill light'),fillHeight:c('Fill depth',-2,2,.05,.8,'Fill light'),fillReach:c('Fill spread',.05,3,.05,1,'Fill light'),
  pointerPower:c('Pointer strength',0,2,.01,.16,'Pointer light'),pointerHeight:c('Pointer depth',-2,2,.05,.25,'Pointer light'),pointerSmoothing:c('Pointer easing (seconds)',0,.8,.01,.16,'Pointer light'),pointerEnabled:c('Pointer light enabled',0,1,1,1,'Pointer light'),
  cliffHeight:c('Cliff height',.5,1.6,.05,1,'3D cliff'),cliffDepth:c('Cliff depth',.4,2,.05,1,'3D cliff'),cliffTurn:c('Cliff turn (degrees)',-25,25,1,0,'3D cliff'),cliffTilt:c('Cliff tilt (degrees)',-15,15,1,0,'3D cliff'),
  rockNormal:c('Scan normal detail',0,2,.05,1,'Rock material'),rockRoughness:c('Scan roughness multiplier',.2,1.5,.05,.65,'Rock material'),rockAlbedo:c('Rock albedo',.1,1,.05,.35,'Rock material'),
  pulseX:c('Manual pulse origin X',0,1,.01,.3,'Randomized light'),pulseY:c('Manual pulse origin Y',0,1,.01,.5,'Randomized light'),zoneX:c('Random zone X',0,1,.01,.03,'Randomized light'),zoneY:c('Random zone Y',0,1,.01,.2,'Randomized light'),zoneWidth:c('Random zone width',.05,1,.01,.75,'Randomized light'),zoneHeight:c('Random zone height',.05,1,.01,.65,'Randomized light'),
  pulseGain:c('Pulse illumination',0,2,.01,.16,'Randomized light'),hueVariation:c('Random color variation',0,1,.01,.12,'Randomized light'),
 };
 for(const [key,value]of Object.entries(CloudKit.CloudControls.scene))if(value.group==='Lighting')schema['scene_'+key]={...value,default:({ambient:.3,exposure:1.7,extinction:2.1,shadowStrength:2.6,lightFalloff:.24})[key]??value.default};
 for(const [key,value]of Object.entries(CloudKit.CloudControls.lightning))schema['pulse_'+key]={...value,default:({power:.65,reach:120,branches:2,propagation:520,pulseCount:2,pulseSpacing:220,glowDecay:650,afterglow:700,glow:.7,glowSpread:.26,interval:9000,randomness:.8,variation:.4})[key]??value.default,group:['interval','randomness','variation'].includes(key)?'Random timing':'Discharge pulses'};
 for(const [key,value]of Object.entries({x:-.35,y:.45,z:.3}))schema['direction_'+key]=c('Ambient direction '+key.toUpperCase(),-1,1,.05,value,'Ambient lighting');
 schema.scene_shadowStride=c('Shadow sample spacing',1,8,1,4,'Ambient lighting');
 const defaults=Object.freeze(Object.fromEntries(Object.entries(schema).map(([key,value])=>[key,value.default])));
 function mount(host,onChange){
  const groups=new Map();
  for(const [key,def]of Object.entries(schema)){
   if(!groups.has(def.group)){const details=document.createElement('details');details.className='lighting-group';details.open=def.group==='3D cliff';const summary=document.createElement('summary');summary.textContent=def.group;details.append(summary);host.append(details);groups.set(def.group,details);}
   const row=document.createElement('div');row.className='range-row';const labelRow=document.createElement('div');const label=document.createElement('label');label.htmlFor='fx-'+key;label.textContent=def.label;const output=document.createElement('output');output.id='fx-'+key+'Value';output.htmlFor='fx-'+key;const input=document.createElement('input');input.id='fx-'+key;input.type='range';input.min=def.min;input.max=def.max;input.step=def.step;input.value=def.default;output.value=String(def.default);labelRow.append(label,output);row.append(labelRow,input);groups.get(def.group).append(row);
   input.addEventListener('input',()=>{output.value=input.value;onChange(key,Number(input.value));});
  }
 }
 function sync(state){for(const key of Object.keys(schema)){const input=document.getElementById('fx-'+key);if(input){input.value=state[key];document.getElementById('fx-'+key+'Value').value=String(state[key]);}}}
 window.EmeraldControls={schema,defaults,mount,sync};
})();
