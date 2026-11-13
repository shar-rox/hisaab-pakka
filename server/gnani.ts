import WebSocket from 'ws';

const STT_URL = 'wss://api.vachana.ai/stt/v3/stream';
const TTS_URL = 'wss://api.vachana.ai/api/v1/tts';

export type GnaniHandlers = {
  onTranscript: (text: string) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
};

export class GnaniSession {
  private stt?: WebSocket;
  private pendingPcm: Buffer[] = [];
  private readonly apiKey: string;
  private lastTranscriptKey = '';
  private lastTranscriptAt = 0;

  constructor(private readonly handlers: GnaniHandlers) {
    this.apiKey = process.env.GNANI_API_KEY_ID ?? '';
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  connectStt(): void {
    if (!this.apiKey) {
      this.handlers.onError('GNANI_API_KEY_ID is not configured. Add it to the protected project environment.');
      return;
    }
    this.stt?.close();
    this.stt = new WebSocket(STT_URL, {
      headers: {
        'x-api-key-id': this.apiKey,
        model: 'prisma-v3.0',
        language_code: 'indic-auto',
        format: 'transliterate',
        'x-sample-rate': '16000',
        'x-vad-threshold': '0.6',
        'x-min-silence-ms': '220',
        'x-min-speech-ms': '80',
        'x-min-segment-ms': '100',
        'x-idle-timeout-sec': '120',
      },
    });
    this.stt.on('open', () => {
      this.handlers.onStatus('Prisma v3.0 connected');
      for (const chunk of this.pendingPcm.splice(0)) this.stt?.send(chunk);
    });
    this.stt.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; text?: string; message?: string; is_final?: boolean; segment_id?: string };
        if (message.type === 'transcript' && message.text && message.is_final !== false) {
          const transcriptKey = `${message.segment_id ?? ''}:${message.text.trim().toLowerCase()}`;
          const now = Date.now();
          const duplicate = transcriptKey === this.lastTranscriptKey && now - this.lastTranscriptAt < 1500;
          this.lastTranscriptKey = transcriptKey;
          this.lastTranscriptAt = now;
          if (!duplicate) this.handlers.onTranscript(message.text);
        }
        if (message.type === 'error') this.handlers.onError(message.message ?? 'Prisma transcription error');
        if (message.type === 'connected') this.handlers.onStatus('Prisma v3.0 ready');
      } catch {
        this.handlers.onError('Could not parse Prisma response.');
      }
    });
    this.stt.on('error', () => this.handlers.onError('Prisma WebSocket connection failed.'));
    this.stt.on('close', () => this.handlers.onStatus('Prisma connection closed'));
  }

  sendPcm(chunk: Buffer): void {
    if (this.stt?.readyState === WebSocket.OPEN) {
      this.stt.send(chunk);
      return;
    }
    if (this.stt?.readyState === WebSocket.CONNECTING && this.pendingPcm.length < 12) this.pendingPcm.push(chunk);
  }

  commitStt(): void {
    if (this.stt?.readyState === WebSocket.OPEN) this.stt.send(JSON.stringify({ type: 'commit' }));
  }

  async speak(text: string, onChunk: (chunk: Buffer) => void, onDone: () => void): Promise<void> {
    if (!this.apiKey) {
      this.handlers.onError('TTS unavailable until GNANI_API_KEY_ID is configured.');
      onDone();
      return;
    }
    const tts = new WebSocket(TTS_URL, { headers: { 'X-API-Key-ID': this.apiKey } });
    tts.on('open', () => {
      tts.send(JSON.stringify({
        text,
        voice: 'Shivani',
        model: 'timbre-v3.0',
        language: 'hi-en',
        speed: 1.12,
        audio_config: {
          sample_rate: 48000,
          num_channels: 1,
          sample_width: 2,
          encoding: 'linear_pcm',
          container: 'raw',
        },
      }));
    });
    tts.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; data?: { audio?: string; is_final?: boolean }; message?: string };
        if (message.type === 'audio' && message.data?.audio) onChunk(Buffer.from(message.data.audio, 'base64'));
        if (message.type === 'complete') { onDone(); tts.close(); }
        if (message.type === 'error') { this.handlers.onError(message.message ?? 'Timbre synthesis error'); onDone(); tts.close(); }
      } catch {
        this.handlers.onError('Could not parse Timbre response.');
        onDone();
      }
    });
    tts.on('error', () => { this.handlers.onError('Timbre WebSocket connection failed.'); onDone(); });
  }

  close(): void {
    this.pendingPcm = [];
    this.stt?.close();
  }
}
