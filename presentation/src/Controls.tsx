import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { colors, Stage, Title, Screen, Pill } from './visuals';

export const Controls=()=>{
 const frame=useCurrentFrame();
 // Align the emphasis with the transcribed start of “second” and “corrected”.
 const focus=frame<344?0:frame<465?1:2;
 return <Stage chapter="02 / Three controls">
  <Title>Stopping every refund also fails.</Title>
  <Pill x={100} y={265}>Same policy. Same customer requests.</Pill>
  <Pill x={1270} y={265} amber>SIMULATED PAYMENTS</Pill>
  <Screen src="controls.jpg" sourceWidth={1280} x={151} y={345} width={1618} height={520} scale={1.45} cropX={82} cropY={353} />
  <div style={{position:'absolute',left:158+focus*535,top:347,width:513,height:513,border:`4px solid ${focus===2?'#365c43':colors.red}`,borderRadius:22,boxSizing:'border-box'}} />
  <Sequence from={12} durationInFrames={651} name="Controls narration" premountFor={30}>
   <Audio src={staticFile('audio/controls.mp3')} />
   <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:52,translate:'160px 0px'}} captions={[
  {
    "text": "These",
    "startMs": 280,
    "endMs": 600,
    "timestampMs": 440,
    "confidence": null
  },
  {
    "text": " three",
    "startMs": 600,
    "endMs": 980,
    "timestampMs": 790,
    "confidence": null
  },
  {
    "text": " teaching",
    "startMs": 980,
    "endMs": 1400,
    "timestampMs": 1190,
    "confidence": null
  },
  {
    "text": " controls",
    "startMs": 1400,
    "endMs": 1780,
    "timestampMs": 1590,
    "confidence": null
  },
  {
    "text": " use",
    "startMs": 1780,
    "endMs": 2340,
    "timestampMs": 2060,
    "confidence": null
  },
  {
    "text": " identical",
    "startMs": 2340,
    "endMs": 2900,
    "timestampMs": 2620,
    "confidence": null
  },
  {
    "text": " inputs.",
    "startMs": 2900,
    "endMs": 3360,
    "timestampMs": 3130,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " $15",
    "startMs": 3520,
    "endMs": 4500,
    "timestampMs": 4010,
    "confidence": null
  },
  {
    "text": " has",
    "startMs": 4500,
    "endMs": 4960,
    "timestampMs": 4730,
    "confidence": null
  },
  {
    "text": " already",
    "startMs": 4960,
    "endMs": 5220,
    "timestampMs": 5090,
    "confidence": null
  },
  {
    "text": " been",
    "startMs": 5220,
    "endMs": 5520,
    "timestampMs": 5370,
    "confidence": null
  },
  {
    "text": " refunded.",
    "startMs": 5520,
    "endMs": 6160,
    "timestampMs": 5840,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 6340,
    "endMs": 6620,
    "timestampMs": 6480,
    "confidence": null
  },
  {
    "text": " first",
    "startMs": 6620,
    "endMs": 6960,
    "timestampMs": 6790,
    "confidence": null
  },
  {
    "text": " agent",
    "startMs": 6960,
    "endMs": 7440,
    "timestampMs": 7200,
    "confidence": null
  },
  {
    "text": " ignores",
    "startMs": 7440,
    "endMs": 7720,
    "timestampMs": 7580,
    "confidence": null
  },
  {
    "text": " that",
    "startMs": 7720,
    "endMs": 8140,
    "timestampMs": 7930,
    "confidence": null
  },
  {
    "text": " history",
    "startMs": 8140,
    "endMs": 8140,
    "timestampMs": 8140,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 8340,
    "endMs": 8660,
    "timestampMs": 8500,
    "confidence": null
  },
  {
    "text": " creates",
    "startMs": 8660,
    "endMs": 8920,
    "timestampMs": 8790,
    "confidence": null
  },
  {
    "text": " $5",
    "startMs": 8920,
    "endMs": 9480,
    "timestampMs": 9200,
    "confidence": null
  },
  {
    "text": " of",
    "startMs": 9480,
    "endMs": 9820,
    "timestampMs": 9650,
    "confidence": null
  },
  {
    "text": " excess.",
    "startMs": 9820,
    "endMs": 10540,
    "timestampMs": 10180,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 10720,
    "endMs": 11060,
    "timestampMs": 10890,
    "confidence": null
  },
  {
    "text": " second",
    "startMs": 11060,
    "endMs": 11600,
    "timestampMs": 11330,
    "confidence": null
  },
  {
    "text": " refuses",
    "startMs": 11600,
    "endMs": 12280,
    "timestampMs": 11940,
    "confidence": null
  },
  {
    "text": " everyone,",
    "startMs": 12280,
    "endMs": 12360,
    "timestampMs": 12320,
    "confidence": null
  },
  {
    "text": " including",
    "startMs": 12760,
    "endMs": 13040,
    "timestampMs": 12900,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 13040,
    "endMs": 13480,
    "timestampMs": 13260,
    "confidence": null
  },
  {
    "text": " legitimate",
    "startMs": 13480,
    "endMs": 14040,
    "timestampMs": 13760,
    "confidence": null
  },
  {
    "text": " customer.",
    "startMs": 14040,
    "endMs": 14540,
    "timestampMs": 14290,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 14700,
    "endMs": 15100,
    "timestampMs": 14900,
    "confidence": null
  },
  {
    "text": " corrected",
    "startMs": 15100,
    "endMs": 15640,
    "timestampMs": 15370,
    "confidence": null
  },
  {
    "text": " reference",
    "startMs": 15640,
    "endMs": 15960,
    "timestampMs": 15800,
    "confidence": null
  },
  {
    "text": " blocks",
    "startMs": 15960,
    "endMs": 16220,
    "timestampMs": 16090,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 16220,
    "endMs": 16620,
    "timestampMs": 16420,
    "confidence": null
  },
  {
    "text": " excess",
    "startMs": 16620,
    "endMs": 16920,
    "timestampMs": 16770,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 17120,
    "endMs": 17540,
    "timestampMs": 17330,
    "confidence": null
  },
  {
    "text": " completes",
    "startMs": 17540,
    "endMs": 17800,
    "timestampMs": 17670,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 17800,
    "endMs": 18140,
    "timestampMs": 17970,
    "confidence": null
  },
  {
    "text": " permitted",
    "startMs": 18140,
    "endMs": 18520,
    "timestampMs": 18330,
    "confidence": null
  },
  {
    "text": " $5",
    "startMs": 18520,
    "endMs": 19300,
    "timestampMs": 18910,
    "confidence": null
  },
  {
    "text": " refund.",
    "startMs": 19300,
    "endMs": 19880,
    "timestampMs": 19590,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " These",
    "startMs": 20140,
    "endMs": 20480,
    "timestampMs": 20310,
    "confidence": null
  },
  {
    "text": " payments",
    "startMs": 20480,
    "endMs": 20700,
    "timestampMs": 20590,
    "confidence": null
  },
  {
    "text": " are",
    "startMs": 20700,
    "endMs": 21160,
    "timestampMs": 20930,
    "confidence": null
  },
  {
    "text": " simulated.",
    "startMs": 21160,
    "endMs": 21520,
    "timestampMs": 21340,
    "confidence": null,
    "pageBreakAfter": true
  }
]} />
  </Sequence>
 </Stage>;
};
