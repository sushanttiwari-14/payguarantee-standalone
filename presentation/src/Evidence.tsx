import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { Stage, Title, Screen, Pill } from './visuals';

export const Evidence=()=>{
 const frame=useCurrentFrame();
 const outcome=frame>=200;
 return <Stage chapter="03 / Inspect the case">
  <Title>Follow the decision to the money.</Title>
  <Pill x={100} y={265}>{outcome?'Independent outcome checks':'Saved inputs · trusted facts · customer text'}</Pill>
  <Screen src={outcome?'case-outcome.jpg':'case-inputs.jpg'} sourceWidth={1280} x={210} y={350} width={1500} height={outcome?490:460} scale={1.5} cropX={265} cropY={outcome?89:159} />
  <Sequence from={12} durationInFrames={449} name="Evidence narration" premountFor={30}>
   <Audio src={staticFile('audio/evidence.mp3')} />
   <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:52,translate:'160px 0px'}} captions={[
  {
    "text": "Open",
    "startMs": 300,
    "endMs": 560,
    "timestampMs": 430,
    "confidence": null
  },
  {
    "text": " any",
    "startMs": 560,
    "endMs": 820,
    "timestampMs": 690,
    "confidence": null
  },
  {
    "text": " case",
    "startMs": 820,
    "endMs": 1080,
    "timestampMs": 950,
    "confidence": null
  },
  {
    "text": " to",
    "startMs": 1080,
    "endMs": 1280,
    "timestampMs": 1180,
    "confidence": null
  },
  {
    "text": " see",
    "startMs": 1280,
    "endMs": 1500,
    "timestampMs": 1390,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 1500,
    "endMs": 1760,
    "timestampMs": 1630,
    "confidence": null
  },
  {
    "text": " saved",
    "startMs": 1760,
    "endMs": 2220,
    "timestampMs": 1990,
    "confidence": null
  },
  {
    "text": " customer",
    "startMs": 2220,
    "endMs": 2720,
    "timestampMs": 2470,
    "confidence": null
  },
  {
    "text": " request,",
    "startMs": 2720,
    "endMs": 3620,
    "timestampMs": 3170,
    "confidence": null
  },
  {
    "text": " trusted",
    "startMs": 3620,
    "endMs": 3960,
    "timestampMs": 3790,
    "confidence": null
  },
  {
    "text": " payment",
    "startMs": 3960,
    "endMs": 4320,
    "timestampMs": 4140,
    "confidence": null
  },
  {
    "text": " facts,",
    "startMs": 4320,
    "endMs": 4780,
    "timestampMs": 4550,
    "confidence": null
  },
  {
    "text": " proposed",
    "startMs": 5020,
    "endMs": 5620,
    "timestampMs": 5320,
    "confidence": null
  },
  {
    "text": " action,",
    "startMs": 5620,
    "endMs": 5920,
    "timestampMs": 5770,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 6040,
    "endMs": 6040,
    "timestampMs": 6040,
    "confidence": null
  },
  {
    "text": " independent",
    "startMs": 6440,
    "endMs": 6920,
    "timestampMs": 6680,
    "confidence": null
  },
  {
    "text": " checks.",
    "startMs": 6920,
    "endMs": 7440,
    "timestampMs": 7180,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " The",
    "startMs": 7580,
    "endMs": 7880,
    "timestampMs": 7730,
    "confidence": null
  },
  {
    "text": " report",
    "startMs": 7880,
    "endMs": 8320,
    "timestampMs": 8100,
    "confidence": null
  },
  {
    "text": " follows",
    "startMs": 8320,
    "endMs": 8580,
    "timestampMs": 8450,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 8580,
    "endMs": 8940,
    "timestampMs": 8760,
    "confidence": null
  },
  {
    "text": " decision",
    "startMs": 8940,
    "endMs": 9240,
    "timestampMs": 9090,
    "confidence": null
  },
  {
    "text": " to",
    "startMs": 9240,
    "endMs": 9380,
    "timestampMs": 9310,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 9380,
    "endMs": 9580,
    "timestampMs": 9480,
    "confidence": null
  },
  {
    "text": " money.",
    "startMs": 9580,
    "endMs": 9960,
    "timestampMs": 9770,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " A",
    "startMs": 10100,
    "endMs": 10520,
    "timestampMs": 10310,
    "confidence": null
  },
  {
    "text": " successful",
    "startMs": 10520,
    "endMs": 11000,
    "timestampMs": 10760,
    "confidence": null
  },
  {
    "text": " tool",
    "startMs": 11000,
    "endMs": 11580,
    "timestampMs": 11290,
    "confidence": null
  },
  {
    "text": " response",
    "startMs": 11580,
    "endMs": 12040,
    "timestampMs": 11810,
    "confidence": null
  },
  {
    "text": " is",
    "startMs": 12040,
    "endMs": 12320,
    "timestampMs": 12180,
    "confidence": null
  },
  {
    "text": " only",
    "startMs": 12320,
    "endMs": 12460,
    "timestampMs": 12390,
    "confidence": null
  },
  {
    "text": " a",
    "startMs": 12460,
    "endMs": 12680,
    "timestampMs": 12570,
    "confidence": null
  },
  {
    "text": " claim",
    "startMs": 12680,
    "endMs": 13020,
    "timestampMs": 12850,
    "confidence": null
  },
  {
    "text": " until",
    "startMs": 13020,
    "endMs": 13280,
    "timestampMs": 13150,
    "confidence": null
  },
  {
    "text": " readback",
    "startMs": 13280,
    "endMs": 13900,
    "timestampMs": 13590,
    "confidence": null
  },
  {
    "text": " confirms",
    "startMs": 13900,
    "endMs": 14180,
    "timestampMs": 14040,
    "confidence": null
  },
  {
    "text": " what",
    "startMs": 14180,
    "endMs": 14520,
    "timestampMs": 14350,
    "confidence": null
  },
  {
    "text": " happened.",
    "startMs": 14520,
    "endMs": 14640,
    "timestampMs": 14580,
    "confidence": null,
    "pageBreakAfter": true
  }
]} />
  </Sequence>
 </Stage>;
};
