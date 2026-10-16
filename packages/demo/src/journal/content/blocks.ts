import { t } from '../../runtime/fields.js';

/**
 * Block helpers for article sources. Rich-text arguments use the markup from runtime/dast.ts
 * and become DAST at build time. Pass `undefined` for `en` to leave a translation missing.
 */
type Block = { type: string; data: Record<string, unknown>; meta?: Record<string, unknown> };

const ml = (fr: string, en?: string) => (en === undefined ? { fr } : t(fr, en));

export const b = {
    p: (fr: string, en?: string): Block => ({
        type: 'core/paragraph',
        data: { content: ml(fr, en) }
    }),
    h: (fr: string, en?: string, level: 'h2' | 'h3' | 'h4' = 'h2', variant?: string): Block => ({
        type: 'core/heading',
        data: { text: ml(fr, en), level },
        ...(variant && { meta: { variant } })
    }),
    quote: (fr: string, en: string | undefined, author?: string): Block => ({
        type: 'core/quote',
        data: { text: ml(fr, en), ...(author && { author: t(author, author) }) }
    }),
    pull: (fr: string, en: string | undefined, attribution?: string): Block => ({
        type: 'demo/pull-quote',
        data: { text: ml(fr, en), ...(attribution && { attribution: t(attribution, attribution) }) }
    }),
    image: (art: string, captionFr?: string, captionEn?: string, size?: string): Block => ({
        type: 'core/image',
        data: { image: { art }, ...(captionFr && { caption: ml(captionFr, captionEn) }) },
        ...(size && { meta: { size } })
    }),
    gallery: (arts: string[], captionFr?: string, captionEn?: string): Block => ({
        type: 'core/gallery',
        data: {
            images: arts.map(art => ({ art })),
            ...(captionFr && { caption: ml(captionFr, captionEn) })
        }
    }),
    callout: (number: string, fr: string, en?: string): Block => ({
        type: 'demo/data-callout',
        data: { number, label: ml(fr, en) }
    }),
    teletype: (fr: string, en?: string): Block => ({
        type: 'demo/teletype',
        data: { text: ml(fr, en) }
    }),
    note: (text: string): Block => ({ type: 'core/note', data: { text } }),
    warning: (code: string, fr: string, en?: string): Block => ({
        type: 'demo/warning',
        data: { code, text: ml(fr, en) }
    }),
    divider: (): Block => ({ type: 'core/divider', data: {} }),
    spacer: (size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md'): Block => ({
        type: 'core/spacer',
        data: { size }
    }),
    code: (code: string, language: string, filename?: string): Block => ({
        type: 'core/code',
        data: { code, language, ...(filename && { filename }) }
    }),
    table: (
        columns: string[],
        rows: string[][],
        captionFr?: string,
        captionEn?: string
    ): Block => ({
        type: 'core/table',
        data: {
            table: { value: { columnTitles: columns, rows } },
            ...(captionFr && { caption: ml(captionFr, captionEn) })
        }
    }),
    dialogue: (exchanges: Array<['human' | 'robot', string, string, string?]>): Block => ({
        type: 'demo/dialogue',
        data: {
            exchanges: exchanges.map(([speaker, name, fr, en]) => ({
                speaker,
                speaker_name: name,
                text: ml(fr, en)
            }))
        }
    }),
    timeline: (events: Array<[string, string, string?]>): Block => ({
        type: 'demo/timeline',
        data: { events: events.map(([year, fr, en]) => ({ year, event: ml(fr, en) })) }
    }),
    transmission: (
        source: string,
        frequency: string,
        timestamp: string,
        fr: string,
        en?: string
    ): Block => ({
        type: 'demo/transmission',
        data: { source, frequency, timestamp, body: ml(fr, en) }
    }),
    embed: (url: string, titleFr: string, titleEn?: string): Block => ({
        type: 'core/embed',
        data: { url, title: ml(titleFr, titleEn) }
    }),
    video: (
        provider: string,
        target: string,
        titleFr: string,
        titleEn?: string,
        descFr?: string,
        descEn?: string
    ): Block => ({
        type: 'core/video',
        data: {
            video: { provider, target },
            title: ml(titleFr, titleEn),
            ...(descFr && { description: ml(descFr, descEn) })
        }
    }),
    audio: (
        src: string,
        titleFr: string,
        titleEn?: string,
        transcriptFr?: string,
        transcriptEn?: string
    ): Block => ({
        type: 'core/audio',
        data: {
            src,
            title: ml(titleFr, titleEn),
            ...(transcriptFr && { transcript: ml(transcriptFr, transcriptEn) })
        }
    }),
    button: (url: string, labelFr: string, labelEn?: string): Block => ({
        type: 'core/button',
        data: { link: { url, label: labelEn ? `${labelFr} / ${labelEn}` : labelFr } }
    }),
    form: (
        formId: string,
        titleFr: string,
        titleEn?: string,
        successFr?: string,
        successEn?: string
    ): Block => ({
        type: 'core/form',
        data: {
            formId,
            title: ml(titleFr, titleEn),
            ...(successFr && { successMessage: ml(successFr, successEn) })
        }
    }),
    hero: (
        titleFr: string,
        titleEn: string,
        art: string,
        subtitleFr?: string,
        subtitleEn?: string
    ): Block => ({
        type: 'core/hero',
        data: {
            title: t(titleFr, titleEn),
            backgroundImage: { art },
            alignment: 'left',
            headingLevel: 'h1',
            ...(subtitleFr && { subtitle: ml(subtitleFr, subtitleEn) })
        }
    }),
    ad: (
        headlineFr: string,
        headlineEn: string,
        bodyFr: string,
        bodyEn: string,
        label: [string, string],
        url: string,
        eyebrow?: [string, string]
    ): Block => ({
        type: 'demo/ad',
        data: {
            ...(eyebrow && { eyebrow: t(...eyebrow) }),
            headline: t(headlineFr, headlineEn),
            body: t(bodyFr, bodyEn),
            cta_label: t(...label),
            cta_url: url
        },
        meta: { variant: 'strip' }
    }),
    specCard: (
        model: string,
        series: string,
        status: string,
        specs: Array<[string, string, string, string]>
    ): Block => ({
        type: 'demo/spec-card',
        data: {
            model_name: model,
            series,
            status,
            specs: specs.map(([lfr, len, vfr, ven]) => ({ label: t(lfr, len), value: t(vfr, ven) }))
        }
    }),
    classified: (
        classification: string,
        titleFr: string,
        titleEn: string,
        fr: string,
        en?: string
    ): Block => ({
        type: 'demo/classified',
        data: { classification, title: t(titleFr, titleEn), content: ml(fr, en) }
    }),
    signalMap: (
        lat: number,
        lng: number,
        depth: string,
        temperature: string,
        strength: string,
        fr: string,
        en: string
    ): Block => ({
        type: 'demo/signal-map',
        data: {
            latitude: lat,
            longitude: lng,
            depth,
            temperature,
            signal_strength: strength,
            label: t(fr, en)
        }
    }),
    atmosphere: (mood: string, intensity = 'medium', duration?: number): Block => ({
        type: 'demo/atmosphere',
        data: { mood, intensity, ...(duration !== undefined && { duration }) }
    }),
    kinetic: (fr: string, en: string, animation = 'words'): Block => ({
        type: 'demo/kinetic-text',
        data: { text: t(fr, en), animation }
    }),
    marker: (event: string, offset = 'center'): Block => ({
        type: 'demo/scroll-marker',
        data: { event, offset }
    }),
    brief: (fr: string, en: string, style: string, color: string): Block => ({
        type: 'demo/illustration-brief',
        data: { description: t(fr, en), style, placeholder_color: color }
    })
};
