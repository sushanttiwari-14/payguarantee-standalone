import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createTikTokStyleCaptions } from '@remotion/captions';

const clips=JSON.parse(await readFile('narration.json','utf8'));
let offsetFrames=0;
let index=0;
const srt=[];
const timing=[];
const stamp=(ms)=>{
  const value=Math.round(ms);
  return `${String(Math.floor(value/3600000)).padStart(2,'0')}:${String(Math.floor(value/60000)%60).padStart(2,'0')}:${String(Math.floor(value/1000)%60).padStart(2,'0')},${String(value%1000).padStart(3,'0')}`;
};
for(const clip of clips){
  const captions=JSON.parse(await readFile(`public/captions/${clip.name}.json`,'utf8'));
  let previous=0;
  for(const caption of captions){
    assert(caption.startMs>=previous && caption.endMs>=caption.startMs,`Invalid caption order: ${clip.name}`);
    assert(caption.endMs<=clip.durationSeconds*1000+80,`Caption exceeds audio: ${clip.name}`);
    previous=caption.startMs;
  }
  const {pages}=createTikTokStyleCaptions({captions,combineTokensWithinMilliseconds:2000});
  for(const page of pages){
    const start=page.startMs+(offsetFrames+12)/30*1000;
    const end=Math.min(page.startMs+page.durationMs,clip.durationSeconds*1000)+(offsetFrames+12)/30*1000;
    srt.push(`${++index}\n${stamp(start)} --> ${stamp(end)}\n${page.text.trim()}\n`);
  }
  const durationInFrames=Math.ceil(clip.durationSeconds*30)+45;
  timing.push({name:clip.name,from:offsetFrames,durationInFrames,audioSeconds:clip.durationSeconds,captions:captions.length,pages:pages.length,maxCaptionCharacters:Math.max(...pages.map(page=>page.text.trim().length))});
  offsetFrames+=durationInFrames;
}
assert.equal(offsetFrames,4755,'Update the authored timeline if narration duration changed');
assert(offsetFrames/30<180);
await mkdir('out',{recursive:true});
await writeFile('out/payproof-demo.srt',srt.join('\n'));
await writeFile('out/timing-report.json',JSON.stringify({fps:30,width:1920,height:1080,frames:offsetFrames,durationSeconds:offsetFrames/30,clips:timing,captionMethod:'Local Whisper small.en; source-relative times, spelling corrected against supplied script',scope:'Recorded app screenshots, synthetic challenge results, and observed actual PayPal Sandbox results. Replay does not reauthenticate historical model or provider claims.'},null,2)+'\n');
console.log(`Validated ${clips.length} narration clips and ${index} caption pages; ${offsetFrames} frames (${(offsetFrames/30).toFixed(3)} seconds).`);
