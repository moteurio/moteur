// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    pollRenderer,
    registerMoteurPollElement,
    renderPoll,
    renderResults,
    type PollBlockData
} from '../src/index.js';

const api = { apiBase: 'https://api.example/', projectId: 'site' };
const lunch: PollBlockData = {
    pollId: 'lunch',
    question: { en: 'Lunch?', fr: 'Déjeuner ?' },
    options: [
        { id: 'soup', label: { en: 'Soup', fr: 'Soupe' } },
        { id: 'pizza', label: { en: 'Pizza' } },
        { id: '', label: 'No id' }
    ],
    showResults: true
};

const answer = (body: unknown, status = 200) =>
    vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }));

const mount = (data = lunch) => {
    document.body.innerHTML = renderPoll(data, 'en', api);
    return document.querySelector('moteur-poll')!;
};
const flush = () => new Promise(r => setTimeout(r, 0));

describe('the poll block on a site', () => {
    beforeEach(() => {
        registerMoteurPollElement();
        localStorage.clear();
    });
    afterEach(() => vi.unstubAllGlobals());

    it('is on the page at once: the question and its choices, in the language asked for', () => {
        const html = renderPoll(lunch, 'fr', api);
        expect(html).toContain('<legend>Déjeuner ?</legend>');
        expect(html).toContain('value="soup" required> <span>Soupe</span>');
        expect(html).toContain('<span>Pizza</span>');
        expect(html).not.toContain('No id');
        expect(renderPoll({ ...lunch, allowMultiple: true }, 'en', api)).toContain(
            'type="checkbox"'
        );
        expect(pollRenderer(api).render({ data: { pollId: 'x', question: 'Q?' } }, 'en')).toBe('');
    });

    it('escapes everything it writes', () => {
        const html = renderPoll(
            {
                pollId: 'p',
                question: '<img src=x onerror=alert(1)>',
                options: [{ id: 'a', label: '<b>A</b>' }]
            },
            'en',
            { apiBase: '"><script>', projectId: 's' }
        );
        expect(html).not.toMatch(/<img|<b>|<script/);
        expect(
            renderResults({ question: 'Q', options: [{ id: 'a', label: '<i>x</i>' }] }, { a: 1 })
        ).not.toContain('<i>');
    });

    it('votes, then shows the counts in the order the editor gave', async () => {
        const fetch = answer({ ok: true, counts: { soup: 3, pizza: 1 } });
        vi.stubGlobal('fetch', fetch);
        const el = mount();
        el.querySelector<HTMLInputElement>('input[value="soup"]')!.checked = true;
        el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(fetch.mock.calls[0][0]).toBe(
            'https://api.example/projects/site/play/polls/lunch/vote'
        );
        expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))).toEqual({
            optionIds: ['soup']
        });
        expect([...el.querySelectorAll('li')].map(li => li.textContent)).toEqual([
            'Soup 75% (3 votes)',
            'Pizza 25% (1 vote)'
        ]);
        // Next visit: the counts, not the form.
        vi.stubGlobal('fetch', answer({ pollId: 'lunch', counts: { soup: 4, pizza: 1 } }));
        const again = mount();
        await flush();
        await flush();
        expect(again.querySelector('form')).toBeNull();
        expect(again.textContent).toContain('80%');
    });

    it('says thank you when the editor keeps the results to themselves, and says so when a vote fails', async () => {
        vi.stubGlobal('fetch', answer({ error: 'down' }, 500));
        const el = mount({ ...lunch, showResults: false });
        el.querySelector<HTMLInputElement>('input')!.checked = true;
        el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(el.querySelector('[role="status"]')!.textContent).toContain('did not go through');
        expect(el.querySelector('button')!.disabled).toBe(false);
        vi.stubGlobal('fetch', answer({ error: 'Already voted', counts: { soup: 2 } }, 409));
        el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(el.textContent).toBe('Thank you for voting.');
    });
});
