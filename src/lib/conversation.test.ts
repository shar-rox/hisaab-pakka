import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoLedger, commitTransactions, balanceFor, todayKey } from './ledger';
import { initialConversation, interpretText, parseAmount, draftToEntries } from './conversation';

test('parses code-mixed amounts', () => {
  assert.equal(parseAmount('teen sau chaalis'), 340);
  assert.equal(parseAmount('chaar sau tees'), 430);
  assert.equal(parseAmount('three-forty'), 340);
  assert.equal(parseAmount('₹200'), 200);
  assert.equal(parseAmount('tin sow chalees'), 340);
  assert.equal(parseAmount('char sao tis'), 430);
  assert.equal(parseAmount('bees'), 20);
  assert.equal(parseAmount('twenty'), 20);
  assert.equal(parseAmount('340rs'), 340);
  assert.equal(parseAmount('20 rupees'), 20);
  assert.equal(parseAmount('three hundred forty'), 340);
  assert.equal(parseAmount('three forty'), 340);
});

test('accepts common pronunciation variants for direction and customer identity', () => {
  const ledger = createDemoLedger();
  const result = interpretText('Dudh wale Rames ka aj 200 udhar', initialConversation(), ledger.customers, ledger);
  assert.equal(result.state.stage, 'clarify-customer');
  const selected = interpretText('dudhwale', result.state, ledger.customers, ledger);
  assert.equal(selected.state.stage, 'confirm');
  assert.equal(selected.state.draft[0].amount, 200);
  assert.equal(selected.state.draft[0].direction, 'credit');
  assert.equal(selected.assistant.match(/doodhwala ramesh/gi)?.length, 1);
});

test('accepts pronunciation variants for confirmation and cancellation', () => {
  const ledger = createDemoLedger();
  const first = interpretText('Doodhwala Ramesh ka aaj 200 udhaar', initialConversation(), ledger.customers, ledger);
  const saved = interpretText('haa, save kar do', first.state, ledger.customers, ledger);
  assert.equal(saved.commit?.entries[0].amount, 200);
  const cancelled = interpretText('nai, rehne do', first.state, ledger.customers, ledger);
  assert.equal(cancelled.state.stage, 'idle');
  assert.equal(cancelled.commit, undefined);
});

test('asks for a missing amount and accepts the next spoken number', () => {
  const ledger = createDemoLedger();
  const first = interpretText('Ramesh ka aaj udhaar', initialConversation(), ledger.customers, ledger);
  const selected = interpretText('Dudhvala', first.state, ledger.customers, ledger);
  assert.equal(selected.state.stage, 'idle');
  assert.match(selected.assistant, /Amount kitna tha/);
  const completed = interpretText('bees', selected.state, ledger.customers, ledger);
  assert.equal(completed.state.stage, 'confirm');
  assert.equal(completed.state.draft[0].amount, 20);
});

test('asks for same-name customer clarification', () => {
  const ledger = createDemoLedger();
  const result = interpretText('Ramesh ka aaj 340 udhaar', initialConversation(), ledger.customers, ledger);
  assert.equal(result.state.stage, 'clarify-customer');
  assert.match(result.assistant, /Doodhwala|electrician/);
});

test('correction changes only the credit amount before commit', () => {
  const ledger = createDemoLedger();
  const first = interpretText('Doodhwala Ramesh ka aaj 340 udhaar', initialConversation(), ledger.customers, ledger);
  assert.equal(first.state.stage, 'confirm');
  const corrected = interpretText('Nahi, udhaar 430', first.state, ledger.customers, ledger);
  assert.equal(corrected.state.draft[0].amount, 430);
  assert.equal(corrected.auditStage, 'corrected');
});

test('commit is duplicate safe and balance is deterministic', () => {
  const ledger = createDemoLedger();
  const entries = [{ customerId: 'ramesh-milk', direction: 'credit' as const, amount: 430, dateKey: todayKey(), sourceText: 'demo' }];
  const once = commitTransactions(ledger, entries, 'commit-1');
  const twice = commitTransactions(once, entries, 'commit-1');
  assert.equal(once.transactions.length, 1);
  assert.equal(twice.transactions.length, 1);
  assert.equal(balanceFor(twice, 'ramesh-milk'), 430);
});

test('direction ambiguity does not produce a complete draft', () => {
  const ledger = createDemoLedger();
  const result = interpretText('Suresh ko do sau diye', initialConversation(), ledger.customers, ledger);
  assert.equal(result.state.stage, 'clarify-direction');
  assert.equal(draftToEntries(result.state.draft).length, 0);
});

test('compound credit and repayment remain separate dated draft events', () => {
  const ledger = createDemoLedger();
  const first = interpretText('Doodhwala Ramesh ka aaj teen sau chaalis udhaar, aur kal do sau jama kiye the', initialConversation(), ledger.customers, ledger);
  assert.equal(first.state.stage, 'confirm');
  assert.equal(first.state.draft.length, 2);
  assert.deepEqual(first.state.draft.map((entry) => [entry.direction, entry.amount]), [['credit', 340], ['payment', 200]]);
  assert.notEqual(first.state.draft[0].dateKey, first.state.draft[1].dateKey);
  assert.equal(draftToEntries(first.state.draft).length, 2);
});

test('same-name balance queries clarify before answering', () => {
  const ledger = commitTransactions(createDemoLedger(), [{ customerId: 'ramesh-milk', direction: 'credit', amount: 100, dateKey: todayKey(), sourceText: 'seed' }], 'seed-1');
  const question = interpretText('Ramesh ka total', initialConversation(), ledger.customers, ledger);
  assert.equal(question.state.stage, 'clarify-customer');
  const answer = interpretText('electrician', question.state, ledger.customers, ledger);
  assert.match(answer.assistant, /₹0/);
});

test('correction targets the date-mentioned credit entry only', () => {
  const ledger = createDemoLedger();
  const first = interpretText('Doodhwala Ramesh ka aaj 340 udhaar aur kal 200 udhaar', initialConversation(), ledger.customers, ledger);
  const corrected = interpretText('Nahi, aaj udhaar 430', first.state, ledger.customers, ledger);
  assert.deepEqual(corrected.state.draft.map((entry) => entry.amount), [430, 200]);
});

test('invalid commits are rejected at the ledger boundary', () => {
  const ledger = createDemoLedger();
  assert.throws(() => commitTransactions(ledger, [], 'empty'));
  assert.throws(() => commitTransactions(ledger, [{ customerId: 'missing', direction: 'credit', amount: 10, dateKey: todayKey(), sourceText: 'bad' }], 'unknown'));
  assert.throws(() => commitTransactions(ledger, [{ customerId: 'suresh', direction: 'credit', amount: 0, dateKey: todayKey(), sourceText: 'bad' }], 'zero'));
});
