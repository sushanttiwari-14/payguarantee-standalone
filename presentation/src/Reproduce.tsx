import { Audio } from '@remotion/media';
import { Sequence, staticFile } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { colors, Stage, Title } from './visuals';

export const Reproduce=()=> <Stage chapter="07 / Reproduce the evidence" dark>
 <Title>One command to inspect the proof.</Title>
 <div style={{position:'absolute',left:105,top:345,width:1640,padding:'45px 40px',background:'#244337',borderRadius:30,fontFamily:'DM Mono',fontSize:59,lineHeight:1.5}}><div><span style={{color:colors.mint}}>$ </span>npm run judge:verify</div><div style={{fontFamily:'DM Sans',fontSize:31,opacity:0.7,marginTop:4}}>Two-case comparison and recorded decision replay</div><div style={{marginTop:28}}><span style={{color:colors.mint}}>$ </span>npm run challenge</div><div style={{fontFamily:'DM Sans',fontSize:31,opacity:0.7,marginTop:4}}>Twenty-case challenge and preserved inconclusive outcomes</div></div>
 <div style={{position:'absolute',left:108,top:771,fontSize:41,color:colors.mint}}>No new AI or PayPal call. Imported provenance stays unverified.</div>
 <Sequence from={12} durationInFrames={524} name="Reproduce narration" premountFor={30}>
  <Audio src={staticFile('audio/reproduce.mp3')} />
  <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:52,translate:'160px 0px'}} captions={[
  {
    "text": "A",
    "startMs": 180,
    "endMs": 500,
    "timestampMs": 340,
    "confidence": null
  },
  {
    "text": " reviewer",
    "startMs": 500,
    "endMs": 920,
    "timestampMs": 710,
    "confidence": null
  },
  {
    "text": " can",
    "startMs": 920,
    "endMs": 1340,
    "timestampMs": 1130,
    "confidence": null
  },
  {
    "text": " reproduce",
    "startMs": 1340,
    "endMs": 1680,
    "timestampMs": 1510,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 1680,
    "endMs": 1900,
    "timestampMs": 1790,
    "confidence": null
  },
  {
    "text": " short",
    "startMs": 1900,
    "endMs": 2480,
    "timestampMs": 2190,
    "confidence": null
  },
  {
    "text": " comparison",
    "startMs": 2480,
    "endMs": 3280,
    "timestampMs": 2880,
    "confidence": null
  },
  {
    "text": " or",
    "startMs": 3280,
    "endMs": 3460,
    "timestampMs": 3370,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 3460,
    "endMs": 3760,
    "timestampMs": 3610,
    "confidence": null
  },
  {
    "text": " 20",
    "startMs": 3760,
    "endMs": 4020,
    "timestampMs": 3890,
    "confidence": null
  },
  {
    "text": " case",
    "startMs": 4020,
    "endMs": 4500,
    "timestampMs": 4260,
    "confidence": null
  },
  {
    "text": " challenge",
    "startMs": 4500,
    "endMs": 4800,
    "timestampMs": 4650,
    "confidence": null
  },
  {
    "text": " with",
    "startMs": 4800,
    "endMs": 5040,
    "timestampMs": 4920,
    "confidence": null
  },
  {
    "text": " one",
    "startMs": 5040,
    "endMs": 5460,
    "timestampMs": 5250,
    "confidence": null
  },
  {
    "text": " command.",
    "startMs": 5460,
    "endMs": 5800,
    "timestampMs": 5630,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Replay",
    "startMs": 6180,
    "endMs": 6580,
    "timestampMs": 6380,
    "confidence": null
  },
  {
    "text": " makes",
    "startMs": 6580,
    "endMs": 6920,
    "timestampMs": 6750,
    "confidence": null
  },
  {
    "text": " no",
    "startMs": 6920,
    "endMs": 7140,
    "timestampMs": 7030,
    "confidence": null
  },
  {
    "text": " new",
    "startMs": 7140,
    "endMs": 7480,
    "timestampMs": 7310,
    "confidence": null
  },
  {
    "text": " model",
    "startMs": 7480,
    "endMs": 7840,
    "timestampMs": 7660,
    "confidence": null
  },
  {
    "text": " or",
    "startMs": 7840,
    "endMs": 8200,
    "timestampMs": 8020,
    "confidence": null
  },
  {
    "text": " PayPal",
    "startMs": 8200,
    "endMs": 8660,
    "timestampMs": 8430,
    "confidence": null
  },
  {
    "text": " call.",
    "startMs": 8660,
    "endMs": 8800,
    "timestampMs": 8730,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Imported",
    "startMs": 8980,
    "endMs": 9620,
    "timestampMs": 9300,
    "confidence": null
  },
  {
    "text": " model",
    "startMs": 9620,
    "endMs": 10040,
    "timestampMs": 9830,
    "confidence": null
  },
  {
    "text": " claims",
    "startMs": 10040,
    "endMs": 10460,
    "timestampMs": 10250,
    "confidence": null
  },
  {
    "text": " stay",
    "startMs": 10460,
    "endMs": 10680,
    "timestampMs": 10570,
    "confidence": null
  },
  {
    "text": " unverified",
    "startMs": 10680,
    "endMs": 11680,
    "timestampMs": 11180,
    "confidence": null
  },
  {
    "text": " while",
    "startMs": 11680,
    "endMs": 11840,
    "timestampMs": 11760,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 11840,
    "endMs": 12080,
    "timestampMs": 11960,
    "confidence": null
  },
  {
    "text": " local",
    "startMs": 12080,
    "endMs": 12400,
    "timestampMs": 12240,
    "confidence": null
  },
  {
    "text": " checks",
    "startMs": 12400,
    "endMs": 13100,
    "timestampMs": 12750,
    "confidence": null
  },
  {
    "text": " evaluate",
    "startMs": 13100,
    "endMs": 13300,
    "timestampMs": 13200,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 13300,
    "endMs": 13700,
    "timestampMs": 13500,
    "confidence": null
  },
  {
    "text": " recorded",
    "startMs": 13700,
    "endMs": 14220,
    "timestampMs": 13960,
    "confidence": null
  },
  {
    "text": " inputs",
    "startMs": 14220,
    "endMs": 14460,
    "timestampMs": 14340,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 14460,
    "endMs": 14920,
    "timestampMs": 14690,
    "confidence": null
  },
  {
    "text": " decisions.",
    "startMs": 14920,
    "endMs": 15440,
    "timestampMs": 15180,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Every",
    "startMs": 15740,
    "endMs": 16160,
    "timestampMs": 15950,
    "confidence": null
  },
  {
    "text": " failure",
    "startMs": 16160,
    "endMs": 16640,
    "timestampMs": 16400,
    "confidence": null
  },
  {
    "text": " remains",
    "startMs": 16640,
    "endMs": 17120,
    "timestampMs": 16880,
    "confidence": null
  },
  {
    "text": " visible.",
    "startMs": 17120,
    "endMs": 17440,
    "timestampMs": 17280,
    "confidence": null,
    "pageBreakAfter": true
  }
]} />
 </Sequence>
</Stage>;
