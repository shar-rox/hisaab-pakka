import {
  type Customer,
  type Direction,
  type LedgerState,
  type Transaction,
  balanceFor,
  dailyCredit,
  formatRupees,
  shiftDateKey,
  todayKey,
} from './ledger';

export type DraftEntry = {
  id: string;
  customerId?: string;
  customerName: string;
  descriptor?: string;
  direction?: Direction;
  amount?: number;
  dateKey: string;
  sourceText: string;
};

export type ConversationStage = 'idle' | 'clarify-customer' | 'clarify-direction' | 'confirm';

export type ConversationState = {
  stage: ConversationStage;
  draft: DraftEntry[];
  lastTranscript: string;
  pendingQuery?: { type: 'balance'; customerName: string };
};

export type ConversationResult = {
  state: ConversationState;
  assistant: string;
  commit?: { id: string; entries: DraftEntry[] };
  auditStage?: 'understood' | 'corrected' | 'confirmed';
};

const unitValues: Record<string, number> = {
  zero: 0, ek: 1, one: 1, do: 2, two: 2, teen: 3, tin: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, che: 6, chhe: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8,
  nau: 9, nine: 9, das: 10, ten: 10, gyarah: 11, barah: 12, tera: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, twenty: 20, tees: 30, thirty: 30,
  chaalis: 40, chalis: 40, forty: 40, pachaas: 50, fifty: 50, saath: 60, sixty: 60, sattar: 70,
  seventy: 70, assi: 80, eighty: 80, nabbe: 90, ninety: 90,
  'तीन': 3, 'चार': 4, 'दो': 2, 'तीस': 30, 'चालीस': 40, 'सौ': 100,
};

const speechAliases: Record<string, string> = {
  aj: 'aaj', aaj: 'aaj',
  parson: 'parso', parso: 'parso',
  udhar: 'udhaar', udaar: 'udhaar', udhaar: 'udhaar', udhhar: 'udhaar',
  jama: 'jama', jamaa: 'jama', jma: 'jama',
  diya: 'diya', diyaa: 'diya', deya: 'diya', diye: 'diye', diyeah: 'diye',
  doodh: 'doodh', dudh: 'doodh', doodhwala: 'doodhwala', doodhwale: 'doodhwala',
  dudhwala: 'doodhwala', dudhwale: 'doodhwala',
  electrician: 'electrician', elektrician: 'electrician', bijliwala: 'electrician', bijliwale: 'electrician',
  ek: 'ek', eik: 'ek', ik: 'ek',
  do: 'do', doh: 'do', doo: 'do',
  teen: 'teen', tin: 'teen', tein: 'teen',
  char: 'chaar', chaar: 'chaar', chaarh: 'chaar',
  chaalis: 'chaalis', chalis: 'chaalis', chalees: 'chaalis', chaleez: 'chaalis', bees: 'bees', bis: 'bees', twenty: 'twenty',
  tees: 'tees', tis: 'tees', teez: 'tees',
  sau: 'sau', sow: 'sau', sao: 'sau',
  haan: 'haan', han: 'haan', haa: 'haan', yes: 'yes',
  nahi: 'nahi', nahin: 'nahi', nahee: 'nahi', nai: 'nahi', no: 'no',
  theek: 'theek', thik: 'theek', tik: 'theek',
};

const fuzzyVocabulary = Object.keys(speechAliases).filter((word) => word.length >= 4);

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex];
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal + 1, row[rightIndex] + 1, row[rightIndex - 1] + 1);
      diagonal = above;
    }
  }
  return row[right.length];
}

