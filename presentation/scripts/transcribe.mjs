import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { canUseWhisperWebGpu, downloadWhisperModel, loadWhisperModel, toCaptions, transcribe } from '@remotion/whisper-webgpu';

const support = await canUseWhisperWebGpu();
if (!support.supported) throw new Error(support.detailedReason);
const model = 'small.en';
console.log('Downloading local transcription model');
await downloadWhisperModel({ model });
const handle = await loadWhisperModel({ model });
await mkdir('public/captions', { recursive: true });
try {
  const clips = JSON.parse(await readFile('narration.json', 'utf8'));
  for (const clip of clips.filter((item) => !process.argv[2] || item.name === process.argv[2])) {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', `public/${clip.audio}`, '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
    const waveform = new Float32Array(raw.length / 4);
    for (let i = 0; i < waveform.length; i++) waveform[i] = raw.readFloatLE(i * 4);
    const result = await transcribe({ channelWaveform: waveform, model });
    const { captions } = toCaptions({ whisperWebGpuOutput: result });
    await writeFile(`public/captions/${clip.name}.json`, JSON.stringify(captions, null, 2) + '\n');
    console.log(`${clip.name}: ${captions.length} timed tokens`);
  }
} finally { await handle[Symbol.asyncDispose](); }
