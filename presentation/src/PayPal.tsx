import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BasicCaptions } from './basic-captions';
import { colors, Stage, Title, Screen, Pill } from './visuals';

export const PayPal=()=>{
 const frame=useCurrentFrame();
 return <Stage chapter="06 / Payment integration">
  <Title>PayPal Sandbox</Title>
  <Pill x={103} y={295} amber>Actual account flow: unverified</Pill>
  {frame<325?<><div style={{position:'absolute',left:105,top:425,width:840,fontSize:56,lineHeight:1.4}}>Create an order<br/>Approve as a buyer<br/>Capture, refund, read back</div><Screen src="connections.jpg" sourceWidth={1600} x={1020} y={330} width={795} height={500} scale={1.6} cropX={1125} cropY={240}/></>:<><div style={{position:'absolute',left:103,top:415,fontSize:46,lineHeight:1.45,width:780}}><strong>Separate mocked recovery test</strong><br/><span style={{fontSize:60}}>Server stopped after<br/>a refund response.</span><br/><span style={{color:colors.muted}}>Request saved. Outcome uncertain.<br/>No payment repeated after restart.</span></div><Screen src="recovery-mocked.jpg" sourceWidth={1280} x={1000} y={430} width={810} height={410} scale={0.83} cropX={260} cropY={855} label="MOCK PROVIDER · NO PAYPAL CALLS"/></>}
  <Sequence from={12} durationInFrames={602} name="PayPal narration" premountFor={30}>
   <Audio src={staticFile('audio/paypal.mp3')} />
   <BasicCaptions combineTokensWithinMilliseconds={2000} width={1600} style={{position:'absolute',bottom:52,translate:'160px 0px'}} captions={[
  {
    "text": "The",
    "startMs": 220,
    "endMs": 540,
    "timestampMs": 380,
    "confidence": null
  },
  {
    "text": " PayPal",
    "startMs": 540,
    "endMs": 840,
    "timestampMs": 690,
    "confidence": null
  },
  {
    "text": " Sandbox",
    "startMs": 840,
    "endMs": 1380,
    "timestampMs": 1110,
    "confidence": null
  },
  {
    "text": " adapter",
    "startMs": 1380,
    "endMs": 1940,
    "timestampMs": 1660,
    "confidence": null
  },
  {
    "text": " prepares",
    "startMs": 1940,
    "endMs": 2440,
    "timestampMs": 2190,
    "confidence": null
  },
  {
    "text": " orders,",
    "startMs": 2440,
    "endMs": 3280,
    "timestampMs": 2860,
    "confidence": null
  },
  {
    "text": " captures",
    "startMs": 3280,
    "endMs": 3620,
    "timestampMs": 3450,
    "confidence": null
  },
  {
    "text": " approved",
    "startMs": 3620,
    "endMs": 4060,
    "timestampMs": 3840,
    "confidence": null
  },
  {
    "text": " payments,",
    "startMs": 4060,
    "endMs": 4480,
    "timestampMs": 4270,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 4640,
    "endMs": 4960,
    "timestampMs": 4800,
    "confidence": null
  },
  {
    "text": " reads",
    "startMs": 4960,
    "endMs": 5400,
    "timestampMs": 5180,
    "confidence": null
  },
  {
    "text": " refund",
    "startMs": 5400,
    "endMs": 5820,
    "timestampMs": 5610,
    "confidence": null
  },
  {
    "text": " state.",
    "startMs": 5820,
    "endMs": 6000,
    "timestampMs": 5910,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Its",
    "startMs": 6400,
    "endMs": 6900,
    "timestampMs": 6650,
    "confidence": null
  },
  {
    "text": " actual",
    "startMs": 6900,
    "endMs": 7340,
    "timestampMs": 7120,
    "confidence": null
  },
  {
    "text": " account",
    "startMs": 7340,
    "endMs": 7620,
    "timestampMs": 7480,
    "confidence": null
  },
  {
    "text": " flow",
    "startMs": 7620,
    "endMs": 7860,
    "timestampMs": 7740,
    "confidence": null
  },
  {
    "text": " is",
    "startMs": 7860,
    "endMs": 8160,
    "timestampMs": 8010,
    "confidence": null
  },
  {
    "text": " still",
    "startMs": 8160,
    "endMs": 8400,
    "timestampMs": 8280,
    "confidence": null
  },
  {
    "text": " unverified.",
    "startMs": 8400,
    "endMs": 9000,
    "timestampMs": 8700,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " A",
    "startMs": 9480,
    "endMs": 9860,
    "timestampMs": 9670,
    "confidence": null
  },
  {
    "text": " separate",
    "startMs": 9860,
    "endMs": 10140,
    "timestampMs": 10000,
    "confidence": null
  },
  {
    "text": " mocked",
    "startMs": 10140,
    "endMs": 10740,
    "timestampMs": 10440,
    "confidence": null
  },
  {
    "text": " recovery",
    "startMs": 10740,
    "endMs": 11200,
    "timestampMs": 10970,
    "confidence": null
  },
  {
    "text": " test",
    "startMs": 11200,
    "endMs": 11660,
    "timestampMs": 11430,
    "confidence": null
  },
  {
    "text": " stopped",
    "startMs": 11660,
    "endMs": 11880,
    "timestampMs": 11770,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 11880,
    "endMs": 12240,
    "timestampMs": 12060,
    "confidence": null
  },
  {
    "text": " server",
    "startMs": 12240,
    "endMs": 12640,
    "timestampMs": 12440,
    "confidence": null
  },
  {
    "text": " after",
    "startMs": 12640,
    "endMs": 12900,
    "timestampMs": 12770,
    "confidence": null
  },
  {
    "text": " a",
    "startMs": 12900,
    "endMs": 13180,
    "timestampMs": 13040,
    "confidence": null
  },
  {
    "text": " refund",
    "startMs": 13180,
    "endMs": 13720,
    "timestampMs": 13450,
    "confidence": null
  },
  {
    "text": " response.",
    "startMs": 13720,
    "endMs": 14000,
    "timestampMs": 13860,
    "confidence": null,
    "pageBreakAfter": true
  },
  {
    "text": " Restart",
    "startMs": 14640,
    "endMs": 15380,
    "timestampMs": 15010,
    "confidence": null
  },
  {
    "text": " retained",
    "startMs": 15380,
    "endMs": 15560,
    "timestampMs": 15470,
    "confidence": null
  },
  {
    "text": " the",
    "startMs": 15560,
    "endMs": 15880,
    "timestampMs": 15720,
    "confidence": null
  },
  {
    "text": " request",
    "startMs": 15880,
    "endMs": 16440,
    "timestampMs": 16160,
    "confidence": null
  },
  {
    "text": " identity",
    "startMs": 16440,
    "endMs": 16920,
    "timestampMs": 16680,
    "confidence": null
  },
  {
    "text": " and",
    "startMs": 16920,
    "endMs": 17420,
    "timestampMs": 17170,
    "confidence": null
  },
  {
    "text": " uncertain",
    "startMs": 17420,
    "endMs": 17980,
    "timestampMs": 17700,
    "confidence": null
  },
  {
    "text": " outcome",
    "startMs": 17980,
    "endMs": 18600,
    "timestampMs": 18290,
    "confidence": null
  },
  {
    "text": " without",
    "startMs": 18600,
    "endMs": 19060,
    "timestampMs": 18830,
    "confidence": null
  },
  {
    "text": " repeating",
    "startMs": 19060,
    "endMs": 19300,
    "timestampMs": 19180,
    "confidence": null
  },
  {
    "text": " a",
    "startMs": 19300,
    "endMs": 19580,
    "timestampMs": 19440,
    "confidence": null
  },
  {
    "text": " payment.",
    "startMs": 19580,
    "endMs": 20000,
    "timestampMs": 19790,
    "confidence": null,
    "pageBreakAfter": true
  }
]} />
  </Sequence>
 </Stage>;
};
