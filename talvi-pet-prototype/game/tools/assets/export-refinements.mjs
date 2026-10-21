/** Maintained deterministic image exporter. No generation, registry writes or world geometry. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const arg = key => {
  const index=args.indexOf(key);
  if(index<0 || !args[index+1] || args[index+1].startsWith('--')) throw new Error(`Required ${key}; use --project <game-root> --config <config.json> --out <staging-directory>`);
  return args[index+1];
};
const project = resolve(arg('--project'));
const output = resolve(arg('--out'));
const configPath = resolve(arg('--config'));
const config = JSON.parse(await readFile(configPath, 'utf8'));
const { chromium } = await import(pathToFileURL(resolve(project, 'game/node_modules/playwright/index.mjs')));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const hash = data => createHash('sha256').update(data).digest('hex');
const results = [];
try {
  for (const item of [config.room, ...config.sprites]) {
    // sourceSubdirectory defaults to the refinements-v1 layout (<sourceDirectory>/sources); "" reads sourceDirectory itself.
    const sourcePath = resolve(project, config.sourceDirectory, config.sourceSubdirectory ?? 'sources', item.source);
    const mime = item.source.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const source = await readFile(sourcePath);
    if (item.sourceSha256 && hash(source) !== item.sourceSha256) throw new Error(`${sourcePath} SHA-256 ${hash(source)} does not match config sourceSha256 ${item.sourceSha256}`);
    const rendered = await page.evaluate(async ({ item, encoded, mime, room }) => {
      const img = new Image(); img.src = `data:${mime};base64,` + encoded; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      const target = document.createElement('canvas'); target.width = item.width; target.height = item.height;
      const out = target.getContext('2d'); out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
      let metrics;
      if (room) {
        const scale = Math.min(item.width / img.width, item.bandHeight / img.height);
        const w = img.width * scale, h = img.height * scale, x = (item.width - w) / 2, y = item.bandTop + (item.bandHeight - h) / 2;
        // The polygon selects source image pixels, never world geometry. Its interior
        // encloses every wall/floor contour; feathering occurs only outside that area.
        const pixels=ctx.getImageData(0,0,img.width,img.height),d=pixels.data,average=[0,0,0];let count=0;
        for(const [sx,sy] of [[0,0],[img.width-20,0],[0,img.height-20],[img.width-20,img.height-20]])for(let j=sy;j<sy+20;j++)for(let i=sx;i<sx+20;i++){const p=(j*img.width+i)*4;for(let c=0;c<3;c++)average[c]+=d[p+c];count++;}
        const paper=average.map(v=>Math.round(v/count));out.fillStyle=`rgb(${paper.join(',')})`;out.fillRect(0,0,item.width,item.height);
        const poly=item.exteriorBoundary;let protectedPixels=0;
        for(let py=0;py<img.height;py++)for(let px=0;px<img.width;px++){
          let inside=false,distance=Infinity;
          for(let i=0,j=poly.length-1;i<poly.length;j=i++){
            const [ax,ay]=poly[j],[bx,by]=poly[i];
            if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;
            const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
            distance=Math.min(distance,Math.hypot(px-ax-t*dx,py-ay-t*dy));
          }
          const alpha=inside?1:Math.max(0,Math.min(1,1-(distance-item.exteriorKeep)/item.exteriorFeather));
          if(inside||distance<=item.exteriorKeep)protectedPixels++;
          d[(py*img.width+px)*4+3]=Math.round(alpha*255);
        }
        ctx.putImageData(pixels,0,0);out.drawImage(canvas,x,y,w,h);
        metrics = { sourceSize: [img.width,img.height], transform: { scaleX:scale, scaleY:scale, translateX:x, translateY:y }, entireSourceY:[y,y+h], background:'sampled neutral paper; 6px feather exclusively outside preserved source-image room contour plus3px keep region',paperRgb:paper,protectedSourcePixels:protectedPixels,sourceImageBoundary:poly };
      } else {
        const w = canvas.width, h = canvas.height, pixels = ctx.getImageData(0,0,w,h), data = pixels.data;
        const exterior = new Uint8Array(w*h), queue = new Int32Array(w*h); let head=0,tail=0;
        const white = i => { const p=i*4, lo=Math.min(data[p],data[p+1],data[p+2]),hi=Math.max(data[p],data[p+1],data[p+2]); return lo>=item.backgroundMin && hi-lo<=item.backgroundChroma; };
        const visit = i => { if (!exterior[i] && white(i)) { exterior[i]=1; queue[tail++]=i; } };
        for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);} for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
        while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;if(x)visit(i-1);if(x<w-1)visit(i+1);if(y)visit(i-w);if(y<h-1)visit(i+w);}
        // Interior pixels (including white/cream enclosed by the contour) stay fully opaque.
        // Limit exterior antialias to a dilated keep-region, then unmatte against white.
        const keep = new Uint8Array(w*h);
        for(let i=0;i<keep.length;i++)if(!exterior[i]){const x=i%w,y=(i/w)|0;for(let dy=-item.dilation;dy<=item.dilation;dy++)for(let dx=-item.dilation;dx<=item.dilation;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)keep[(y+dy)*w+x+dx]=1;}
        let left=w,top=h,right=-1,bottom=-1,protectedPixels=0;
        for(let i=0;i<exterior.length;i++){
          const p=i*4; let a=255;
          if(exterior[i]) a=keep[i]?Math.round(255*Math.min(1,(255-Math.min(data[p],data[p+1],data[p+2]))/(255-item.backgroundMin))):0;
          else protectedPixels++;
          data[p+3]=a;
          if(exterior[i]&&a>0&&a<255)for(let c=0;c<3;c++)data[p+c]=Math.max(0,Math.min(255,Math.round((data[p+c]-255*(1-a/255))/(a/255))));
          if(a){const x=i%w,y=(i/w)|0;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        }
        if(right<left)throw new Error('No subject survived exterior key');
        ctx.putImageData(pixels,0,0);
        const sw=right-left+1,sh=bottom-top+1,scale=Math.min(item.width/sw,item.height/sh),dw=sw*scale,dh=sh*scale;
        out.drawImage(canvas,left,top,sw,sh,(item.width-dw)/2,item.height-dh,dw,dh);
        const rgba=out.getImageData(0,0,item.width,item.height).data;let l=item.width,r=-1,t=item.height,b=-1,transparent=0,partial=0;
        for(let i=0;i<rgba.length/4;i++){const a=rgba[i*4+3];if(!a)transparent++;if(a>0&&a<255)partial++;if(a){const x=i%item.width,y=(i/item.width)|0;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}}
        metrics={sourceSize:[w,h],sourceBounds:[left,top,right,bottom],scale,protectedOpaqueSourcePixels:protectedPixels,bounds:[l,t,r,b],bottomGap:item.height-1-b,centerOffset:Math.abs((l+r)/2-(item.width-1)/2),sideMargins:[l,item.width-1-r],transparentPixels:transparent,partialPixels:partial,corners:[rgba[3],rgba[(item.width-1)*4+3],rgba[(item.height-1)*item.width*4+3],rgba[rgba.length-1]]};
      }
      return { data:target.toDataURL(room?'image/jpeg':'image/png',room?item.quality:undefined).split(',')[1],metrics };
    }, { item, encoded:source.toString('base64'), mime, room:item.id===config.room.id });
    const data=Buffer.from(rendered.data,'base64'),relative=item.id+(item.id===config.room.id?'.jpg':'.png');
    await mkdir(dirname(resolve(output,relative)),{recursive:true}); await writeFile(resolve(output,relative),data);
    results.push({id:item.id,file:relative,source:sourcePath,sourceSha256:hash(source),sha256:hash(data),bytes:data.length,...rendered.metrics});
  }
  await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'export-report.json'),JSON.stringify({node:process.version,chrome:browser.version(),configSha256:hash(await readFile(configPath)),results},null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
} finally { await browser.close(); }
