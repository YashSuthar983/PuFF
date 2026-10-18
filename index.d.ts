export type CloudPreset='clouds'|'storm'|'fog'|'smoke';
export type RGB=[number,number,number];
export type Vector3=readonly [number,number,number];
export type Color=string|Vector3;
export type TimeOfDay='custom'|'dawn'|'day'|'noon'|'dusk'|'night'|'sunset';
export interface TimeLighting {readonly top:Vector3;readonly middle:Vector3;readonly bottom:Vector3;readonly lit:Vector3;readonly shade:Vector3;readonly direction:Vector3;readonly glare:number;readonly glareTint:Vector3;readonly ambient:number;readonly background:Vector3}
export interface LightingOptions {lit?:Vector3;shade?:Vector3;direction?:Vector3;glare?:number;glareTint?:Vector3}
export interface Wind {x:number;y:number;strength:number}
export const CloudTimes:Readonly<Record<Exclude<TimeOfDay,'custom'>,TimeLighting>>;
export type LightningMode='off'|'manual'|'hover'|'random';
export interface PhysicsOptions {recoveryRate?:number;vaporDissipation?:number;brushSize?:number;weathering?:number;puffDuration?:number;vaporLifetime?:number;tapCapacity?:number;tapRetention?:number}
export interface ControlDescriptor {readonly label:string;readonly min:number;readonly max:number;readonly step:number;readonly default:number;readonly group:string}
export interface QualityProfile {readonly resolutionLimit:number;readonly raySteps:number;readonly fps:number;readonly octaves:number;readonly selfShadow:number;readonly lightSamples:number;readonly maxLights:number;readonly amortize:number}
export const CloudControls:Readonly<{scene:Readonly<Record<string,ControlDescriptor>>;lightning:Readonly<Record<string,ControlDescriptor>>;text:Readonly<Record<string,ControlDescriptor>>;volume:Readonly<Record<string,ControlDescriptor>>;quality:Readonly<Record<'cpu'|'low'|'medium'|'high',QualityProfile>>;lightningModes:readonly LightningMode[]}>;
export interface StrikeEvent {source:{x:number;y:number};end:{x:number;y:number};power:number;duration:number;color:RGB}
export interface CloudSceneOptions {
 /** Context creation only; use the host fallback if accelerated rendering is unavailable. */
 failIfMajorPerformanceCaveat?:boolean;powerPreference?:WebGLPowerPreference;
 transparent?:boolean;backgroundOpacity?:number;timeOfDay?:TimeOfDay;
 propagation?:number;pulseCount?:number;pulseSpacing?:number;glowDecay?:number;glowSpread?:number;
 preset?:CloudPreset; shape?:'layer'|'sphere';
 /** 'auto' (default): 'cpu' on software WebGL, 'low' on phones / weak devices, 'medium' otherwise. Pick one to fix it. */
 quality?:'auto'|'cpu'|'low'|'medium'|'high';
 coverage?:number; detail?:number; ambient?:number; exposure?:number; drift?:number;
 resolutionScale?:number; cloudColor?:Color; background?:Color; color?:Color;
 lightning?:boolean; lightningPower?:number; boltReach?:number; branches?:number;
 interval?:number; afterglow?:number; cloudGlow?:number; interactive?:boolean; autoStart?:boolean;
 lightningMode?:LightningMode;randomness?:number;variation?:number;seed?:number;
 density?:number;noiseScale?:number;softness?:number;erosion?:number;extinction?:number;
 shadowStrength?:number;lightIntensity?:number;lightFalloff?:number;viewScale?:number;volumeDepth?:number;shapeRadius?:number;
 shadowStride?:number;
 octaves?:number;selfShadow?:number;lightSamples?:number;maxLights?:number;amortize?:number;
 /** 1 (default): automatic render resolution, from GPU timing where available, else frame cadence. 0: manual, fixed at resolutionScale. */
 adaptiveQuality?:number;minRenderScale?:number;gpuBudgetMs?:number;
 raySteps?:number;resolutionLimit?:number;pixelRatio?:number;fps?:number;
 windDirection?:Vector3;lightDirection?:Vector3;offset?:Vector3;scale?:Vector3;
 densityShader?:string;uniforms?:Record<string,number|number[]>;
 onStrike?:(event:StrikeEvent)=>void;onFrame?:(event:{time:number;width:number;height:number;lightning:ReturnType<Lightning['getState']>})=>void;
}
export type CloudScenePatch=Omit<CloudSceneOptions,'interactive'|'autoStart'|'densityShader'|'failIfMajorPerformanceCaveat'|'powerPreference'>;
export interface DensityField {data:Uint8Array;width:number;height:number;depth:number;extent?:Vector3}
export interface LightSource {x:number;y:number;depth?:number;radius?:number;strength:number;color?:Color}
export interface BoltSegment {a:{x:number;y:number};b:{x:number;y:number};strength:number;color?:Color}
export const CloudPresets:Readonly<Record<CloudPreset,Readonly<CloudSceneOptions>>>;
export function createDensityField(sample:(x:number,y:number,z:number)=>number,dimensions?:{width?:number;height?:number;depth?:number}):DensityField;
export class CloudScene {
 static vertexShader:string;static fragmentShader:string;
 static createFragmentShader(body?:string,uniforms?:Record<string,number|number[]>):string;
 constructor(canvas:HTMLCanvasElement,options?:CloudSceneOptions);
 readonly canvas:HTMLCanvasElement; readonly gl:WebGL2RenderingContext;
 options:CloudSceneOptions; paused:boolean; time:number;
 setOptions(patch:CloudScenePatch):this;
 setTimeOfDay(preset:TimeOfDay,overrides?:CloudScenePatch):this;
 getOptions():CloudSceneOptions;
 getPerformance():{gpuTimingAvailable:boolean;gpuMs:number|null;frameMs:number|null;renderScale:number;width:number;height:number;software:boolean;profile:'cpu'|'low'|'medium'|'high'};
 setUniforms(patch:Record<string,number|number[]>):this;
 setDensityField(data:Uint8Array,dimensions:Omit<DensityField,'data'>):this;
 clearDensityField():this;
 setSources(lights?:LightSource[],segments?:BoltSegment[]):void;
 setPointer(event:Pick<PointerEvent,'clientX'|'clientY'>):void;
 setPointer(x:number,y:number):void;clearPointer():void;clearLightning():void;
 resize(width?:number,height?:number):void;
 strike(x?:number,y?:number):void;
 setPaused(value:boolean):void;start():this;stop():this;
 render(time?:number,dt?:number):boolean;destroy():void;
}
export class StormClouds extends CloudScene {}
export interface VolumeOptions {failIfMajorPerformanceCaveat?:boolean;powerPreference?:WebGLPowerPreference;gridSize?:number;minCell?:number;minRadius?:number;radiusFactor?:number;renderWidth?:number;renderHeight?:number;raySteps?:number;shadowStride?:number;detailScale?:number;edgeFadeTop?:number;edgeFadeBottom?:number;sharedBuffer?:boolean;physics?:PhysicsOptions}
export type CloudLayerOptions=Omit<VolumeOptions,'physics'|'sharedBuffer'|'failIfMajorPerformanceCaveat'|'powerPreference'>&{scale?:number;puffiness?:number};
export interface CloudPointer {active:boolean; x?:number;y?:number;vx?:number;vy?:number;down?:boolean;segments?:Array<{ax:number;ay:number;bx:number;by:number;down?:boolean}>;effects?:Array<{kind:'puff'|'stir';x:number;y:number;strength?:number}>}
export interface CloudLayer {readonly width:number;readonly height:number}
export interface LayerRender {rendered:boolean;settled:boolean;canvas:HTMLCanvasElement;x:number;y:number;width:number;height:number}
export class CloudVolume {
 static vertexShader:string;static fragmentShader:string;
 constructor(options?:VolumeOptions);
 readonly canvas:HTMLCanvasElement;readonly gl:WebGL2RenderingContext;
 trailStrength:number;vaporDensity?:number;airStrength?:number;dirty:boolean;
 pointLight?:{x:number;y:number;height:number;power:number;reach:number;color?:Vector3;glow?:number}|null;
 lighting?:LightingOptions;
 /** Mask-pixel velocity; mark dirty after changing the wind of a settled direct mask. */
 environmentWind?:Wind|null;
 configure(patch:PhysicsOptions):this;
 getOptions():VolumeOptions&{physics:PhysicsOptions;trailStrength:number;vaporDensity:number;airStrength:number};
 createLayer(mask:HTMLCanvasElement,options?:CloudLayerOptions):CloudLayer;
 renderLayer(layer:CloudLayer,dt:number,paused:boolean,pointer:CloudPointer,options?:{formation?:number;simulate?:boolean;renderScale?:number}):LayerRender;
 recoverLayer(layer:CloudLayer,elapsed:number):void;gustLayer(layer:CloudLayer,strength?:number):void;releaseLayer(layer:CloudLayer):void;
 setMask(mask:HTMLCanvasElement,options?:{scale?:number;puffiness?:number}):this;
 setFormation(mask:HTMLCanvasElement,fontSize:number,puffiness:number):void;
 render(dt:number,paused:boolean,pointer:CloudPointer,frameMs?:number):boolean;
 gust(strength?:number):void;destroy():void;
}
export type LightningSetting='propagation'|'pulseCount'|'pulseSpacing'|'glowDecay'|'glowSpread'|'power'|'reach'|'branches'|'interval'|'afterglow'|'glow'|'randomness'|'variation';
export class Lightning {
 constructor(canvas?:HTMLCanvasElement|null,options?:Partial<Record<LightningSetting,number>>&{mode?:LightningMode;seed?:number;onStrike?:(event:StrikeEvent)=>void});
 configure(kind:LightningSetting,value:number):void;
 configure(kind:'seed',value:number):void;configure(kind:'mode',value:LightningMode):void;
 resize(width:number,height:number,dpr:number):void;trigger():boolean;
 update(dt:number,source:{x:number;y:number;color:Vector3;enabled:boolean;bounds?:{x:number;y:number;width:number;height:number}},getTargets:(reach:number,origin:{x:number;y:number})=>Array<{x:number;y:number}>):number;
 draw(scrollX:number,scrollY:number):void;clear():void;clearOverlay():void;
 getLights():LightSource[];getSegments(max?:number):BoltSegment[];
 getState():{settings:Record<LightningSetting,number>&{mode:LightningMode;seed:number};strikeCount:number;flash:number;pathCount:number;nextStrikeIn:number};
}

