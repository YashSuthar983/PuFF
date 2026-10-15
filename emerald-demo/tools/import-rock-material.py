"""Prepare acquired PBR rock maps for the native demo; never downloads assets."""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import tempfile
from PIL import Image, ImageOps

parser=argparse.ArgumentParser(description=__doc__)
for key in ['albedo','normal','roughness','height']:
    parser.add_argument('--'+key,type=Path,required=True)
parser.add_argument('--normal-dx',action='store_true',help='Invert the normal green channel to convert DX to GL.')
parser.add_argument('--name',required=True)
parser.add_argument('--source-url',required=True)
parser.add_argument('--license',required=True)
parser.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'assets/rocks')
args=parser.parse_args()
for key in ['albedo','normal','roughness','height']:
    if not getattr(args,key).is_file():parser.error('Missing '+key+' map.')
args.out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='rock-material-') as temp:
    for key in ['albedo','normal','roughness','height']:
        source=getattr(args,key)
        if source.suffix.lower()=='.exr':
            intermediate=Path(temp)/(key+'.png')
            subprocess.run(['convert',str(source),'-depth','16',str(intermediate)],check=True)
            source=intermediate
        image=Image.open(source)
        if key=='height':
            image=image.convert('F');lo,hi=image.getextrema()
            image=image.point(lambda x:(x-lo)*255/max(hi-lo,1)).convert('L')
        else:image=image.convert('RGB' if key in ['albedo','normal'] else 'L')
        if key=='normal' and args.normal_dx:
            r,g,b=image.split();image=Image.merge('RGB',(r,ImageOps.invert(g),b))
        size=1024 if key=='albedo' else 512
        image.thumbnail((size,size),Image.Resampling.LANCZOS)
        if key=='albedo':image.save(args.out/'albedo.webp','WEBP',quality=92,method=6)
        else:image.save(args.out/(key+'.png'),optimize=True)
(args.out/'SOURCE.md').write_text('# Rock surface source\n\n'+args.name+'\n\nSource: '+args.source_url+'\n\nLicense at acquisition: '+args.license+'\n\nPrepared from user-provided PBR maps. The demo uses a generated displaced ridge mesh; it does not load the source asset mesh.\n')
maps={}
for name in ['albedo.webp','normal.png','roughness.png','height.png']:
    mime='image/webp' if name.endswith('webp') else 'image/png'
    maps[name]='data:'+mime+';base64,'+base64.b64encode((args.out/name).read_bytes()).decode()
(args.out/'embedded-maps.js').write_text('window.EmeraldRockMaps='+json.dumps(maps,separators=(',',':'))+';\n')
low=args.out/'low'
low.mkdir(exist_ok=True)
for name in ['albedo.webp','normal.png','roughness.png','height.png']:
    image=Image.open(args.out/name)
    image.thumbnail((256,256),Image.Resampling.LANCZOS)
    if name.endswith('webp'):image.save(low/name,'WEBP',quality=88,method=6)
    else:image.save(low/name,optimize=True)
low_maps={name:'data:'+('image/webp' if name.endswith('webp') else 'image/png')+';base64,'+base64.b64encode((low/name).read_bytes()).decode() for name in ['albedo.webp','normal.png','roughness.png','height.png']}
(low/'embedded-maps.js').write_text('window.EmeraldRockMapsLow='+json.dumps(low_maps,separators=(',',':'))+';\n')
print('Prepared browser material in',args.out)
