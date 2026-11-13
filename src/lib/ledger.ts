export type Customer = {
  id: string;
  name: string;
  descriptor: string;
};

export type Direction = 'credit' | 'payment';

export type Transaction = {
  id: string;
  commitId: string;
  customerId: string;
  direction: Direction;
  amount: number;
  dateKey: string;
  createdAt: string;
  sourceText: string;
};

export type AuditEvent = {
  id: string;
  stage: 'understood' | 'corrected' | 'confirmed' | 'committed';
  text: string;
  createdAt: string;
};

export type LedgerState = {
  customers: Customer[];
  transactions: Transaction[];
  audit: AuditEvent[];
};

export const STORAGE_KEY = 'hisaab-pakka-ledger-v1';

export const seedCustomers: Customer[] = [
  { id: 'ramesh-milk', name: 'Ramesh', descriptor: 'doodhwala' },
  { id: 'ramesh-electrician', name: 'Ramesh', descriptor: 'electrician' },
  { id: 'suresh', name: 'Suresh', descriptor: 'regular customer' },
];

export function todayKey(now = new Date()): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(offset: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  return todayKey(date);
}

export function createDemoLedger(): LedgerState {
  return { customers: seedCustomers, transactions: [], audit: [] };
}

export function loadLedger(): LedgerState {
  if (typeof window === 'undefined') return createDemoLedger();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDemoLedger();
    const value = JSON.parse(raw) as LedgerState;
    if (!value.customers || !value.transactions || !value.audit) return createDemoLedger();
    return value;
  } catch {
    return createDemoLedger();
  }
}

export function saveLedger(ledger: LedgerState): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
}

export function balanceFor(ledger: LedgerState, customerId: string): number {
  return ledger.transactions.reduce((balance, transaction) => {
    if (transaction.customerId !== customerId) return balance;
    return balance + (transaction.direction === 'credit' ? transaction.amount : -transaction.amount);
  }, 0);
}

export function dailyCredit(ledger: LedgerState, dateKey = todayKey()): number {
  return ledger.transactions.reduce((sum, transaction) => {
    if (transaction.dateKey !== dateKey || transaction.direction !== 'credit') return sum;
    return sum + transaction.amount;
  }, 0);
}

export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function commitTransactions(
  ledger: LedgerState,
  entries: Array<Pick<Transaction, 'customerId' | 'direction' | 'amount' | 'dateKey' | 'sourceText'>>,
  commitId: string,
): LedgerState {
  if (ledger.transactions.some((transaction) => transaction.commitId === commitId)) return ledger;
  if (!entries.length) throw new Error('Cannot commit an empty transaction set.');
  for (const entry of entries) {
    if (!ledger.customers.some((customer) => customer.id === entry.customerId)) throw new Error('Cannot commit an unknown customer.');
    if (!Number.isInteger(entry.amount) || entry.amount <= 0) throw new Error('Transaction amount must be a positive integer rupee value.');
    if (entry.direction !== 'credit' && entry.direction !== 'payment') throw new Error('Transaction direction is invalid.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.dateKey)) throw new Error('Transaction date is invalid.');
  }
  const createdAt = new Date().toISOString();
  const transactions = entries.map((entry, index) => ({
    ...entry,
    id: `${commitId}-${index}`,
    commitId,
    createdAt,
  }));
  return {
    ...ledger,
    transactions: [...ledger.transactions, ...transactions],
    audit: [
      ...ledger.audit,
      {
        id: `${commitId}-audit`,
        stage: 'committed',
        text: `Committed ${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`,
        createdAt,
      },
    ],
  };
}

export function appendAudit(ledger: LedgerState, stage: AuditEvent['stage'], text: string): LedgerState {
  return {
    ...ledger,
    audit: [
      ...ledger.audit,
      { id: `${Date.now()}-${Math.random()}`, stage, text, createdAt: new Date().toISOString() },
    ],
  };
}
