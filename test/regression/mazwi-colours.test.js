import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Lesson words are tinted by the learner's mazwi state, like the word chips on mazwi's own page:
// forgot = crimson, learning = gold, review (well-known) = emerald, mature (mastered) = sapphire.
// The member's saved mazwi deck (user_decks) is read with their own login; word ids (n) come from
// mazwi.app/lessons.json; the state rule is mazwi's own getCardState (mazwi.app/src/word-state.js).

const ENTRY = {
  zuva: 2, week: 1, type: 'lesson', slug: 'zuva-02', title: 'Hesi, mhoro, mhoroi', tip: '',
  recycled: ['ehe', 'kwete', 'handina kunzwisisa'], recycled_n: [5, 6, null],
  new: [{ n: 20, shona: 'hesi', english: 'hi' }, { n: 21, shona: 'mhoro', english: 'hello' }],
};

// stand-in for mazwi's getCardState, keyed off a made-up field so these tests don't depend on FSRS
const fakeState = (c) => c.fake;

const SIGNED_IN = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }) } };

afterEach(() => { delete globalThis.fetch; });

describe('phrase bank — word ids on the page', () => {
  it('puts data-n on every new word and every recycled word that has one', () => {
    const { renderPhraseBankHtml } = loadApp();
    const html = renderPhraseBankHtml(ENTRY);
    for (const n of [20, 21, 5, 6]) expect(html).toContain(`data-n="${n}"`);
    expect(html.match(/data-n=/g).length).toBe(4); // the phrase (null) gets none
    expect(html).toContain('handina kunzwisisa'); // still shown, just not tinted
  });

  it('still renders lessons.json entries that have no ids yet (older cached data)', () => {
    const { renderPhraseBankHtml } = loadApp();
    const html = renderPhraseBankHtml({ zuva: 2, recycled: ['ehe'], new: [{ shona: 'hesi', english: 'hi' }] });
    expect(html).toContain('hesi');
    expect(html).toContain('ehe');
    expect(html).not.toContain('data-n=');
  });
});

describe('mazwi state per word', () => {
  it('maps word_num to a state and leaves out words the learner has not met', () => {
    const { mazwiStatesFromDeck } = loadApp();
    const deck = [{ n: 20, fake: 'learning' }, { n: 21, fake: 'new' }, { n: 5, fake: 'mature' }, { n: 6, fake: 'forgot' }];
    expect(mazwiStatesFromDeck(deck, fakeState)).toEqual({ 20: 'learning', 5: 'mature', 6: 'forgot' });
  });

  it('copes with a missing or odd deck', () => {
    const { mazwiStatesFromDeck } = loadApp();
    expect(mazwiStatesFromDeck(null, fakeState)).toEqual({});
    expect(mazwiStatesFromDeck([null, { fake: 'review' }, { n: 'x', fake: 'review' }], fakeState)).toEqual({});
  });

  it('tints each word by its state, and re-applying replaces the old tint', () => {
    const { renderPhraseBankHtml, applyMazwiStates } = loadApp();
    const block = document.createElement('div');
    block.innerHTML = renderPhraseBankHtml(ENTRY);
    document.body.appendChild(block);
    applyMazwiStates(block, { 20: 'learning', 5: 'mature', 6: 'forgot', 21: 'review' });
    const cls = (n) => block.querySelector(`[data-n="${n}"]`).className;
    expect(cls(20)).toContain('sv-pb-chip-learning');
    expect(cls(21)).toContain('sv-pb-chip-review');
    expect(cls(5)).toContain('sv-pb-chip-mature');
    expect(cls(6)).toContain('sv-pb-chip-forgot');
    applyMazwiStates(block, { 20: 'mature' });
    expect(cls(20)).toContain('sv-pb-chip-mature');
    expect(cls(20)).not.toContain('sv-pb-chip-learning');
    expect(cls(5)).not.toContain('sv-pb-chip-');
  });

  it('ignores a state it does not know', () => {
    const { renderPhraseBankHtml, applyMazwiStates } = loadApp();
    const block = document.createElement('div');
    block.innerHTML = renderPhraseBankHtml(ENTRY);
    applyMazwiStates(block, { 20: '<script>' });
    expect(block.querySelector('[data-n="20"]').className).not.toContain('sv-pb-chip-');
  });
});

describe('loading the member\'s states', () => {
  it('reads the signed-in member\'s own deck', async () => {
    const { loadMazwiStates, _setCardStateFn } = loadApp({ supabaseOverrides: {
      ...SIGNED_IN, store: { user_decks: [
        { user_id: 'u1', deck: [{ n: 20, fake: 'review' }] },
        { user_id: 'someone-else', deck: [{ n: 21, fake: 'mature' }] },
      ] },
    } });
    _setCardStateFn(fakeState);
    expect(await loadMazwiStates()).toEqual({ 20: 'review' });
  });

  it('gives no tint (and no error) for a visitor who is not signed in', async () => {
    const { loadMazwiStates, _setCardStateFn } = loadApp({ supabaseOverrides: {
      auth: { getSession: async () => ({ data: { session: null } }) }, store: { user_decks: [{ user_id: 'u1', deck: [{ n: 20, fake: 'review' }] }] },
    } });
    _setCardStateFn(fakeState);
    expect(await loadMazwiStates()).toEqual({});
  });

  it('gives no tint for a member who has never opened mazwi (no saved deck)', async () => {
    const { loadMazwiStates, _setCardStateFn } = loadApp({ supabaseOverrides: { ...SIGNED_IN, store: { user_decks: [] } } });
    _setCardStateFn(fakeState);
    expect(await loadMazwiStates()).toEqual({});
  });

  it('gives no tint when mazwi\'s state rule could not be loaded', async () => {
    const { loadMazwiStates } = loadApp({ supabaseOverrides: { ...SIGNED_IN, store: { user_decks: [{ user_id: 'u1', deck: [{ n: 20, fake: 'review' }] }] } } });
    expect(await loadMazwiStates()).toEqual({}); // no _setCardStateFn, and no network in tests
  });

  it('tints the phrase bank on the page once the states arrive', async () => {
    const { mountPhraseBank, _setLessonsManifest, _setCardStateFn } = loadApp({ fixture: 'full-lesson-page', supabaseOverrides: {
      ...SIGNED_IN, store: { user_decks: [{ user_id: 'u1', deck: [{ n: 20, fake: 'forgot' }, { n: 5, fake: 'mature' }] }] },
    } });
    _setCardStateFn(fakeState);
    _setLessonsManifest([ENTRY]);
    document.querySelector('.fcom_lesson_title h1').textContent = 'Zuva 2 — Hesi, Mhoro, Mhoroi';
    mountPhraseBank(document.querySelector('.fcom_lesson_content'));
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    const block = document.getElementById('sv-phrasebank');
    expect(block.querySelector('[data-n="20"]').className).toContain('sv-pb-chip-forgot');
    expect(block.querySelector('[data-n="5"]').className).toContain('sv-pb-chip-mature');
    expect(block.querySelector('[data-n="21"]').className).not.toContain('sv-pb-chip-');
  });
});
