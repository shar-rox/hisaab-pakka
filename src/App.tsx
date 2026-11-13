import { useEffect, useMemo, useRef, useState } from 'react';
import {
  appendAudit,
  balanceFor,
  commitTransactions,
  createDemoLedger,
  formatRupees,
  loadLedger,
  saveLedger,
  type LedgerState,
  type Transaction,
} from './lib/ledger';
import {
  draftToEntries,
  initialConversation,
  interpretText,
  type ConversationState,
  type DraftEntry,
} from './lib/conversation';

type ChatLine = { role: 'user' | 'assistant' | 'system'; text: string; time: string };
type AuditStep = 'understood' | 'corrected' | 'confirmed' | 'committed';

const auditLabels: Record<AuditStep, string> = {
  understood: 'Understood',
  corrected: 'Corrected',
  confirmed: 'Confirmed',
  committed: 'Committed',
};

function timeLabel(): string {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function audioSocketUrl(): string {
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
}

export default function App() {
  const [ledger, setLedger] = useState<LedgerState>(() => loadLedger());
  const [conversation, setConversation] = useState<ConversationState>(() => initialConversation());
  const [chat, setChat] = useState<ChatLine[]>([
    { role: 'assistant', text: 'Namaste, main Hisaab Pakka ka AI sahayak hoon. Aap udhaar aur jama bol sakte hain.', time: timeLabel() },
  ]);
  const [status, setStatus] = useState('Connecting to secure voice bridge…');
  const [isListening, setIsListening] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [auditStep, setAuditStep] = useState<AuditStep>('understood');
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [micError, setMicError] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextAudioTimeRef = useRef(0);
  const queryStartRef = useRef<number | null>(null);
  const ledgerRef = useRef(ledger);
  const conversationRef = useRef(conversation);
  const listeningRef = useRef(isListening);
  const listenIntentRef = useRef(false);

  const currentDraft = conversation.draft;
  const customers = ledger.customers;
  const sortedTransactions = useMemo(() => [...ledger.transactions].reverse(), [ledger.transactions]);
  const connectionProblem = /error|disconnected|unavailable|missing/i.test(status);
  const connecting = /connecting/i.test(status);
  const route = window.location.pathname;

  useEffect(() => {
    saveLedger(ledger);
    ledgerRef.current = ledger;
  }, [ledger]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    listeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    const socket = new WebSocket(audioSocketUrl());
    socketRef.current = socket;
    socket.onopen = () => setStatus('Ready · press and hold to speak');
    socket.onclose = () => setStatus('Voice bridge disconnected · refresh to reconnect');
    socket.onerror = () => setStatus('Voice bridge error · text mode remains available');
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; text?: string; status?: string; message?: string; audio?: string };
        if (message.type === 'status' && message.status) setStatus(message.status);
        if (message.type === 'error' && message.message) setStatus(message.message);
        if (message.type === 'transcript' && message.text) {
          setLastLatency(queryStartRef.current ? performance.now() - queryStartRef.current : null);
          queryStartRef.current = null;
          handleText(message.text, true);
        }
        if (message.type === 'audio-start') setAudioPlaying(true);
        if (message.type === 'audio-chunk' && message.audio) playRawPcm(message.audio);
        if (message.type === 'audio-end') setAudioPlaying(false);
      } catch {
        setStatus('Voice bridge sent an unreadable message');
      }
    };
    return () => {
      socket.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
    };
  }, []);

  function pushChat(role: ChatLine['role'], text: string) {
    setChat((lines) => [...lines.slice(-7), { role, text, time: timeLabel() }]);
  }

  function speak(text: string) {
    pushChat('assistant', text);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'speak', text }));
  }

  function handleText(text: string, fromVoice = false) {
    if (!text.trim()) return;
    pushChat('user', text);
    const currentLedger = ledgerRef.current;
    const currentConversation = conversationRef.current;
    const result = interpretText(text, currentConversation, currentLedger.customers, currentLedger);
    let nextLedger = currentLedger;
    if (result.auditStage) {
      setAuditStep(result.auditStage);
      nextLedger = appendAudit(nextLedger, result.auditStage, text);
    }
    if (result.commit) {
      const entries = draftToEntries(result.commit.entries);
      nextLedger = commitTransactions(nextLedger, entries, result.commit.id);
      setAuditStep('committed');
      const primary = entries[0];
      const newBalance = primary?.customerId ? balanceFor(nextLedger, primary.customerId) : 0;
      speak(`${result.assistant} ${formatRupees(newBalance)} baaki hai.`);
    } else {
      speak(result.assistant);
    }
    setLedger(nextLedger);
    setConversation(result.state);
    if (fromVoice) setStatus('Transcript received · confirmation gate active');
  }

  async function startListening() {
    setMicError('');
    listenIntentRef.current = true;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      listenIntentRef.current = false;
      setMicError('Secure voice bridge is not connected yet.');
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('microphone-api-unavailable');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!listenIntentRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        if (!listeningRef.current || socket.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const samples = downsampleTo16k(input, context.sampleRate);
        const pcm = new Int16Array(samples.length);
        for (let index = 0; index < samples.length; index += 1) {
          const sample = Math.max(-1, Math.min(1, samples[index]));
          pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        socket.send(pcm.buffer);
      };
      source.connect(processor);
      processor.connect(context.destination);
      audioContextRef.current = context;
      mediaStreamRef.current = stream;
      processorRef.current = processor;
      listeningRef.current = true;
      setIsListening(true);
      queryStartRef.current = performance.now();
      socket.send(JSON.stringify({ type: 'start-listening' }));
      setStatus('Listening · release to send');
    } catch {
      listenIntentRef.current = false;
      setMicError('Microphone permission is required for live voice input.');
      setStatus('Microphone unavailable · text mode remains available');
    }
  }

  function stopListening() {
    listenIntentRef.current = false;
    listeningRef.current = false;
    setIsListening(false);
    processorRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    socketRef.current?.send(JSON.stringify({ type: 'stop-listening' }));
    setStatus('Processing voice…');
  }

  function playRawPcm(base64: string) {
    const context = audioContextRef.current ?? new AudioContext({ sampleRate: 48000 });
    audioContextRef.current = context;
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const buffer = context.createBuffer(1, Math.floor(bytes.byteLength / 2), 48000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, nextAudioTimeRef.current);
    source.start(startAt);
    nextAudioTimeRef.current = startAt + buffer.duration;
  }

  function resetDemo() {
    const fresh = createDemoLedger();
    setLedger(fresh);
    setConversation(initialConversation());
    setChat([{ role: 'assistant', text: 'Demo reset. Namaste, main Hisaab Pakka ka AI sahayak hoon.', time: timeLabel() }]);
    setAuditStep('understood');
    setLastLatency(null);
  }

  function customerName(id: string) {
    const customer = customers.find((item) => item.id === id);
    return customer ? `${customer.name} · ${customer.descriptor}` : 'Unknown';
  }

  if (route === '/terms') return <LegalPage kind="terms" />;
  if (route === '/privacy') return <LegalPage kind="privacy" />;

  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <a className="wordmark" href="/" aria-label="Hisaab Pakka home"><span className="wordmark-mark" /><span>HISAAB <b>PAKKA</b></span></a>
        <div className="rail-context"><span className="section-label">COUNTER</span><strong>Raju Kirana</strong><span className="rail-meta">Demo account · local mode</span></div>
        <nav className="rail-nav" aria-label="Primary navigation"><a className="active" href="/"><span className="nav-glyph ledger-glyph" />Voice khata</a><a href="#history"><span className="nav-glyph history-glyph" />Entry history</a><a href="#balances"><span className="nav-glyph balance-glyph" />Customers</a></nav>
        <div className="rail-foot"><div className="privacy-note"><span className="status-led" /> Data stays on this device</div><button className="reset-link" onClick={resetDemo}>Reset demo data</button><div className="legal-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><span className="section-label">VOICE KHATA / COUNTER MODE</span><h1>Good records sound like conversation.</h1><p className="intro-copy">Speak the sale. Check the meaning. Save only when it is pakka.</p></div><div className={`connection-state ${connectionProblem ? 'problem' : ''}`}><span className={`connection-led ${connecting ? 'loading' : ''}`} /> <span>{status}</span></div></header>

        {connectionProblem && <div className="connection-alert" role="alert"><div><strong>Voice bridge needs attention.</strong><span>{status}</span></div><button onClick={() => window.location.reload()}>Reconnect</button></div>}

        <div className="counter-layout">
          <section className="voice-stage">
            <div className="stage-heading"><div><span className="section-label">LIVE COUNTER</span><h2>Bolke hisaab rakho.</h2></div><div className="latency-readout"><span>LAST ANSWER</span><strong>{lastLatency ? `${Math.round(lastLatency)} ms` : '—'}</strong></div></div>
            <div className="conversation-window" aria-live="polite">
              {connecting ? <SkeletonConversation /> : chat.map((line, index) => <div className={`chat-line ${line.role}`} key={`${line.time}-${index}`}><div className="chat-meta"><span>{line.role === 'assistant' ? 'HISAAB PAKKA' : line.role === 'user' ? 'YOU' : 'SYSTEM'}</span><time>{line.time}</time></div><p>{line.text}</p></div>)}
              {audioPlaying && <div className="speaking-indicator"><span className="sound-bar one" /><span className="sound-bar two" /><span className="sound-bar three" /> assistant speaking</div>}
            </div>
            <div className="voice-console"><div className="console-rule"><span>HOLD TO CAPTURE</span><span>HINDI + ENGLISH</span></div><button className={`ptt ${isListening ? 'listening' : ''}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); void startListening(); }} onPointerUp={stopListening} onPointerCancel={stopListening} aria-label="Press and hold to speak"><span className="mic-mark"><i /><b /></span><strong>{isListening ? 'Release to send' : 'Press & hold to speak'}</strong><small>{isListening ? 'Prisma is listening…' : 'Your voice stays private on this counter'}</small></button><div className="voice-caption"><span className="status-led" /> {micError || 'Nothing is saved until you say “haan, save”.'}</div></div>
            <div className="typed-lane"><span className="typed-label">TEXT FALLBACK</span><input value={typedText} onChange={(event) => setTypedText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { handleText(typedText); setTypedText(''); } }} placeholder="Try: Ramesh ka aaj 340 udhaar" /><button onClick={() => { handleText(typedText); setTypedText(''); }}>Send text</button></div>
          </section>

          <aside className="proof-column">
            <section className="proof-section draft-section"><div className="proof-heading"><div><span className="section-label">WORKING DRAFT</span><h3>{conversation.stage === 'confirm' ? 'Ready to confirm' : 'What I heard'}</h3></div><span className={`stage-tag ${conversation.stage}`}>{conversation.stage === 'confirm' ? 'CHECK' : conversation.stage === 'idle' ? 'WAITING' : 'CLARIFY'}</span></div>{currentDraft.length ? currentDraft.map((draft) => <DraftRow key={draft.id} draft={draft} />) : <div className="empty-draft"><span className="empty-glyph" /><div><strong>Nothing pending</strong><p>Your next spoken entry will appear here before it touches the ledger.</p></div></div>}</section>
            <section className="proof-section audit-section"><div className="proof-heading"><div><span className="section-label">SAFETY CHECK</span><h3>Every save has a trail</h3></div><span className="audit-count">{ledger.audit.length} events</span></div><div className="audit-ribbon">{(['understood', 'corrected', 'confirmed', 'committed'] as AuditStep[]).map((step, index) => <div className={`audit-step ${auditStep === step || (['understood', 'corrected', 'confirmed', 'committed'].indexOf(auditStep) > index) ? 'on' : ''}`} key={step}><span>{index + 1}</span><small>{auditLabels[step]}</small></div>)}</div><p className="audit-note">An uncertain amount, customer or direction never gets a silent write.</p></section>
            <section className="proof-section balance-section" id="balances"><div className="proof-heading"><div><span className="section-label">CUSTOMER BOOK</span><h3>Who has an open balance</h3></div><span className="audit-count">{customers.length} names</span></div><div className="balance-list">{customers.map((customer) => <div className="balance-row" key={customer.id}><div className="customer-initial">{customer.name.slice(0, 1)}</div><div className="customer-copy"><strong>{customer.name}</strong><span>{customer.descriptor}</span></div><b className={balanceFor(ledger, customer.id) > 0 ? 'due' : ''}>{formatRupees(balanceFor(ledger, customer.id))}</b></div>)}</div></section>
          </aside>
        </div>

        <section className="history-panel" id="history"><div className="history-heading"><div><span className="section-label">ENTRY HISTORY</span><h2>A short memory for the counter.</h2></div><span className="history-count">{ledger.transactions.length} committed</span></div>{sortedTransactions.length ? <div className="history-list">{sortedTransactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} customer={customerName(transaction.customerId)} />)}</div> : <div className="history-empty"><span className="ledger-empty-mark" /><div><strong>No entries yet</strong><span>The first confirmed transaction will be listed here with its exact direction and date.</span></div></div>}</section>
        <footer className="app-footer"><span>HISAAB PAKKA · CORRECTION-SAFE VOICE LEDGER</span><span><a href="/privacy">Privacy</a><a href="/terms">Terms</a><span className="footer-divider" />Prisma v3.0 · Timbre v3.0 · synthetic data</span></footer>
      </section>
    </main>
  );
}

function downsampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000) return input;
  const ratio = sourceRate / 16000;
  const output = new Float32Array(Math.round(input.length / ratio));
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(Math.floor((outputIndex + 1) * ratio), input.length);
    let total = 0;
    let count = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      total += input[inputIndex];
      count += 1;
    }
    output[outputIndex] = count ? total / count : 0;
  }
  return output;
}

function SkeletonConversation() {
  return <div className="skeleton-stack" aria-label="Connecting"><span /><span /><span /></div>;
}

function DraftRow({ draft }: { draft: DraftEntry }) {
  const isPayment = draft.direction === 'payment';
  return <div className="draft-row"><span className={`direction-token ${isPayment ? 'payment' : 'credit'}`}>{isPayment ? 'PM' : 'CR'}</span><div className="draft-copy"><strong>{draft.descriptor ? `${draft.descriptor} ` : ''}{draft.customerName}</strong><span>{draft.dateKey} · {isPayment ? 'Jama / payment' : draft.direction === 'credit' ? 'Udhaar / credit' : 'Direction needed'}</span></div><b>{draft.amount ? formatRupees(draft.amount) : '—'}</b></div>;
}

function TransactionRow({ transaction, customer }: { transaction: Transaction; customer: string }) {
  const credit = transaction.direction === 'credit';
  return <div className="transaction-row"><span className={`direction-token small ${credit ? 'credit' : 'payment'}`}>{credit ? 'CR' : 'PM'}</span><div><strong>{customer}</strong><span>{transaction.dateKey} · {credit ? 'Credit issued' : 'Payment received'}</span></div><b className={credit ? 'due' : 'paid'}>{credit ? '+' : '−'}{formatRupees(transaction.amount)}</b><span className="commit-tag">committed</span></div>;
}

function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const privacy = kind === 'privacy';
  return <main className="legal-shell"><div className="legal-top"><a className="wordmark dark" href="/"><span className="wordmark-mark" /><span>HISAAB <b>PAKKA</b></span></a><a className="back-link" href="/">Back to counter</a></div><article className="legal-card"><span className="section-label">HISAAB PAKKA / {privacy ? 'PRIVACY' : 'TERMS'}</span><h1>{privacy ? 'Privacy, kept practical.' : 'Terms for this prototype.'}</h1><p className="legal-lede">{privacy ? 'This hackathon prototype is designed around a simple promise: the shopkeeper should know what was heard and when the ledger changed.' : 'Hisaab Pakka is a demonstration product for the Gnani Voice Hackathon. These terms describe the prototype boundaries, not a production accounting service.'}</p>{privacy ? <><h2>What this prototype stores</h2><p>The demo uses synthetic customer names and stores committed ledger entries locally in the browser on the demonstration device. The application does not intentionally persist raw voice transcripts or customer-call recordings.</p><h2>Speech processing</h2><p>When voice mode is used, microphone audio is streamed to the configured Gnani Prisma v3.0 speech-to-text service through the application backend. Spoken replies are generated through Gnani Timbre v3.0. Do not use real customer information in this demonstration.</p><h2>Responsible use</h2><p>Use the reset control to remove the local demo ledger. This prototype is not intended for real financial records, identity verification, collections, lending decisions, or production bookkeeping.</p></> : <><h2>Prototype scope</h2><p>Hisaab Pakka is provided for evaluation during the hackathon. It may contain untested recognition behavior, latency variation, or device-specific microphone limitations. A spoken interpretation is only a draft until the shopkeeper confirms it.</p><h2>Acceptable use</h2><p>Use synthetic data during judging and testing. Do not enter personal, financial, health, or confidential customer information. Do not use the prototype as the sole record for a real business transaction.</p><h2>No promise of production availability</h2><p>The team makes no claim that this prototype is production-ready, legally compliant for a particular jurisdiction, or suitable for accounting, tax, lending, or payment decisions.</p></>}<p className="legal-updated">Prototype policy · November 2026</p></article></main>;
}
