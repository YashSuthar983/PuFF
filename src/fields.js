// Sample any shape into a volume. Coordinates span [-1, 1] on each axis;
// bytes are x-fastest, then y, then z, matching WebGL's texture layout.
export function createDensityField(sample, {width=64,height=64,depth=64}={}) {
 if(typeof sample!=='function')throw new TypeError('sample must be a density function.');
 if(![width,height,depth].every(n=>Number.isInteger(n)&&n>=2&&n<=256))throw new RangeError('Field dimensions must be integers from 2 to 256.');
 const data=new Uint8Array(width*height*depth);
 for(let z=0;z<depth;z++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const density=sample(x/(width-1)*2-1,y/(height-1)*2-1,z/(depth-1)*2-1);
  data[x+width*(y+height*z)]=Math.round(Math.max(0,Math.min(1,Number(density)||0))*255);
 }
 return {data,width,height,depth};
}
