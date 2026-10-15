/** Lighting palettes only: no celestial objects, clock, or automatic cycle. */
const palette=(top,middle,bottom,lit,shade,direction,glare,glareTint,ambient)=>Object.freeze({top:Object.freeze(top),middle:Object.freeze(middle),bottom:Object.freeze(bottom),lit:Object.freeze(lit),shade:Object.freeze(shade),direction:Object.freeze(direction),glare,glareTint:Object.freeze(glareTint),ambient,background:Object.freeze(middle.map(n=>n/255))});
const dusk=palette([86,103,161],[189,134,170],[250,181,140],[1,.92,.83],[.59,.46,.64],[.95,-.15,.55],.85,[1,.9,.7],.8);
export const CloudTimes=Object.freeze({
 dawn:palette([95,119,158],[193,153,174],[250,208,169],[1,.95,.9],[.64,.6,.73],[-.9,-.18,.65],.65,[1,.94,.8],.85),
 day:palette([107,158,202],[129,179,219],[182,215,238],[1,1,1],[.66,.76,.87],[.55,-.72,.62],.25,[1,1,1],1),
 noon:palette([63,135,206],[103,173,229],[183,222,248],[1,1,.98],[.62,.76,.9],[.12,-.95,.88],.4,[1,1,.95],1.1),
 dusk,sunset:dusk,
 night:palette([9,18,43],[22,38,71],[57,73,108],[.85,.92,1],[.35,.46,.64],[-.3,-.6,.8],.2,[.9,.95,1],.45)
});
