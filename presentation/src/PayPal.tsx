import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { colors, Stage, Title, Screen, Pill } from './visuals';

export const PayPal = () => {
 const frame = useCurrentFrame();
 const { fps } = useVideoConfig();
 return <Stage chapter="06 / Observed Sandbox evidence">
  <Title>Now follow real test funds.</Title>
  <Pill x={103} y={290}>Actual PayPal Sandbox · recorded evidence</Pill>
  {frame < 13.5 * fps ? <>
   <div style={{position:'absolute',left:105,top:402,width:560,lineHeight:1.18}}>
    <div style={{fontSize:38,color:colors.muted}}>Seeded policy defect</div>
    <div style={{fontFamily:'Instrument Serif',fontSize:126,marginTop:10}}>$25</div>
    <div style={{fontSize:48,marginTop:23}}>refunded · $20 limit</div>
    <div style={{fontSize:55,color:colors.red,marginTop:20}}>+$5 excess · caught</div>
    <div style={{fontSize:27,color:colors.muted,marginTop:30}}>Corrected controls: excess blocked,<br/>permitted $5 completed.</div>
   </div>
   <Screen src="sandbox-seeded-full.jpg" sourceWidth={1280} x={720} y={410} width={1095} height={405} scale={1.16} cropX={290} cropY={2030} label="ACTUAL SANDBOX · SEEDED CONTROL"/>
  </> : <>
   <div style={{position:'absolute',left:105,top:402,width:555,lineHeight:1.2}}>
    <div style={{fontSize:38,color:colors.muted}}>Fresh Codex + Sandbox</div>
    <div style={{fontFamily:'Instrument Serif',fontSize:126,marginTop:10}}>2 / 2</div>
    <div style={{fontSize:35,marginTop:24}}>passed · 1 / 1 valid refund</div>
    <div style={{fontSize:44,marginTop:20}}>$0 policy excess</div>
    <div style={{fontSize:27,color:colors.muted,marginTop:30}}>Independent refund readbacks.<br/>Two cases; no reliability claim.</div>
   </div>
   {frame < 18.7 * fps ? <Screen src="sandbox-ai-summary.jpg" sourceWidth={1280} x={720} y={400} width={1095} height={420} scale={1.1} cropX={266} cropY={310}/>
    : <Screen src="sandbox-ai-payments.jpg" sourceWidth={1280} x={720} y={400} width={1095} height={420} scale={1.1} cropX={285} cropY={190} label="INDEPENDENT PAYPAL READBACKS"/>}
  </>}
  <Sequence from={0.4 * fps} durationInFrames={21.3 * fps} name="PayPal narration" premountFor={fps}>
   <Audio src={staticFile('audio/paypal.mp3')} premountFor={fps}/>
   <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:52,translate:'160px 0px'}} captions={[
  {
    "text": "We",
    "startMs": 200,
    "endMs": 400,
    "timestampMs": 300,
    "confidence": null
  },
  {
    "text": " then",
    "startMs": 400,
    "endMs": 840,
    "timestampMs": 620,
    "confidence": null
  },
  {
    "text": " tested",
    "startMs": 840,
    "endMs": 1500,
    "timestampMs": 1170,
    "confidence": null
  },
  {
    "text": " actual",
    "startMs": 1500,
    "endMs": 2060,
    "timestampMs": 1780,
    "confidence": null
  },
  {
    "text": " PayPal",
    "startMs": 2060,
    "endMs": 2440,
    "timestampMs": 2250,
    "confidence": null
  },
  {
    "text": " Sandbox",
    "startMs": 2440,
    "endMs": 3160,
    "timestampMs": 2800,
    "confidence": null
  },
  {
    "text": " payments.",
    "startMs": 3160,
    "endMs": 3640,
    "timestampMs": 3400,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 3860,
    "endMs": 4160,
    "timestampMs": 4010,
    "confidence": null
  },
  {
    "text": " seeded",
    "startMs": 4160,
    "endMs": 4620,
    "timestampMs": 4390,
    "confidence": null
  },
  {
    "text": " defect",
    "startMs": 4620,
    "endMs": 5140,
    "timestampMs": 4880,
    "confidence": null
  },
  {
    "text": " completed",
    "startMs": 5140,
    "endMs": 5460,
    "timestampMs": 5300,
    "confidence": null
  },
  {
    "text": " $10",
    "startMs": 5460,
    "endMs": 6540,
    "timestampMs": 6000,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 6540,
    "endMs": 6940,
    "timestampMs": 6740,
    "confidence": null
  },
  {
    "text": " exceeded",
    "startMs": 6940,
    "endMs": 7340,
    "timestampMs": 7140,
    "confidence": null
  },
  {
    "text": " policy",
    "startMs": 7340,
    "endMs": 7660,
    "timestampMs": 7500,
    "confidence": null
  },
  {
    "text": " by",
    "startMs": 7660,
    "endMs": 8040,
    "timestampMs": 7850,
    "confidence": null
  },
  {
    "text": " five.",
    "startMs": 8040,
    "endMs": 8520,
    "timestampMs": 8280,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 8700,
    "endMs": 9060,
    "timestampMs": 8880,
    "confidence": null
  },
  {
    "text": " corrected",
    "startMs": 9060,
    "endMs": 9700,
    "timestampMs": 9380,
    "confidence": null
  },
  {
    "text": " controls",
    "startMs": 9700,
    "endMs": 10040,
    "timestampMs": 9870,
    "confidence": null
  },
  {
    "text": " blocked",
    "startMs": 10040,
    "endMs": 10260,
    "timestampMs": 10150,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 10260,
    "endMs": 10660,
    "timestampMs": 10460,
    "confidence": null
  },
  {
    "text": " excess",
    "startMs": 10660,
    "endMs": 10840,
    "timestampMs": 10750,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 11140,
    "endMs": 11440,
    "timestampMs": 11290,
    "confidence": null
  },
  {
    "text": " paid",
    "startMs": 11440,
    "endMs": 11660,
    "timestampMs": 11550,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 11660,
    "endMs": 11940,
    "timestampMs": 11800,
    "confidence": null
  },
  {
    "text": " valid",
    "startMs": 11940,
    "endMs": 12400,
    "timestampMs": 12170,
    "confidence": null
  },
  {
    "text": " refund.",
    "startMs": 12400,
    "endMs": 12920,
    "timestampMs": 12660,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " A",
    "startMs": 13100,
    "endMs": 13400,
    "timestampMs": 13250,
    "confidence": null
  },
  {
    "text": " fresh",
    "startMs": 13400,
    "endMs": 13800,
    "timestampMs": 13600,
    "confidence": null
  },
  {
    "text": " Codex",
    "startMs": 13800,
    "endMs": 14160,
    "timestampMs": 13980,
    "confidence": null
  },
  {
    "text": " run",
    "startMs": 14160,
    "endMs": 14760,
    "timestampMs": 14460,
    "confidence": null
  },
  {
    "text": " also",
    "startMs": 14760,
    "endMs": 15120,
    "timestampMs": 14940,
    "confidence": null
  },
  {
    "text": " passed",
    "startMs": 15120,
    "endMs": 15360,
    "timestampMs": 15240,
    "confidence": null
  },
  {
    "text": " both",
    "startMs": 15360,
    "endMs": 15860,
    "timestampMs": 15610,
    "confidence": null
  },
  {
    "text": " cases",
    "startMs": 15860,
    "endMs": 16320,
    "timestampMs": 16090,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " with",
    "startMs": 16520,
    "endMs": 17160,
    "timestampMs": 16840,
    "confidence": null
  },
  {
    "text": " independent",
    "startMs": 17160,
    "endMs": 17620,
    "timestampMs": 17390,
    "confidence": null
  },
  {
    "text": " refund",
    "startMs": 17620,
    "endMs": 17900,
    "timestampMs": 17760,
    "confidence": null
  },
  {
    "text": " readbacks.",
    "startMs": 17900,
    "endMs": 18620,
    "timestampMs": 18260,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " These",
    "startMs": 18840,
    "endMs": 19000,
    "timestampMs": 18920,
    "confidence": null
  },
  {
    "text": " are",
    "startMs": 19000,
    "endMs": 19260,
    "timestampMs": 19130,
    "confidence": null
  },
  {
    "text": " test",
    "startMs": 19260,
    "endMs": 19600,
    "timestampMs": 19430,
    "confidence": null
  },
  {
    "text": " funds",
    "startMs": 19600,
    "endMs": 19820,
    "timestampMs": 19710,
    "confidence": null
  },
  {
    "text": " on",
    "startMs": 19820,
    "endMs": 20220,
    "timestampMs": 20020,
    "confidence": null
  },
  {
    "text": " controlled",
    "startMs": 20220,
    "endMs": 20780,
    "timestampMs": 20500,
    "confidence": null
  },
  {
    "text": " captures.",
    "startMs": 20780,
    "endMs": 21270,
    "timestampMs": 21025,
    "confidence": null
  }
]} />
  </Sequence>
 </Stage>;
};
