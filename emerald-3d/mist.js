(() => {
 'use strict';
 // Mist masks are written in screen space so the copy column stays clear.
 const uv='vec2 uv=vec2(p.x/(uViewScale*(uResolution.x/uResolution.y))+.5,.5-p.y/uViewScale);';
 const backMist=uv+`
  float left=exp(-pow((uv.x-.06)/.2,2.)-pow((uv.y-.6)/.22,2.))*1.2;
  float right=exp(-pow((uv.x-.64)/.19,2.)-pow((uv.y-.78)/.13,2.))*1.35;
  float ridge=exp(-pow((uv.x-.47)/.11,2.)-pow((uv.y-.7)/.09,2.))*.9;
  float clearCopy=1.-.85*smoothstep(.5,.62,uv.x)*(1.-smoothstep(.6,.72,uv.y));
  float wisps=.35+.65*noise(p*1.5+vec3(uTime*.07,0.,3.));
  return cloudBase(p)*clamp(left*1.15+right+ridge,0.,1.)*clearCopy*wisps;`;
 const frontMist=uv+`
  float floor_=smoothstep(.78,1.,uv.y)*(1.-.35*smoothstep(.55,.9,uv.x));
  float corner=exp(-pow((uv.x-.04)/.14,2.)-pow((uv.y-.9)/.1,2.));
  float wisps=.25+.75*noise(p*1.9+vec3(uTime*.1,1.,0.));
  return cloudBase(p)*clamp(floor_*.9+corner,0.,1.)*wisps;`;
 const options={preset:'clouds',transparent:true,interactive:false,autoStart:false,cloudColor:'#e8eceb',coverage:.8,ambient:.95,exposure:1.8,extinction:2.2,
  detail:.4,erosion:.16,softness:.24,shadowStrength:2.4,lightFalloff:.22,viewScale:3.4,volumeDepth:3.2,noiseScale:1.05,windDirection:[.06,.012,.01],
  // Lightning is switched on for the back layer only (demo.js); strikes are fired by pulses.
  lightning:false,lightningMode:'manual',lightningPower:2,branches:4,pulseCount:3,afterglow:600,cloudGlow:2,glowSpread:1.1,glowDecay:500,raySteps:28,shadowStride:4,adaptiveQuality:1,fps:24,lightDirection:[-.3,.5,.35]};

 window.EmeraldMist=Object.freeze({back:backMist,front:frontMist,options});
})();
