/** Public control metadata: apps may build editors from the same limits as the engine. */
const control=(label,min,max,step,value,group)=>Object.freeze({label,min,max,step,default:value,group});
export const CloudControls=Object.freeze({
 // Each profile sets every cost switch, so changing profile never leaves another profile's feature level behind.
 // cpu: for WebGL drawn in software (no usable GPU), where every noise octave and light sample is paid in full.
 quality:Object.freeze({
  cpu:Object.freeze({resolutionLimit:480,raySteps:10,fps:30,octaves:2,selfShadow:0,lightSamples:0,maxLights:1,amortize:8}),
  low:Object.freeze({resolutionLimit:800,raySteps:20,fps:15,octaves:4,selfShadow:1,lightSamples:2,maxLights:3,amortize:1}),
  medium:Object.freeze({resolutionLimit:1280,raySteps:40,fps:24,octaves:4,selfShadow:1,lightSamples:2,maxLights:3,amortize:1}),
  high:Object.freeze({resolutionLimit:1920,raySteps:64,fps:30,octaves:4,selfShadow:1,lightSamples:2,maxLights:3,amortize:1})
 }),
 scene:Object.freeze({
  backgroundOpacity:control('Background opacity (0 = transparent)',0,1,.05,1,'Background'),
  coverage:control('Cloud coverage',0,1,.01,.7,'Cloud structure'),
  density:control('Vapor thickness',0,5,.05,1,'Cloud structure'),
  detail:control('Billow detail',0,2,.05,1,'Cloud structure'),
  noiseScale:control('Billow size',.25,4,.05,1,'Cloud structure'),
  softness:control('Edge softness',.02,.5,.01,.14,'Cloud structure'),
  erosion:control('Vapor erosion',0,.5,.01,.12,'Cloud structure'),
  extinction:control('Light absorption',.1,8,.1,3.4,'Lighting'),
  ambient:control('Ambient illumination',0,2,.01,.13,'Lighting'),
  exposure:control('Exposure',.3,3,.05,1.7,'Lighting'),
  shadowStride:control('Shadow sample spacing',1,8,1,3,'Rendering'),
  adaptiveQuality:control('Automatic resolution',0,1,1,1,'Rendering'),
  minRenderScale:control('Minimum automatic scale',.35,1,.05,.5,'Rendering'),
  gpuBudgetMs:control('GPU budget (ms)',4,40,1,12,'Rendering'),
  shadowStrength:control('Shadow depth',0,5,.05,2,'Lighting'),
  lightIntensity:control('Internal light',0,4,.05,1,'Lighting'),
  lightFalloff:control('Light softness',.02,3,.02,.16,'Lighting'),
  viewScale:control('View size',1,12,.1,4,'Placement'),
  volumeDepth:control('Volume depth',1,12,.1,5.2,'Placement'),
  shapeRadius:control('Puff radius',.2,4,.05,1.8,'Placement'),
  drift:control('Drift speed',0,2,.05,1,'Motion'),
  raySteps:control('Ray samples',4,96,1,40,'Rendering'),
  // Cost switches: each is a separate part of the per-pixel work, so any one can be turned down on its own.
  octaves:control('Noise octaves (detail layers per sample)',1,4,1,4,'Rendering'),
  selfShadow:control('Self-shadowing (one extra sample per shadow step)',0,1,1,1,'Rendering'),
  lightSamples:control('Shadow samples per point light (0 = unshadowed)',0,2,1,2,'Rendering'),
  maxLights:control('Point lights drawn',0,3,1,3,'Rendering'),
  // After the initial whole frame, spread each cloud frame across animation frames (in bands), blending the last
  // two finished frames meanwhile. More bands reduce work per animation frame, at the cost of motion/light delay.
  amortize:control('Frames per cloud frame (1 = whole frames)',1,16,1,1,'Rendering'),
  resolutionLimit:control('Maximum resolution',256,4096,64,1280,'Rendering'),
  resolutionScale:control('Render scale',.1,2,.05,1,'Rendering'),
  pixelRatio:control('Pixel ratio',.5,2,.1,1,'Rendering'),
  fps:control('Sky frame rate',4,60,1,24,'Rendering')
 }),
 lightning:Object.freeze({
  propagation:control('Discharge travel (ms)',50,900,10,180,'Discharge pulses'),
  pulseCount:control('Discharge pulses',1,6,1,3,'Discharge pulses'),
  pulseSpacing:control('Pulse spacing (ms)',40,500,10,100,'Discharge pulses'),
  glowDecay:control('Regional glow fade (ms)',80,1500,10,320,'Discharge pulses'),
  glowSpread:control('Regional glow spread',.05,2,.05,.45,'Discharge pulses'),
  power:control('Lightning power',0,2,.05,1,'Lightning'),
  reach:control('Bolt reach',40,500,10,140,'Lightning'),
  branches:control('Branches',0,8,1,4,'Lightning'),
  interval:control('Average wait (ms)',600,30000,100,7000,'Lightning'),
  randomness:control('Timing randomness',0,1,.05,.7,'Lightning'),
  variation:control('Flash variation',0,1,.05,.35,'Lightning'),
  afterglow:control('Afterglow (ms)',100,2000,50,500,'Lightning'),
  glow:control('Cloud glow',0,2,.05,1,'Lightning')
 }),
 volume:Object.freeze({
  recoveryRate:control('Text recovery',0,4,.05,.9,'Text physics'),
  vaporDissipation:control('Vapor fade',0,4,.05,1.15,'Text physics'),
  brushSize:control('Sweep size',.25,3,.05,1,'Text physics'),
  weathering:control('Sweep erosion',0,3,.05,1,'Text physics'),
  puffDuration:control('Tap breeze duration',.3,5,.1,1.8,'Text physics'),
  vaporLifetime:control('Vapor lifetime',6,60,1,9,'Text physics'),
  tapCapacity:control('Released vapor limit',.01,.5,.01,.16,'Text physics'),
  tapRetention:control('Letter retention on tap',0,1,.05,.65,'Text physics')
 }),
 text:Object.freeze({
  adaptiveQuality:control('Automatic render scale',0,1,1,1,'Rendering'),
  renderBudgetMs:control('Draw submission budget (ms)',4,40,1,12,'Rendering'),
  minRenderScale:control('Minimum automatic scale',.35,1,.05,.5,'Rendering'),
  fps:control('Active frame rate',4,60,1,30,'Rendering'),
  idleFps:control('Idle frame rate (0 = still)',0,30,1,8,'Rendering'),
  maskLimit:control('Maximum mask size',256,4096,128,2048,'Rendering'),
  shadowStride:control('Shadow sample spacing',1,8,1,3,'Rendering'),
  puffiness:control('Puffiness',.3,2,.05,1,'Cloud lettering'),
  formationDuration:control('Formation time (seconds)',0,10,.1,1.6,'Cloud lettering'),
  padding:control('Vapor margin',4,160,2,28,'Cloud lettering'),
  trailStrength:control('Sweep strength',0,2,.05,1,'Interaction'),
  vaporDensity:control('Vapor density',0,2,.05,1,'Interaction'),
  airStrength:control('Air strength',0,2,.05,1,'Interaction'),
  scrollWind:control('Scroll wind',0,2,.05,.35,'Interaction'),
  tapStrength:control('Tap strength',0,2,.05,1,'Interaction'),
  stirStrength:control('Hold stir',0,2,.05,1,'Interaction'),
  lightPower:control('Light power',0,3,.05,1,'Lighting'),
  lightReach:control('Light spread',20,500,10,180,'Lighting'),
  lightHeight:control('Light height',10,300,5,70,'Lighting')
 }),
 lightningModes:Object.freeze(['off','manual','hover','random'])
});
