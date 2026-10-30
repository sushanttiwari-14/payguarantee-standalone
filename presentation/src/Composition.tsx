import { Composition, Series } from 'remotion';
import { Opening } from './Opening';
import { Controls } from './Controls';
import { Evidence } from './Evidence';
import { AI } from './AI';
import { Challenge } from './Challenge';
import { PayPal } from './PayPal';
import { Reproduce } from './Reproduce';
import { Closing } from './Closing';

export const Demo = () => <Series>
 <Series.Sequence name="The failure" durationInFrames={419} premountFor={30}><Opening /></Series.Sequence>
 <Series.Sequence name="Three controls" durationInFrames={696} premountFor={30}><Controls /></Series.Sequence>
 <Series.Sequence name="Inspect the case" durationInFrames={494} premountFor={30}><Evidence /></Series.Sequence>
 <Series.Sequence name="Actual model call" durationInFrames={611} premountFor={30}><AI /></Series.Sequence>
 <Series.Sequence name="Wider challenge" durationInFrames={639} premountFor={30}><Challenge /></Series.Sequence>
 <Series.Sequence name="Payment integration" durationInFrames={684} premountFor={30}><PayPal /></Series.Sequence>
 <Series.Sequence name="Reproduce the evidence" durationInFrames={569} premountFor={30}><Reproduce /></Series.Sequence>
 <Series.Sequence name="Before you ship" durationInFrames={643} premountFor={30}><Closing /></Series.Sequence>
</Series>;

export const DemoComposition=()=> <Composition id="PayProof-Demo" component={Demo} durationInFrames={4755} fps={30} width={1920} height={1080} />;