export interface CloudTextOptions {
 /** Construction only. Load @chartara/puff/text.css when false. */
 injectStyles?:boolean;
 adaptiveQuality?:number;renderBudgetMs?:number;minRenderScale?:number;
 quality?:'low'|'medium'|'high';fps?:number;idleFps?:number;maskLimit?:number;shadowStride?:number;
 puffiness?:number;trailStrength?:number;vaporDensity?:number;airStrength?:number;formationDuration?:number;padding?:number;
 interactive?:boolean;pointerEvents?:boolean;reformOnEnter?:boolean;scrollWind?:number;tapStrength?:number;stirStrength?:number;
 timeOfDay?:Exclude<TimeOfDay,'custom'>;cloudColor?:string;lightColor?:string;lightPower?:number;lightReach?:number;lightHeight?:number;
 physics?:PhysicsOptions;onError?:(error:Error)=>void;onFrame?:(event:{element:HTMLElement;formation:number;draws:number})=>void;
}
export interface CloudTextLight {x:number;y:number;strength:number;height?:number;reach?:number;radius?:number;color?:Color;glow?:number}
export type CloudTextPatch=Omit<CloudTextOptions,'injectStyles'>;
export type CloudPointerEvent=Pick<PointerEvent,'clientX'|'clientY'|'pointerType'|'pointerId'|'button'|'target'>&Partial<Pick<PointerEvent,'isPrimary'|'preventDefault'>>;
/** Preserves semantic HTML. Targets must be block or inline-block, with no nested targets. */
export class CloudText {
 constructor(target:string|HTMLElement|Iterable<HTMLElement>,options?:CloudTextOptions);
 readonly paused:boolean;readonly playMode:boolean;readonly destroyed:boolean;
 setOptions(patch:CloudTextPatch):this;getOptions():CloudTextOptions;
 setLighting(value:LightingOptions):this;
 setLights(lights:CloudTextLight[]):this;setWind(value:Wind|null):this;
 handlePointer(type:'pointerdown'|'pointermove'|'pointerup'|'pointercancel',event:CloudPointerEvent):this;
 stir(x?:number,y?:number,strength?:number,target?:HTMLElement):this;
 refresh():this;setText(text:string,index?:number):this;
 puff(x?:number,y?:number,strength?:number,target?:HTMLElement):this;gust(strength?:number):this;
 setPlayMode(value:boolean):this;setPaused(value:boolean):this;
 getPerformance():{rendererCount:number;elements:number;visibleElements:number;renderScale:number;cachedLayers:number;draws:number;cpuSubmitMs:number;error:string|null};
 destroy():void;
}
