import { CloudControls } from './config.js';
/** Bounded hover lightning. Geometry stays in document coordinates. */
  const limits=CloudControls.lightning;
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function Lightning(canvas,options={}){
    if(options.onStrike!=null&&typeof options.onStrike!=='function')throw new TypeError('onStrike must be a function.');
    const ctx=canvas?.getContext('2d')||null;
    const settings={...Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,v.default])),mode:'random',seed:options.seed??Math.floor(Math.random()*4294967295)};
    let strikes=[],wait=0,width=0,height=0,flash=0,seed=settings.seed>>>0,pending=false,wasEnabled=false;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const nextWait=()=>Math.max(600,settings.interval*(1+settings.randomness*(random()*2-1)*.5));
    wait=nextWait();
    function path(a,b){
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.max(1,Math.hypot(dx,dy));
      const points=[{x:a.x,y:a.y}];
      for(let i=1;i<9;i++){
        const t=i/9,offset=(random()-.5)*Math.min(35,length*.32)*Math.sin(Math.PI*t);
        points.push({x:a.x+dx*t-dy/length*offset,y:a.y+dy*t+dx/length*offset});
      }
      points.push({x:b.x,y:b.y});return points;
    }
    function strike(source,targets){
      const nearby=targets.filter(p=>Math.hypot(p.x-source.x,p.y-source.y)<=settings.reach);
      if(!nearby.length)return false;
      const end=nearby[Math.floor(random()*nearby.length)],main=path(source,end);
      const paths=[main],travel=settings.propagation/1000;
      main.delay=0;main.depth=(random()-.5)*.8;
      for(let i=0;i<Math.round(settings.branches);i++){
        const root=main[2+Math.floor(random()*6)],target=nearby[Math.floor(random()*nearby.length)];
        const branch=path(root,{x:target.x+(random()-.5)*12,y:target.y+(random()-.5)*12});
        branch.delay=main.indexOf(root)/9*travel*.65;branch.depth=(random()-.5)*1.2;paths.push(branch);
      }
      const pulses=[];let pulseAt=0;
      for(let i=0;i<Math.round(settings.pulseCount);i++){pulses.push({at:pulseAt,power:1-i*.09});pulseAt+=settings.pulseSpacing/1000*(.85+random()*.3);}
      strikes.push({paths,pulses,travel,decay:settings.glowDecay/1000,age:0,life:travel*1.7+pulses.at(-1).at+Math.max(settings.afterglow,settings.glowDecay*3)/1000*(1+settings.variation*(random()-.5)),power:settings.power*(1+settings.variation*(random()-.5)),color:source.color.slice(),source:{x:source.x,y:source.y},end:{...end}});
      if(strikes.length>2)strikes.shift();options.onStrike?.({source:{x:source.x,y:source.y},end:{...end},power:strikes.at(-1).power,duration:strikes.at(-1).life,color:source.color.slice()});return true;
    }
    function pulseEnergy(s,path,t,tail=s.decay){
      let value=0;
      for(const pulse of s.pulses){
        const elapsed=s.age-pulse.at-path.delay-s.travel*t;
        if(elapsed>0)value+=smooth(elapsed/.035)*Math.exp(-elapsed/Math.max(.025,tail))*pulse.power;
      }
      // A soft global release ensures the last reservoir disappears without a cut.
      return value*smooth((s.life-s.age)/Math.max(.08,s.decay));
    }
    function envelope(s){return Math.min(1.5,s.paths.reduce((max,p)=>Math.max(max,pulseEnergy(s,p,Math.min(.5,Math.max(0,s.age-p.delay)/s.travel*.5))),0));}
    function interpolate(path,t){const n=Math.min(8,Math.floor(t*9)),f=Math.min(1,t*9-n),a=path[n],b=path[n+1];return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};}
    this.configure=(kind,value)=>{
      if(kind==='mode'){
        if(!CloudControls.lightningModes.includes(value))throw new RangeError('Unknown lightning mode.');
        if(settings.mode===value)return;settings.mode=value;wait=nextWait();if(value==='off')this.clear();return;
      }
      if(kind==='seed'){if(!Number.isFinite(value))throw new TypeError('seed must be finite.');if(settings.seed===(Number(value)>>>0))return;settings.seed=seed=Number(value)>>>0;wait=nextWait();return;}
      if(!Object.prototype.hasOwnProperty.call(limits,kind))throw new RangeError('Unknown lightning setting: '+kind);
      if(!Number.isFinite(Number(value)))throw new TypeError('Lightning values must be finite.');
      const {min,max}=limits[kind],next=Math.max(min,Math.min(max,Number(value)));if(settings[kind]===next)return;settings[kind]=next;
      if(kind==='interval'||kind==='randomness')wait=nextWait();
      if(kind==='power'&&settings.power===0)this.clear();
    };
    this.resize=(w,h,dpr)=>{if(![w,h,dpr].every(Number.isFinite)||w<0||h<0||dpr<=0)throw new TypeError('Lightning dimensions and pixel ratio must be finite and nonnegative (positive for pixel ratio).');width=w;height=h;if(canvas){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx?.setTransform(dpr,0,0,dpr,0,0);};
    this.trigger=()=>{if(settings.mode==='off'||settings.power===0)return false;pending=true;return true;};
    this.update=(dt,source,getTargets)=>{
      if(!source.enabled||settings.power===0||settings.mode==='off'){if(wasEnabled)this.clear();wasEnabled=false;return 0;}
      if(!Number.isFinite(source.x)||!Number.isFinite(source.y)||!Array.isArray(source.color)||source.color.length!==3||!Array.from(source.color).every(Number.isFinite)||source.bounds&&!['x','y','width','height'].every(key=>Number.isFinite(source.bounds[key])))throw new TypeError('Lightning source coordinates, bounds, and RGB color must be finite.');
      wasEnabled=true;dt=Math.max(0,Math.min(.25,Number(dt)||0));
      for(const s of strikes)s.age+=dt;
      strikes=strikes.filter(s=>s.age<s.life);
      wait-=dt*1000;
      const automatic=settings.mode==='random'||settings.mode==='hover';
      if(pending||(automatic&&wait<=0)){
        let origin=source;
        if(settings.mode==='random'&&!pending){
          const box=source.bounds||{x:0,y:0,width,height};
          if(box.width>0&&box.height>0)origin={...source,x:box.x+box.width*(.15+random()*.7),y:box.y+box.height*(.15+random()*.7)};
        }
        const targets=getTargets(settings.reach,origin);
        wait=strike(origin,targets)?nextWait():Math.min(1000,settings.interval);
        pending=false;
      }
      flash=Math.min(1.5,strikes.reduce((sum,s)=>sum+envelope(s)*s.power,0))*settings.glow;
      return flash;
    };
    this.draw=(scrollX,scrollY)=>{
      if(!ctx)return;
      ctx.clearRect(0,0,width,height);ctx.lineCap='round';ctx.lineJoin='round';
      for(const strike of strikes){
        const color=strike.color.map(v=>Math.round(v*255));
        for(let i=0;i<strike.paths.length;i++){
          const original=strike.paths[i],progress=Math.max(0,Math.min(1,(strike.age-original.delay)/strike.travel));
          if(progress<=0)continue;
          const alpha=Math.min(1,pulseEnergy(strike,original,Math.min(.5,progress*.5),Math.max(.04,settings.afterglow/1000*.3))*strike.power);
          const points=original.slice(0,Math.floor(progress*9)+1);if(progress<1)points.push(interpolate(original,progress));
          const thickness=i===0?1.6:.8;
          for(let pass=0;pass<3;pass++){
            ctx.beginPath();points.forEach((p,j)=>{const x=p.x-scrollX,y=p.y-scrollY;if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
            ctx.strokeStyle=pass===2?'#f5fdff':`rgb(${color.join(',')})`;
            ctx.globalAlpha=alpha*[.15,.7,.95][pass];ctx.lineWidth=thickness*[5,1.7,.5][pass];
            ctx.shadowColor=`rgb(${color.join(',')})`;ctx.shadowBlur=pass===0?18:pass===1?6:0;ctx.stroke();
          }
        }
      }
      ctx.globalAlpha=1;ctx.shadowBlur=0;
    };
    this.clear=()=>{strikes=[];flash=0;wait=nextWait();pending=false;ctx?.clearRect(0,0,width,height);};
    this.clearOverlay=()=>ctx?.clearRect(0,0,width,height);
    this.getSegments=(max=32)=>{
      if(!Number.isFinite(max)||max<0)throw new RangeError('Segment limit must be finite and nonnegative.');max=Math.floor(max);
      const segments=[];
      // Round-robin paths lets branches share the fixed shader channel budget.
      for(let i=1;i<10;i++)for(const s of strikes)for(const path of s.paths){
        const progress=Math.max(0,Math.min(1,(s.age-path.delay)/s.travel));
        if(progress<=(i-1)/9)continue;
        if(segments.length>=max)return segments;
        const strength=pulseEnergy(s,path,(i-.5)/9,Math.max(.04,settings.afterglow/1000*.3))*s.power;
        if(strength<.002)continue;
        segments.push({a:{...path[i-1]},b:progress<i/9?interpolate(path,progress):{...path[i]},strength,color:s.color.slice()});
      }
      return segments;
    };
    this.getLights=()=>{
      const lights=[];
      // Three moving reservoirs, shared across strikes; no extra volume render passes.
      for(let slot=0;slot<3;slot++){
        let x=0,y=0,depth=0,total=0;const color=[0,0,0];
        for(const s of strikes)for(let index=slot;index<s.paths.length;index+=3){
          const path=s.paths[index];
          for(const pulse of s.pulses){
            const age=s.age-pulse.at-path.delay;if(age<=0)continue;
            const progress=Math.min(1,age/s.travel),point=interpolate(path,progress);
            const energy=smooth(age/.035)*Math.exp(-age/s.decay)*pulse.power*s.power*smooth((s.life-s.age)/Math.max(.08,s.decay));
            x+=point.x*energy;y+=point.y*energy;depth+=path.depth*energy;total+=energy;
            for(let i=0;i<3;i++)color[i]+=s.color[i]*energy;
          }
        }
        if(total>.002)lights.push({x:x/total,y:y/total,depth:depth/total,radius:settings.glowSpread,strength:Math.min(2,total)*settings.glow,color:color.map(v=>v/total)});
      }
      return lights;
    };
    for(const [key,value]of Object.entries(options))if(key!=='onStrike')this.configure(key,value);
    // Construction order must not change the sequence for the same seed/settings.
    settings.seed=seed=settings.seed>>>0;wait=nextWait();
    this.getState=()=>({settings:{...settings},strikeCount:strikes.length,flash,nextStrikeIn:Math.max(0,wait),
      pathCount:strikes.reduce((n,s)=>n+s.paths.length,0)});
  }
