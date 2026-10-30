import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { colors, Stage, Title, Screen } from './visuals';

export const Closing=()=>{
 const frame=useCurrentFrame();
 return <Stage chapter="08 / Before you ship" dark>
  {frame<300?<><Title>Bring your own agent.</Title><div style={{position:'absolute',left:105,top:345,width:800,fontSize:59,lineHeight:1.35}}>Named, versioned decisions.<br/><span style={{color:colors.mint}}>Controlled USD<br/>courtesy refunds.</span></div><Screen src="external-agent.jpg" sourceWidth={1600} x={965} y={325} width={850} height={480} scale={1.2} cropX={255} cropY={375}/></>:<><div style={{position:'absolute',left:105,top:196,fontFamily:'Instrument Serif',fontSize:135,lineHeight:1.03}}>Catch the failure.<br/>Keep the valid refund.<br/><span style={{color:colors.mint}}>Make the proof inspectable.</span></div><div style={{position:'absolute',left:112,top:713,fontSize:39,lineHeight:1.4}}>Next evidence: developer feedback + public judging access.<br/>Controlled test results do not certify production safety.</div></>}
  <Sequence from={12} durationInFrames={598} name="Closing narration" premountFor={30}>
   <Audio src={staticFile('audio/closing.mp3')} />
   <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:52,translate:'160px 0px'}} captions={[
  {
    "text": "PayProof",
    "startMs": 260,
    "endMs": 960,
    "timestampMs": 610,
    "confidence": null
  },
  {
    "text": " supports",
    "startMs": 960,
    "endMs": 1460,
    "timestampMs": 1210,
    "confidence": null
  },
  {
    "text": " named",
    "startMs": 1460,
    "endMs": 1960,
    "timestampMs": 1710,
    "confidence": null
  },
  {
    "text": " versioned",
    "startMs": 1960,
    "endMs": 2640,
    "timestampMs": 2300,
    "confidence": null
  },
  {
    "text": " external",
    "startMs": 2640,
    "endMs": 3200,
    "timestampMs": 2920,
    "confidence": null
  },
  {
    "text": " decisions",
    "startMs": 3200,
    "endMs": 3740,
    "timestampMs": 3470,
    "confidence": null
  },
  {
    "text": " too.",
    "startMs": 3740,
    "endMs": 4080,
    "timestampMs": 3910,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Its",
    "startMs": 4300,
    "endMs": 4620,
    "timestampMs": 4460,
    "confidence": null
  },
  {
    "text": " scope",
    "startMs": 4620,
    "endMs": 4900,
    "timestampMs": 4760,
    "confidence": null
  },
  {
    "text": " is",
    "startMs": 4900,
    "endMs": 5380,
    "timestampMs": 5140,
    "confidence": null
  },
  {
    "text": " controlled",
    "startMs": 5380,
    "endMs": 5880,
    "timestampMs": 5630,
    "confidence": null
  },
  {
    "text": " U.S.",
    "startMs": 5880,
    "endMs": 6160,
    "timestampMs": 6020,
    "confidence": null
  },
  {
    "text": " dollar",
    "startMs": 6160,
    "endMs": 6640,
    "timestampMs": 6400,
    "confidence": null
  },
  {
    "text": " courtesy",
    "startMs": 6640,
    "endMs": 7180,
    "timestampMs": 6910,
    "confidence": null
  },
  {
    "text": " refunds,",
    "startMs": 7180,
    "endMs": 7520,
    "timestampMs": 7350,
    "confidence": null
  },
  {
    "text": " not",
    "startMs": 7800,
    "endMs": 8280,
    "timestampMs": 8040,
    "confidence": null
  },
  {
    "text": " production",
    "startMs": 8280,
    "endMs": 8860,
    "timestampMs": 8570,
    "confidence": null
  },
  {
    "text": " certification.",
    "startMs": 8860,
    "endMs": 9480,
    "timestampMs": 9170,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 9640,
    "endMs": 9880,
    "timestampMs": 9760,
    "confidence": null
  },
  {
    "text": " next",
    "startMs": 9880,
    "endMs": 10120,
    "timestampMs": 10000,
    "confidence": null
  },
  {
    "text": " step",
    "startMs": 10120,
    "endMs": 10300,
    "timestampMs": 10210,
    "confidence": null
  },
  {
    "text": " is",
    "startMs": 10300,
    "endMs": 10600,
    "timestampMs": 10450,
    "confidence": null
  },
  {
    "text": " feedback",
    "startMs": 10600,
    "endMs": 10960,
    "timestampMs": 10780,
    "confidence": null
  },
  {
    "text": " from",
    "startMs": 10960,
    "endMs": 11480,
    "timestampMs": 11220,
    "confidence": null
  },
  {
    "text": " developers",
    "startMs": 11480,
    "endMs": 11520,
    "timestampMs": 11500,
    "confidence": null
  },
  {
    "text": " using",
    "startMs": 11880,
    "endMs": 12200,
    "timestampMs": 12040,
    "confidence": null
  },
  {
    "text": " their",
    "startMs": 12200,
    "endMs": 12440,
    "timestampMs": 12320,
    "confidence": null
  },
  {
    "text": " own",
    "startMs": 12440,
    "endMs": 13000,
    "timestampMs": 12720,
    "confidence": null
  },
  {
    "text": " agents,",
    "startMs": 13000,
    "endMs": 13340,
    "timestampMs": 13170,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " plus",
    "startMs": 13600,
    "endMs": 14000,
    "timestampMs": 13800,
    "confidence": null
  },
  {
    "text": " public",
    "startMs": 14000,
    "endMs": 14360,
    "timestampMs": 14180,
    "confidence": null
  },
  {
    "text": " judging",
    "startMs": 14360,
    "endMs": 14820,
    "timestampMs": 14590,
    "confidence": null
  },
  {
    "text": " access.",
    "startMs": 14820,
    "endMs": 15440,
    "timestampMs": 15130,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Catch",
    "startMs": 15660,
    "endMs": 15900,
    "timestampMs": 15780,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 15900,
    "endMs": 16300,
    "timestampMs": 16100,
    "confidence": null
  },
  {
    "text": " failure.",
    "startMs": 16300,
    "endMs": 16720,
    "timestampMs": 16510,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Keep",
    "startMs": 16920,
    "endMs": 17120,
    "timestampMs": 17020,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 17120,
    "endMs": 17380,
    "timestampMs": 17250,
    "confidence": null
  },
  {
    "text": " valid",
    "startMs": 17380,
    "endMs": 17800,
    "timestampMs": 17590,
    "confidence": null
  },
  {
    "text": " refund.",
    "startMs": 17800,
    "endMs": 18200,
    "timestampMs": 18000,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Make",
    "startMs": 18400,
    "endMs": 18580,
    "timestampMs": 18490,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 18580,
    "endMs": 18820,
    "timestampMs": 18700,
    "confidence": null
  },
  {
    "text": " proof",
    "startMs": 18820,
    "endMs": 19220,
    "timestampMs": 19020,
    "confidence": null
  },
  {
    "text": " inspectable.",
    "startMs": 19220,
    "endMs": 19923,
    "timestampMs": 19571,
    "confidence": null
  }
]} />
  </Sequence>
 </Stage>;
};
