import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { GnaniSession } from './gnani';

const port = Number(process.env.PORT ?? 3000);
const app = express();
const httpServer = createServer(app);

app.get('/health', (_request, response) => response.json({ ok: true, service: 'hisaab-pakka', gnaniConfigured: Boolean(process.env.GNANI_API_KEY_ID) }));

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', (browser) => {
  const send = (message: unknown) => {
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(message));
  };
  const gnani = new GnaniSession({
    onTranscript: (text) => send({ type: 'transcript', text }),
    onStatus: (status) => send({ type: 'status', status }),
    onError: (message) => send({ type: 'error', message }),
  });

  send({ type: 'status', status: gnani.configured ? 'Backend ready — Gnani key protected' : 'Backend ready — Gnani key missing' });

  browser.on('message', async (data, isBinary) => {
    if (isBinary) {
      gnani.sendPcm(Buffer.from(data as Buffer));
      return;
    }
    try {
      const message = JSON.parse(data.toString()) as { type?: string; text?: string };
      if (message.type === 'start-listening') gnani.connectStt();
      if (message.type === 'stop-listening') gnani.commitStt();
      if (message.type === 'speak' && message.text) {
        send({ type: 'audio-start', text: message.text });
        await gnani.speak(message.text, (chunk) => send({ type: 'audio-chunk', audio: chunk.toString('base64') }), () => send({ type: 'audio-end' }));
      }
    } catch {
      send({ type: 'error', message: 'Invalid browser message.' });
    }
  });
  browser.on('close', () => gnani.close());
});

const distDirectory = resolve(process.cwd(), 'dist');
app.use(express.static(distDirectory, { index: 'index.html' }));
app.get(/.*/, (_request, response) => response.sendFile(resolve(distDirectory, 'index.html')));

httpServer.listen(port, '0.0.0.0', () => console.log(`HISAAB PAKKA listening on ${port}`));