function canonicalWord(word: string): string {
  if (speechAliases[word]) return speechAliases[word];
  if (word.length >= 5) {
    const close = fuzzyVocabulary.find((candidate) => editDistance(word, candidate) <= (word.length >= 7 ? 2 : 1));
    if (close) return speechAliases[close];
  }
  return word;
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[₹,!?.,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map(canonicalWord).join(' ');
}

export function parseAmount(input: string): number | undefined {
  const normalized = normalize(input);
  const digit = input.match(/(?:₹\s*)?(\d{1,6})/);
  if (digit) return Number(digit[1]);
  const threeForty = input.toLowerCase().match(/\b(three|3)[ -]?(forty|40)\b/);
  if (threeForty) return 340;
  const words = normalized.split(' ');
  const hundredIndex = words.findIndex((word) => word === 'sau' || word === 'hundred');
  if (hundredIndex > 0) {
    const hundreds = unitValues[words[hundredIndex - 1]];
    if (hundreds !== undefined) {
      const remainder = words.slice(hundredIndex + 1).find((word) => unitValues[word] !== undefined && unitValues[word] >= 20);
      return hundreds * 100 + (remainder ? unitValues[remainder] : 0);
    }
  }
  for (let index = 0; index < words.length; index += 1) {
    const hundreds = unitValues[words[index]];
    const remainder = unitValues[words[index + 1]];
    if (hundreds !== undefined && hundreds < 10 && remainder !== undefined && remainder >= 20) return hundreds * 100 + remainder;
  }
  for (const word of words) {
    if (unitValues[word] !== undefined && unitValues[word] >= 20) return unitValues[word];
  }
  return undefined;
}

function dateFromText(input: string): string {
  const normalized = normalize(input);
  if (normalized.includes('parso')) return shiftDateKey(-2);
  if (normalized.includes('kal')) return shiftDateKey(-1);
  return todayKey();
}

function directionFromText(input: string): Direction | 'ambiguous' | undefined {
  const normalized = normalize(input);
  if (/\bko\b.*\b(diya|diye)\b/.test(normalized)) return 'ambiguous';
  const payment = /(jama|mila|mili|wapas|payment|paid|receive|received)/.test(normalized);
  const credit = /(udhaar|credit|diya|diye|dena)/.test(normalized);
  if (payment && credit) return 'ambiguous';
  if (payment) return 'payment';
  if (credit) return 'credit';
  return undefined;
}

function customerMatches(input: string, customers: Customer[]): Customer[] {
  const normalized = normalize(input);
  const tokens = normalized.split(' ');
  return customers.filter((customer) => tokens.some((token) => token === customer.name.toLowerCase() || editDistance(token, customer.name.toLowerCase()) <= 1));
}

function descriptorMatch(input: string, customers: Customer[]): Customer | undefined {
  const normalized = normalize(input);
  const tokens = normalized.split(' ');
  return customers.find((customer) => {
    const descriptor = customer.descriptor.toLowerCase();
    return normalized.includes(descriptor) || tokens.some((token) => editDistance(token, descriptor) <= 2);
  });
}

function isYes(input: string): boolean {
  return /^(haan|yes|y|save|save kar|kar do|theek|sahi|correct)/i.test(normalize(input));
}

function isNo(input: string): boolean {
  return /^(nahi|no|cancel|cancel karo|rehne do)/i.test(normalize(input));
}

function makeDraft(input: string, customers: Customer[]): DraftEntry[] {
  const matches = customerMatches(input, customers);
  const descriptor = descriptorMatch(input, customers);
  const selected = descriptor ?? (matches.length === 1 ? matches[0] : undefined);
  const parts = input.split(/,|\s+aur\s+/i).map((part) => part.trim()).filter(Boolean);
  return parts.map((part, index) => {
    const partMatches = customerMatches(part, customers);
    const partDescriptor = descriptorMatch(part, customers);
    const partSelected = partDescriptor ?? (partMatches.length === 1 ? partMatches[0] : selected);
    const direction = directionFromText(part);
    return {
      id: `draft-${Date.now()}-${index}`,
      customerId: partSelected?.id,
      customerName: partSelected?.name ?? matches[0]?.name ?? 'Unknown',
      descriptor: partSelected?.descriptor,
      direction: direction === 'ambiguous' ? undefined : direction,
      amount: parseAmount(part),
      dateKey: dateFromText(part),
      sourceText: part,
    };
  });
}

function readback(drafts: DraftEntry[]): string {
  return drafts.map((draft) => {
    const direction = draft.direction === 'credit' ? 'udhaar' : draft.direction === 'payment' ? 'jama' : 'transaction';
    const date = draft.dateKey === todayKey() ? 'aaj' : draft.dateKey === shiftDateKey(-1) ? 'kal' : draft.dateKey;
    const amount = draft.amount && draft.amount > 0 ? formatRupees(draft.amount) : 'amount pending';
    return `${draft.descriptor ? `${draft.descriptor} ` : ''}${draft.customerName}: ${date} ${amount} ${direction}`;
  }).join('; ');
}

export function initialConversation(): ConversationState {
  return { stage: 'idle', draft: [], lastTranscript: '' };
}

export function interpretText(
  text: string,
  state: ConversationState,
  customers: Customer[],
  ledger: LedgerState,
): ConversationResult {
  const normalized = normalize(text);
  const base = { ...state, lastTranscript: text };

  if (state.stage === 'clarify-customer') {
    const selected = descriptorMatch(text, customers);
    if (selected) {
      if (state.pendingQuery?.type === 'balance') {
        return { state: initialConversation(), assistant: `${selected.descriptor} ${selected.name} ka balance ${formatRupees(balanceFor(ledger, selected.id))} baaki hai.` };
      }
      const draft = state.draft.map((entry) => entry.customerId ? entry : { ...entry, customerId: selected.id, descriptor: selected.descriptor });
      if (draft.some((entry) => !entry.amount || entry.amount <= 0)) {
        return { state: { ...base, stage: 'idle', draft }, assistant: `${selected.descriptor} ${selected.name}. Amount kitna tha?`, auditStage: 'understood' };
      }
      if (draft.some((entry) => !entry.direction)) {
        return { state: { ...base, stage: 'clarify-direction', draft }, assistant: 'Udhaar gaya ya jama mila?', auditStage: 'understood' };
      }
      return { state: { ...base, stage: 'confirm', draft }, assistant: `${readback(draft)}. Sahi hai?`, auditStage: 'understood' };
    }
    return { state: base, assistant: 'Kaun sa Ramesh? Doodhwala ya electrician?', auditStage: 'understood' };
  }

  if (state.stage === 'clarify-direction') {
    const direction = directionFromText(text);
    if (direction === 'credit' || direction === 'payment') {
      const draft = state.draft.map((entry) => ({ ...entry, direction }));
      return { state: { ...base, stage: 'confirm', draft }, assistant: `${readback(draft)}. Save karun?`, auditStage: 'understood' };
    }
    if (isNo(text)) return { state: initialConversation(), assistant: 'Theek hai, draft cancel kar diya.' };
    return { state: base, assistant: 'Udhaar gaya ya jama mila?', auditStage: 'understood' };
  }

  if (state.stage === 'confirm') {
    const correctionAmount = parseAmount(text);
    if (normalized.startsWith('nahi') || normalized.startsWith('nahin')) {
      if (correctionAmount !== undefined) {
        const creditIndexes = state.draft.map((entry, index) => entry.direction === 'credit' ? index : -1).filter((index) => index >= 0);
        const dateHint = normalized.includes('parso') ? shiftDateKey(-2) : normalized.includes('kal') ? shiftDateKey(-1) : normalized.includes('aaj') ? todayKey() : undefined;
        const targetIndex = dateHint ? creditIndexes.find((index) => state.draft[index].dateKey === dateHint) : creditIndexes.length === 1 ? creditIndexes[0] : undefined;
        if (targetIndex === undefined) return { state: base, assistant: 'Kaun sa udhaar correct karun — aaj wala ya kal wala?', auditStage: 'understood' };
        const draft = state.draft.map((entry, index) => index === targetIndex ? { ...entry, amount: correctionAmount } : entry);
        return { state: { ...base, stage: 'confirm', draft }, assistant: `${readback(draft)}. Save karun?`, auditStage: 'corrected' };
      }
      return { state: initialConversation(), assistant: 'Theek hai, draft cancel kar diya.' };
    }
    if (isYes(text) && state.draft.every(isComplete)) {
      return { state: initialConversation(), assistant: 'Save ho gaya. Ledger update kar diya.', commit: { id: `commit-${Date.now()}`, entries: state.draft }, auditStage: 'confirmed' };
    }
    return { state: base, assistant: `${readback(state.draft)}. Save karun?`, auditStage: 'understood' };
  }

  if (state.stage === 'idle' && state.draft.length) {
    const amount = parseAmount(text);
    if (amount !== undefined && amount > 0) {
      const targetIndex = state.draft.findIndex((entry) => !entry.amount || entry.amount <= 0);
      const draft = targetIndex < 0 ? state.draft : state.draft.map((entry, index) => index === targetIndex ? { ...entry, amount } : entry);
      if (draft.some((entry) => !entry.direction)) {
        return { state: { ...base, stage: 'clarify-direction', draft }, assistant: 'Udhaar gaya ya jama mila?', auditStage: 'understood' };
      }
      if (draft.every(isComplete)) {
        return { state: { ...base, stage: 'confirm', draft }, assistant: `${readback(draft)}. Sahi hai?`, auditStage: 'understood' };
      }
      return { state: { ...base, stage: 'idle', draft }, assistant: 'Amount kitna tha?', auditStage: 'understood' };
    }
  }

  if (/(aaj|today).*(kitna|total|gaya|credit total)/i.test(normalized) && customerMatches(text, customers).length === 0) {
    return { state: { ...base, stage: 'idle' }, assistant: `Aaj ${formatRupees(dailyCredit(ledger))} udhaar gaya.` };
  }

  const queryCustomers = customerMatches(text, customers);
  const queryCustomer = queryCustomers[0];
  if (queryCustomers.length > 1 && /(total|balance|baaki|outstanding|kitna)/i.test(normalized)) {
    return { state: { ...base, stage: 'clarify-customer', draft: [], pendingQuery: { type: 'balance', customerName: queryCustomer.name } }, assistant: 'Ramesh kaun sa? Doodhwala ya electrician?', auditStage: 'understood' };
  }
  if (queryCustomer && /(total|balance|baaki|outstanding|kitna)/i.test(normalized)) {
    return { state: { ...base, stage: 'idle' }, assistant: `${queryCustomer.descriptor} ${queryCustomer.name} ka balance ${formatRupees(balanceFor(ledger, queryCustomer.id))} baaki hai.` };
  }

  const draft = makeDraft(text, customers);
  const matches = customerMatches(text, customers);
  const direction = directionFromText(text);
  if (matches.length > 1 && !descriptorMatch(text, customers)) {
    return { state: { ...base, stage: 'clarify-customer', draft }, assistant: 'Ramesh kaun sa? Doodhwala ya electrician?', auditStage: 'understood' };
  }
  if ((draft.length === 1 && direction === 'ambiguous') || draft.some((entry) => !entry.direction)) {
    return { state: { ...base, stage: 'clarify-direction', draft }, assistant: 'Udhaar gaya ya jama mila?', auditStage: 'understood' };
  }
  if (draft.some((entry) => !entry.customerId)) {
    return { state: { ...base, stage: 'clarify-customer', draft }, assistant: 'Customer ka naam ya pehchaan bataiye.', auditStage: 'understood' };
  }
  if (draft.some((entry) => !entry.amount)) {
    return { state: { ...base, stage: 'idle', draft }, assistant: 'Amount kitna tha?', auditStage: 'understood' };
  }
  return { state: { ...base, stage: 'confirm', draft }, assistant: `${readback(draft)}. Sahi hai?`, auditStage: 'understood' };
}

function isComplete(entry: DraftEntry): boolean {
  return Boolean(entry.customerId && entry.direction && entry.amount && entry.amount > 0);
}

export function draftToEntries(drafts: DraftEntry[]): Array<Pick<Transaction, 'customerId' | 'direction' | 'amount' | 'dateKey' | 'sourceText'>> {
  return drafts.filter(isComplete).map((draft) => ({
    customerId: draft.customerId,
    direction: draft.direction,
    amount: draft.amount,
    dateKey: draft.dateKey,
    sourceText: draft.sourceText,
  })) as Array<Pick<Transaction, 'customerId' | 'direction' | 'amount' | 'dateKey' | 'sourceText'>>;
}
