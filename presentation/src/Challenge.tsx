import { Audio } from '@remotion/media';
import { Sequence, staticFile } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { colors, Stage, Title, Metric } from './visuals';

export const Challenge=()=> <Stage chapter="05 / Wider challenge">
 <Title>20 fixed cases. One fresh batch.</Title>
 <div style={{position:'absolute',left:100,top:335,width:1720,display:'flex',gap:26}}><Metric value="18" label="passed"/><Metric value="0" label="failed"/><Metric value="2" label="inconclusive" color={colors.red}/></div>
 <div style={{position:'absolute',left:110,top:645,width:1700,fontSize:44,lineHeight:1.45}}><strong>10 / 12</strong> legitimate refund cases passed.<br/>Two payment records were pending or unavailable.</div>
 <div style={{position:'absolute',left:110,top:809,fontFamily:'DM Mono',fontSize:27,color:colors.muted}}>SYNTHETIC CASES · SIMULATED PAYMENTS · ONE OBSERVED CODEX BATCH</div>
 <Sequence from={12} durationInFrames={594} name="Challenge narration" premountFor={30}>
  <Audio src={staticFile('audio/challenge.mp3')} />
  <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:60,translate:'160px 0px'}} captions={[
  {
    "text": "We",
    "startMs": 180,
    "endMs": 400,
    "timestampMs": 290,
    "confidence": null
  },
  {
    "text": " then",
    "startMs": 400,
    "endMs": 820,
    "timestampMs": 610,
    "confidence": null
  },
  {
    "text": " fixed",
    "startMs": 820,
    "endMs": 1280,
    "timestampMs": 1050,
    "confidence": null
  },
  {
    "text": " 20",
    "startMs": 1280,
    "endMs": 1720,
    "timestampMs": 1500,
    "confidence": null
  },
  {
    "text": " synthetic",
    "startMs": 1720,
    "endMs": 2180,
    "timestampMs": 1950,
    "confidence": null
  },
  {
    "text": " cases",
    "startMs": 2180,
    "endMs": 2640,
    "timestampMs": 2410,
    "confidence": null
  },
  {
    "text": " before",
    "startMs": 2640,
    "endMs": 3000,
    "timestampMs": 2820,
    "confidence": null
  },
  {
    "text": " one",
    "startMs": 3000,
    "endMs": 3320,
    "timestampMs": 3160,
    "confidence": null
  },
  {
    "text": " fresh",
    "startMs": 3320,
    "endMs": 3680,
    "timestampMs": 3500,
    "confidence": null
  },
  {
    "text": " model",
    "startMs": 3680,
    "endMs": 4000,
    "timestampMs": 3840,
    "confidence": null
  },
  {
    "text": " batch.",
    "startMs": 4000,
    "endMs": 4600,
    "timestampMs": 4300,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " It",
    "startMs": 4820,
    "endMs": 5140,
    "timestampMs": 4980,
    "confidence": null
  },
  {
    "text": " passed",
    "startMs": 5140,
    "endMs": 5740,
    "timestampMs": 5440,
    "confidence": null
  },
  {
    "text": " 18",
    "startMs": 5740,
    "endMs": 6200,
    "timestampMs": 5970,
    "confidence": null
  },
  {
    "text": " with",
    "startMs": 6200,
    "endMs": 6480,
    "timestampMs": 6340,
    "confidence": null
  },
  {
    "text": " no",
    "startMs": 6480,
    "endMs": 6920,
    "timestampMs": 6700,
    "confidence": null
  },
  {
    "text": " failures.",
    "startMs": 6920,
    "endMs": 7520,
    "timestampMs": 7220,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Two",
    "startMs": 7840,
    "endMs": 8240,
    "timestampMs": 8040,
    "confidence": null
  },
  {
    "text": " stayed",
    "startMs": 8240,
    "endMs": 8600,
    "timestampMs": 8420,
    "confidence": null
  },
  {
    "text": " inconclusive",
    "startMs": 8600,
    "endMs": 9480,
    "timestampMs": 9040,
    "confidence": null
  },
  {
    "text": " because",
    "startMs": 9480,
    "endMs": 9820,
    "timestampMs": 9650,
    "confidence": null
  },
  {
    "text": " payment",
    "startMs": 9820,
    "endMs": 10180,
    "timestampMs": 10000,
    "confidence": null
  },
  {
    "text": " evidence",
    "startMs": 10180,
    "endMs": 10400,
    "timestampMs": 10290,
    "confidence": null
  },
  {
    "text": " was",
    "startMs": 10400,
    "endMs": 10820,
    "timestampMs": 10610,
    "confidence": null
  },
  {
    "text": " deliberately",
    "startMs": 10820,
    "endMs": 11280,
    "timestampMs": 11050,
    "confidence": null
  },
  {
    "text": " pending",
    "startMs": 11280,
    "endMs": 11720,
    "timestampMs": 11500,
    "confidence": null
  },
  {
    "text": " or",
    "startMs": 11720,
    "endMs": 12180,
    "timestampMs": 11950,
    "confidence": null
  },
  {
    "text": " unavailable.",
    "startMs": 12180,
    "endMs": 12720,
    "timestampMs": 12450,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Ten",
    "startMs": 13000,
    "endMs": 13180,
    "timestampMs": 13090,
    "confidence": null
  },
  {
    "text": " of",
    "startMs": 13180,
    "endMs": 13480,
    "timestampMs": 13330,
    "confidence": null
  },
  {
    "text": " 12",
    "startMs": 13480,
    "endMs": 13920,
    "timestampMs": 13700,
    "confidence": null
  },
  {
    "text": " legitimate",
    "startMs": 13920,
    "endMs": 14460,
    "timestampMs": 14190,
    "confidence": null
  },
  {
    "text": " cases",
    "startMs": 14460,
    "endMs": 14840,
    "timestampMs": 14650,
    "confidence": null
  },
  {
    "text": " passed.",
    "startMs": 14840,
    "endMs": 15240,
    "timestampMs": 15040,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " One",
    "startMs": 15540,
    "endMs": 15880,
    "timestampMs": 15710,
    "confidence": null
  },
  {
    "text": " batch",
    "startMs": 15880,
    "endMs": 16480,
    "timestampMs": 16180,
    "confidence": null
  },
  {
    "text": " demonstrates",
    "startMs": 16480,
    "endMs": 17000,
    "timestampMs": 16740,
    "confidence": null
  },
  {
    "text": " coverage.",
    "startMs": 17000,
    "endMs": 17400,
    "timestampMs": 17200,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " It",
    "startMs": 17620,
    "endMs": 17780,
    "timestampMs": 17700,
    "confidence": null
  },
  {
    "text": " is",
    "startMs": 17780,
    "endMs": 18040,
    "timestampMs": 17910,
    "confidence": null
  },
  {
    "text": " not",
    "startMs": 18040,
    "endMs": 18180,
    "timestampMs": 18110,
    "confidence": null
  },
  {
    "text": " a",
    "startMs": 18180,
    "endMs": 18680,
    "timestampMs": 18430,
    "confidence": null
  },
  {
    "text": " reliability",
    "startMs": 18680,
    "endMs": 19300,
    "timestampMs": 18990,
    "confidence": null
  },
  {
    "text": " benchmark.",
    "startMs": 19300,
    "endMs": 19440,
    "timestampMs": 19370,
    "confidence": null,
    "pageBreakAfter": true
  }
]} />
 </Sequence>
</Stage>;
