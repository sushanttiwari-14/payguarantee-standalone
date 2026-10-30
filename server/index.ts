import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';

const port = Number(process.env.PORT || 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
const app = createApp(undefined, port);
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.includes('--production')) {
  app.use(express.static(`${root}dist`));
  app.get('/{*path}', (_req, res) => res.sendFile(`${root}dist/index.html`));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(port, '127.0.0.1', () => console.log(`PayProof is ready at http://127.0.0.1:${port} (local only).`));
server.requestTimeout = 240000;
