import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { colors, Stage, Title, Screen, Pill } from './visuals';

export const AI=()=>{
 const frame=useCurrentFrame();
 return <Stage chapter="04 / Actual model call">
  <Title>Real Codex decisions.<br/>Independent checks.</Title>
  <div style={{position:'absolute',left:100,top:435,width:700,fontSize:49,lineHeight:1.35}}><div>Opaque case identities</div><div style={{marginTop:32}}>No expected answers</div><div style={{marginTop:32}}>Saved model + thread</div><div style={{marginTop:32,color:colors.muted}}>Exact model revision unknown</div></div>
  {frame<350?<Screen src="recorded-ai.jpg" sourceWidth={1600} x={1220} y={362} width={508} height={478} scale={1.4} cropX={996} cropY={352}/>:<Screen src="ai-method.jpg" sourceWidth={1600} x={850} y={435} width={970} height={405} scale={1.52} cropX={235} cropY={490}/>}
  <Pill x={100} y={785} amber>Every payment is simulated</Pill>
  <Sequence from={12} durationInFrames={566} name="AI narration" premountFor={30}>
   <Audio src={staticFile('audio/ai.mp3')} />
   <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:52,translate:'160px 0px'}} captions={[
  {
    "text": "This",
    "startMs": 240,
    "endMs": 660,
    "timestampMs": 450,
    "confidence": null
  },
  {
    "text": " comparison",
    "startMs": 660,
    "endMs": 1200,
    "timestampMs": 930,
    "confidence": null
  },
  {
    "text": " also",
    "startMs": 1200,
    "endMs": 1660,
    "timestampMs": 1430,
    "confidence": null
  },
  {
    "text": " contains",
    "startMs": 1660,
    "endMs": 2200,
    "timestampMs": 1930,
    "confidence": null
  },
  {
    "text": " decisions",
    "startMs": 2200,
    "endMs": 2560,
    "timestampMs": 2380,
    "confidence": null
  },
  {
    "text": " from",
    "startMs": 2560,
    "endMs": 2740,
    "timestampMs": 2650,
    "confidence": null
  },
  {
    "text": " a",
    "startMs": 2740,
    "endMs": 3040,
    "timestampMs": 2890,
    "confidence": null
  },
  {
    "text": " real",
    "startMs": 3040,
    "endMs": 3440,
    "timestampMs": 3240,
    "confidence": null
  },
  {
    "text": " Codex",
    "startMs": 3440,
    "endMs": 3980,
    "timestampMs": 3710,
    "confidence": null
  },
  {
    "text": " request.",
    "startMs": 3980,
    "endMs": 4700,
    "timestampMs": 4340,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 4940,
    "endMs": 5180,
    "timestampMs": 5060,
    "confidence": null
  },
  {
    "text": " model",
    "startMs": 5180,
    "endMs": 5700,
    "timestampMs": 5440,
    "confidence": null
  },
  {
    "text": " receives",
    "startMs": 5700,
    "endMs": 6220,
    "timestampMs": 5960,
    "confidence": null
  },
  {
    "text": " opaque",
    "startMs": 6220,
    "endMs": 6540,
    "timestampMs": 6380,
    "confidence": null
  },
  {
    "text": " case",
    "startMs": 6540,
    "endMs": 7040,
    "timestampMs": 6790,
    "confidence": null
  },
  {
    "text": " identities",
    "startMs": 7040,
    "endMs": 7380,
    "timestampMs": 7210,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 7380,
    "endMs": 7800,
    "timestampMs": 7590,
    "confidence": null
  },
  {
    "text": " customer",
    "startMs": 7800,
    "endMs": 8180,
    "timestampMs": 7990,
    "confidence": null
  },
  {
    "text": " facts",
    "startMs": 8180,
    "endMs": 8880,
    "timestampMs": 8530,
    "confidence": null
  },
  {
    "text": " without",
    "startMs": 8880,
    "endMs": 9520,
    "timestampMs": 9200,
    "confidence": null
  },
  {
    "text": " expected",
    "startMs": 9520,
    "endMs": 9960,
    "timestampMs": 9740,
    "confidence": null
  },
  {
    "text": " answers.",
    "startMs": 9960,
    "endMs": 10720,
    "timestampMs": 10340,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Deterministic",
    "startMs": 10880,
    "endMs": 11760,
    "timestampMs": 11320,
    "confidence": null
  },
  {
    "text": " code",
    "startMs": 11760,
    "endMs": 12420,
    "timestampMs": 12090,
    "confidence": null
  },
  {
    "text": " evaluates",
    "startMs": 12420,
    "endMs": 12700,
    "timestampMs": 12560,
    "confidence": null
  },
  {
    "text": " its",
    "startMs": 12700,
    "endMs": 13240,
    "timestampMs": 12970,
    "confidence": null
  },
  {
    "text": " decisions.",
    "startMs": 13240,
    "endMs": 14000,
    "timestampMs": 13620,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 14160,
    "endMs": 14480,
    "timestampMs": 14320,
    "confidence": null
  },
  {
    "text": " model",
    "startMs": 14480,
    "endMs": 14740,
    "timestampMs": 14610,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 14740,
    "endMs": 15020,
    "timestampMs": 14880,
    "confidence": null
  },
  {
    "text": " thread",
    "startMs": 15020,
    "endMs": 15200,
    "timestampMs": 15110,
    "confidence": null
  },
  {
    "text": " are",
    "startMs": 15200,
    "endMs": 15740,
    "timestampMs": 15470,
    "confidence": null
  },
  {
    "text": " recorded,",
    "startMs": 15740,
    "endMs": 16160,
    "timestampMs": 15950,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 16320,
    "endMs": 16440,
    "timestampMs": 16380,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 16440,
    "endMs": 16700,
    "timestampMs": 16570,
    "confidence": null
  },
  {
    "text": " same",
    "startMs": 16700,
    "endMs": 17020,
    "timestampMs": 16860,
    "confidence": null
  },
  {
    "text": " saved",
    "startMs": 17020,
    "endMs": 17460,
    "timestampMs": 17240,
    "confidence": null
  },
  {
    "text": " decisions",
    "startMs": 17460,
    "endMs": 17800,
    "timestampMs": 17630,
    "confidence": null
  },
  {
    "text": " can",
    "startMs": 17800,
    "endMs": 17960,
    "timestampMs": 17880,
    "confidence": null
  },
  {
    "text": " be",
    "startMs": 17960,
    "endMs": 18200,
    "timestampMs": 18080,
    "confidence": null
  },
  {
    "text": " replayed.",
    "startMs": 18200,
    "endMs": 18560,
    "timestampMs": 18380,
    "confidence": null,
    "pageBreakAfter": true
  }
]} />
  </Sequence>
 </Stage>;
};
