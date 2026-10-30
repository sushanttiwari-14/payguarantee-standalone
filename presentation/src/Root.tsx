import { Composition, Folder } from 'remotion';
import { DemoComposition } from './Composition';
import { Opening } from './Opening';
import { Controls } from './Controls';
import { Evidence } from './Evidence';
import { AI } from './AI';
import { Challenge } from './Challenge';
import { PayPal } from './PayPal';
import { Reproduce } from './Reproduce';
import { Closing } from './Closing';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <DemoComposition />
      <Folder name="Scenes">
       <Composition id="Opening" component={Opening} durationInFrames={419} fps={30} width={1920} height={1080}/>
       <Composition id="Controls" component={Controls} durationInFrames={696} fps={30} width={1920} height={1080}/>
       <Composition id="Evidence" component={Evidence} durationInFrames={494} fps={30} width={1920} height={1080}/>
       <Composition id="AI" component={AI} durationInFrames={611} fps={30} width={1920} height={1080}/>
       <Composition id="Challenge" component={Challenge} durationInFrames={639} fps={30} width={1920} height={1080}/>
       <Composition id="PayPal" component={PayPal} durationInFrames={684} fps={30} width={1920} height={1080}/>
       <Composition id="Reproduce" component={Reproduce} durationInFrames={569} fps={30} width={1920} height={1080}/>
       <Composition id="Closing" component={Closing} durationInFrames={643} fps={30} width={1920} height={1080}/>
      </Folder>
    </>
  );
};
