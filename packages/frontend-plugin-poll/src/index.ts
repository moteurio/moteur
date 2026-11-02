/**
 * The poll block (`play/poll`) on a site: the question and its choices come with the block, so
 * the poll is on the page at once. The browser only calls the API to vote, and for the counts.
 *
 * - `renderPoll(data, locale, { apiBase, projectId })` returns HTML: a `<moteur-poll>` holding
 *   the form, for a block registry or server rendering;
 * - `import '@moteurio/frontend-plugin-poll/element'` makes that form vote.
 *
 * A visitor votes once per poll (the API checks, and the browser remembers); after voting they
 * see the counts when the editor chose "Show results after voting", a thank you otherwise.
 */

export type PollBlock = { type?: string; data?: PollBlockData };

export type PollBlockData = {
    pollId?: string;
    question?: Localized;
    options?: { id?: string; label?: Localized }[];
    allowMultiple?: boolean;
    showResults?: boolean;
};

export type Localized = string | Record<string, string | undefined> | undefined;

export type PollLabels = {
    vote: string;
    thanks: string;
    failed: string;
    votes: (n: number) => string;
};

export type PollOptions = {
    /** The API's address (`https://api.moteur.io`). */
    apiBase: string;
    projectId: string;
    /** The words the poll adds, English by default. */
    labels?: Partial<PollLabels>;
};

export const ENGLISH: PollLabels = {
    vote: 'Vote',
    thanks: 'Thank you for voting.',
    failed: 'Your vote did not go through. Try again in a moment.',
    votes: n => (n === 1 ? '1 vote' : `${n} votes`)
};

const escapeHtml = (s: string) =>
    s.replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
    );

export function pick(value: Localized, locale?: string): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    const own = locale ? value[locale] : undefined;
    if (typeof own === 'string' && own) return own;
    return Object.values(value).find((v): v is string => typeof v === 'string' && v !== '') ?? '';
}

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** The poll as a site shows it: only choices with an id and a label. */
export function pollOf(data: PollBlockData | undefined, locale?: string) {
    const pollId = data?.pollId?.trim() ?? '';
    const question = pick(data?.question, locale).trim();
    const options = (data?.options ?? [])
        .map(o => ({ id: String(o?.id ?? '').trim(), label: pick(o?.label, locale).trim() }))
        .filter(o => ID.test(o.id) && o.label);
    return {
        pollId,
        question,
        options,
        multiple: !!data?.allowMultiple,
        showResults: data?.showResults !== false
    };
}

/** The block as HTML: the form, inside `<moteur-poll>`. Empty without a poll id, question or choices. */
export function renderPoll(
    data: PollBlockData | undefined,
    locale: string | undefined,
    options: PollOptions
): string {
    const poll = pollOf(data, locale);
    if (!ID.test(poll.pollId) || !poll.question || !poll.options.length) return '';
    const labels = { ...ENGLISH, ...options.labels };
    const kind = poll.multiple ? 'checkbox' : 'radio';
    const name = `moteur-poll-${poll.pollId}`;
    const choices = poll.options
        .map(
            o =>
                `<label><input type="${kind}" name="${escapeHtml(name)}" value="${escapeHtml(o.id)}"${poll.multiple ? '' : ' required'}> ` +
                `<span>${escapeHtml(o.label)}</span></label>`
        )
        .join('');
    return (
        `<moteur-poll api-base="${escapeHtml(options.apiBase)}" project-id="${escapeHtml(options.projectId)}" ` +
        `poll-id="${escapeHtml(poll.pollId)}"${poll.showResults ? ' show-results' : ''}>` +
        `<form class="moteur-poll"><fieldset><legend>${escapeHtml(poll.question)}</legend>${choices}</fieldset>` +
        `<button type="submit">${escapeHtml(labels.vote)}</button><p role="status" aria-live="polite"></p></form>` +
        `</moteur-poll>`
    );
}

