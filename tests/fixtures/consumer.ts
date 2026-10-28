import {CloudText,CloudScene,CloudVolume,CloudTimes,CloudControls,CloudPresets,StormClouds,Lightning,createDensityField} from '@chartara/puff';

const canvas=document.createElement('canvas');
const scene=new CloudScene(canvas,{autoStart:false,interactive:false,powerPreference:'low-power'});
scene.setOptions({
 cloudColor:CloudTimes.day.lit,lightDirection:CloudTimes.day.direction,pauseWhenHidden:true,
 beforeRender:({time,dt,width,height})=>{void time;void dt;void width;void height;},
 onError:error=>{void error.message;},onContextLost:()=>{},onContextRestored:()=>{}
});
const readyPromise:Promise<CloudScene>=scene.ready;
const perf=scene.getPerformance();const isLost:boolean=perf.contextLost;
void readyPromise;void isLost;
scene.setTimeOfDay('night',{ambient:.8});
const words=new CloudText(document.createElement('h2'),{injectStyles:false});
words.setLighting(CloudTimes.day).setLighting({direction:[.5,-.5,1] as const});
words.setOptions({interactive:false});
words.handlePointer('pointerdown',{
 clientX:20,clientY:30,pointerType:'touch',pointerId:1,button:0,
 target:canvas,isPrimary:true,preventDefault(){},
});
words.handlePointer('pointerup',new PointerEvent('pointerup'));
const volume=new CloudVolume();
volume.lighting=CloudTimes.day;
volume.environmentWind={x:30,y:-20,strength:.5};
volume.pointLight={x:0,y:0,height:1,power:1,reach:100,color:CloudTimes.day.lit};
const density=createDensityField(()=>.5,{width:4,height:4,depth:4});
scene.setDensityField(density.data,{...density,extent:[2,2,2] as const});
const actor=new Lightning();
actor.update(.01,{x:0,y:0,color:CloudTimes.day.lit,enabled:false},()=>[]);
console.log(CloudControls.text.fps.default,CloudPresets.clouds,StormClouds);

// @ts-expect-error Context attributes are construction-only.
scene.setOptions({powerPreference:'high-performance'});
// @ts-expect-error Input ownership is construction-only on CloudScene.
scene.setTimeOfDay('day',{interactive:true});
// @ts-expect-error Starting the scene requires start(), not a live option.
scene.setTimeOfDay('day',{autoStart:true});
// @ts-expect-error A new density shader requires a new scene.
scene.setOptions({densityShader:'return 1.0;'});
// @ts-expect-error Stylesheet injection is construction-only.
words.setOptions({injectStyles:true});
// @ts-expect-error Lighting vectors have exactly three components.
words.setLighting({lit:[1,1]});
// @ts-expect-error The old fourth argument was never implemented.
volume.setFormation(canvas,48,1,true);
words.destroy();volume.destroy();scene.destroy();