/** The counts as HTML: each choice, its share and its votes, in the order the editor gave. */
export function renderResults(
    poll: { question: string; options: { id: string; label: string }[] },
    counts: Record<string, number>,
    labels: PollLabels = ENGLISH
): string {
    const total = poll.options.reduce((n, o) => n + (counts[o.id] ?? 0), 0);
    const rows = poll.options
        .map(o => {
            const n = counts[o.id] ?? 0;
            const share = total ? Math.round((100 * n) / total) : 0;
            return (
                `<li><span class="moteur-poll__label">${escapeHtml(o.label)}</span> ` +
                `<span class="moteur-poll__share">${share}%</span> ` +
                `<span class="moteur-poll__votes">(${escapeHtml(labels.votes(n))})</span>` +
                `<span class="moteur-poll__bar" style="width: ${share}%" aria-hidden="true"></span></li>`
            );
        })
        .join('');
    return `<div class="moteur-poll moteur-poll--results"><p><strong>${escapeHtml(poll.question)}</strong></p><ul>${rows}</ul></div>`;
}

/**
 * For a block registry, with the API's address:
 * `createBlockRegistry({ load: () => pollRenderer({ apiBase, projectId }) })`.
 */
export function pollRenderer(options: PollOptions) {
    return {
        render: (block: PollBlock, locale: string) => renderPoll(block?.data, locale, options)
    };
}

const memory = {
    get(key: string): boolean {
        try {
            return globalThis.localStorage?.getItem(key) === '1';
        } catch {
            return false;
        }
    },
    set(key: string) {
        try {
            globalThis.localStorage?.setItem(key, '1');
        } catch {
            // Private window: the API still counts one vote.
        }
    }
};

/**
 * Makes `<moteur-poll>` (as `renderPoll` writes it) vote. `labels` on the element, a property,
 * changes the words it adds.
 */
export function registerMoteurPollElement(): void {
    if (typeof customElements === 'undefined' || customElements.get('moteur-poll')) return;

    class MoteurPoll extends HTMLElement {
        labels: Partial<PollLabels> = {};

        get #url() {
            const base = (this.getAttribute('api-base') ?? '').replace(/\/$/, '');
            const project = encodeURIComponent(this.getAttribute('project-id') ?? '');
            return `${base}/projects/${project}/play/polls/${encodeURIComponent(this.getAttribute('poll-id') ?? '')}`;
        }

        get #remembered() {
            return `moteur-poll:${this.getAttribute('project-id')}:${this.getAttribute('poll-id')}`;
        }

        get #words(): PollLabels {
            return { ...ENGLISH, ...this.labels };
        }

        #poll() {
            const form = this.querySelector('form');
            return {
                question: form?.querySelector('legend')?.textContent ?? '',
                options: [...(form?.querySelectorAll<HTMLInputElement>('input') ?? [])].map(i => ({
                    id: i.value,
                    label: i.closest('label')?.textContent?.trim() ?? i.value
                }))
            };
        }

        connectedCallback() {
            const form = this.querySelector('form');
            if (!form) return;
            if (memory.get(this.#remembered)) void this.#after();
            form.addEventListener('submit', e => {
                e.preventDefault();
                void this.#vote(form);
            });
        }

        async #vote(form: HTMLFormElement) {
            const chosen = [...form.querySelectorAll<HTMLInputElement>('input:checked')].map(
                i => i.value
            );
            const status = form.querySelector('[role="status"]');
            if (!chosen.length) return;
            const button = form.querySelector('button');
            if (button) button.disabled = true;
            try {
                const res = await globalThis.fetch(`${this.#url}/vote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ optionIds: chosen })
                });
                if (!res.ok && res.status !== 409) throw new Error(String(res.status));
                const { counts } = (await res.json()) as { counts?: Record<string, number> };
                memory.set(this.#remembered);
                this.#show(counts);
            } catch {
                if (status) status.textContent = this.#words.failed;
                if (button) button.disabled = false;
            }
        }

        async #after() {
            if (!this.hasAttribute('show-results')) return this.#show(undefined);
            try {
                const res = await globalThis.fetch(`${this.#url}/results`);
                if (res.ok)
                    this.#show(((await res.json()) as { counts?: Record<string, number> }).counts);
            } catch {
                // The form stays: voting again is answered with the counts.
            }
        }

        #show(counts: Record<string, number> | undefined) {
            const poll = this.#poll();
            const words = this.#words;
            this.innerHTML =
                this.hasAttribute('show-results') && counts
                    ? renderResults(poll, counts, words)
                    : `<p class="moteur-poll moteur-poll--thanks" role="status">${escapeHtml(words.thanks)}</p>`;
        }
    }

    customElements.define('moteur-poll', MoteurPoll);
}
