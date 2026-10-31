import type { Block, EmailContent, Rich, RichPart } from './layout.js';
import type { EmailLocale } from './settings.js';

/**
 * Every email the engine sends, in English and in Canadian French (docs/writing.md in
 * @moteurio/design: plain and brief; vous; narrow no-break spaces before : ? ! ;).
 */

/** Narrow no-break space, before French : ? ! ; */
const N = ' ';
/** No-break space, between a number and its unit. */
const S = ' ';

export const CODE_MINUTES = 15;
export const VERIFY_MINUTES = 10;

export interface EmailData {
    /** A code to sign in, with a sign-in link when the server knows the Studio's address. */
    signin: { email: string; code: string; link?: string };
    /** A code to make an account, and the link that does the same. */
    signup: { email: string; code: string; link?: string };
    /** Too many wrong codes today: only the link, which still works. */
    'signin-link': { email: string; link: string; purpose: 'signin' | 'signup' };
    /** A code to confirm the address someone gave when signing in with a provider. */
    verify: { email: string; code: string };
    /** A code to make this address the account's sign-in email. */
    'email-change': { email: string; code: string };
    /** To the old address: the account signs in with another one now. */
    'email-changed': { email: string; to: string };
    welcome: {
        email: string;
        /** Their name, when they gave one. */
        name?: string;
        studioUrl?: string;
        /** They made a password (an account made from an invitation's form). */
        password?: boolean;
        /** They came by invitation: the project they joined. */
        joined?: {
            project: string;
            projectId?: string;
            description?: string;
            inviter?: string;
            roles?: string[];
        };
    };
    invite: {
        email: string;
        inviter: string;
        /** The inviter's address, so the reader can tell who it is. */
        inviterEmail?: string;
        project: string;
        projectDescription?: string;
        /** The project's site address (`siteUrl`). */
        projectSite?: string;
        /** The roles they are invited with. */
        roles?: string[];
        /** A few words from the inviter, plain text. */
        note?: string;
        url: string;
        days: number;
        /** When the link stops working (ISO date). */
        expiresAt?: string;
        /** Replies go to the person who invited. */
        replyToInviter?: boolean;
    };
    review: {
        type: 'review_requested' | 'approved' | 'rejected';
        /** Who asked (requested) or who decided (approved, rejected). */
        person?: string;
        project: string;
        resource: 'entry' | 'page';
        url?: string;
        unsubscribeUrl?: string;
    };
    /** A form's answers, to the project's team. */
    'form-notice': {
        project: string;
        form: string;
        subject: string;
        rows: { label: string; value: string }[];
        text: string;
        canReply: boolean;
    };
    /** Words a project wrote, to whoever a form's email action names. */
    'form-message': { project: string; subject: string; body: string };
    /** A form's confirmation to whoever filled it in: the project's words, then their answers. */
    'form-confirm': {
        project: string;
        /** The project's site address (`siteUrl`). */
        site?: string;
        form: string;
        subject: string;
        /** The project's own words. */
        body: string;
        rows: { label: string; value: string }[];
    };
    /** The operator's check that mail goes out. */
    test: { from: string; server: string; at: string; signedBy?: string };
}

export type EmailKind = keyof EmailData;
export const EMAIL_KINDS = [
    'signin',
    'signup',
    'signin-link',
    'verify',
    'email-change',
    'email-changed',
    'welcome',
    'invite',
    'review',
    'form-notice',
    'form-message',
    'form-confirm',
    'test'
] as const satisfies readonly EmailKind[];

/** Two ways to set the emails that are someone's first contact, until one is picked (see the lab). */
export const EMAIL_VARIANTS = ['a', 'b'] as const;
export type EmailVariant = (typeof EMAIL_VARIANTS)[number];
export const VARIANT_KINDS: EmailKind[] = ['invite', 'welcome', 'form-confirm'];

type Ctx = {
    locale: EmailLocale;
    product: string;
    /** What the product is, in a sentence or two. */
    tagline: string;
    supportUrl?: string;
    variant: EmailVariant;
};
type Template<K extends EmailKind> = (data: EmailData[K], ctx: Ctx) => EmailContent;

const strong = (s: string) => ({ strong: s });

/** The line about the product when the operator wrote none. */
export function defaultTagline(locale: EmailLocale, P: string): string {
    return locale === 'fr'
        ? `${P} est l’endroit où les équipes rédigent, traduisent et publient le contenu de leurs sites. Chaque changement est conservé, et le contenu leur appartient.`
        : `${P} is where teams write, translate and publish their websites’ content. Every change is kept, and the content stays theirs.`;
}

const aboutProduct = ({ locale, product: P, tagline }: Ctx): Block => ({
    t: 'about',
    title: locale === 'fr' ? `Qu’est-ce que ${P}${N}?` : `What is ${P}?`,
    text: tagline
});

/** A site's address as a link showing its host; plain text unless it is http(s). */
function siteLink(url: string): RichPart {
    const host = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return /^https?:\/\//.test(url) ? { href: url, text: host } : host;
}

/** A day, as the reader's language writes it: "Sat, Nov 7", « sam. 7 nov. ». */
function dayOf(iso: string, locale: EmailLocale): string | undefined {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return undefined;
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
    }).format(at);
}

const ROLE_NAMES: Record<string, { en: string; fr: string }> = {
    writer: { en: 'Writer', fr: 'Auteur·e' },
    translator: { en: 'Translator', fr: 'Traduction' },
    reviewer: { en: 'Reviewer', fr: 'Réviseur·e' },
    lead: { en: 'Content lead', fr: 'Responsable du contenu' },
    builder: { en: 'Builder', fr: 'Conception' },
    billing: { en: 'Billing', fr: 'Facturation' },
    admin: { en: 'Admin', fr: 'Admin' },
    developer: { en: 'Developer', fr: 'Développement' }
};
/** What each role lets someone do, from the widest down: the first one held is said. */
const ROLE_CAN: [string, { en: string; fr: string }][] = [
    [
        'admin',
        {
            en: 'run the project: its content, settings and people',
            fr: `gérer le projet${N}: son contenu, ses réglages et son équipe`
        }
    ],
    [
        'developer',
        {
            en: 'connect the project to its site: API channels, keys and webhooks',
            fr: `brancher le projet sur son site${N}: canaux d’API, clés et webhooks`
        }
    ],
    [
        'lead',
        {
            en: 'write, review and publish, and look after media and menus',
            fr: 'écrire, réviser et publier, et vous occuper des médias et des menus'
        }
    ],
    [
        'builder',
        {
            en: 'shape the project: its models, blocks, templates and forms',
            fr: `façonner le projet${N}: ses modèles, blocs, gabarits et formulaires`
        }
    ],
    [
        'reviewer',
        {
            en: 'write, and approve or send back what others send for review',
            fr: 'écrire, et approuver ou renvoyer ce que les autres envoient en révision'
        }
    ],
    [
        'writer',
        {
            en: 'write and edit entries and pages, and send them for review',
            fr: 'écrire et modifier les entrées et les pages, et les envoyer en révision'
        }
    ],
    [
        'translator',
        {
            en: 'translate entries and pages into the project’s other languages',
            fr: 'traduire les entrées et les pages dans les autres langues du projet'
        }
    ],
    [
        'billing',
        {
            en: 'see and change the project’s plan and invoices',
            fr: 'voir et changer le forfait et les factures du projet'
        }
    ]
];

/** The roles' names, and what the widest one lets them do, in one sentence. */
function roleOf(
    roles: string[] | undefined,
    locale: EmailLocale,
    now = false
): { names: string; can: string } {
    const known = (roles ?? []).filter(r => ROLE_NAMES[r]);
    // An account given no role is a Writer.
    const held = known.length ? known : ['writer'];
    const names = held.map(r => ROLE_NAMES[r][locale]).join(' · ');
    const can = ROLE_CAN.find(([r]) => held.includes(r))![1][locale];
    const fr = locale === 'fr';
    return {
        names,
        can: fr
            ? `${now ? 'Vous pouvez' : 'Vous pourrez'} ${can}.`
            : `${now ? 'You can' : 'You’ll be able to'} ${can}.`
    };
}

/** A project's words as paragraphs: a blank line starts a new one. */
function paragraphs(body: string): Block[] {
    return body
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => ({ t: 'p' as const, text: p }));
}

const signin: Template<'signin'> = ({ email, code, link }, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `${code} est votre code ${P}`,
              preheader: `Saisissez-le pour vous connecter. Il ne sert qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Votre code de connexion' },
                  {
                      t: 'p',
                      text: `Saisissez ce code là où vous l’avez demandé pour vous connecter à ${P}.`
                  },
                  { t: 'code', code },
                  ...(link
                      ? [
                            { t: 'p' as const, text: `Ou connectez-vous en un clic${N}:` },
                            {
                                t: 'button' as const,
                                label: `Se connecter à ${P}`,
                                href: link,
                                fallback: `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
                            }
                        ]
                      : []),
                  {
                      t: 'note',
                      text: link
                          ? `Le code et le lien ne servent qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`
                          : `Il ne sert qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`
                  }
              ],
              why: [
                  `Quelqu’un a demandé à se connecter à ${P} avec l’adresse `,
                  strong(email),
                  `. Si ce n’était pas vous, ignorez ce courriel${N}: rien ne se passe sans le code.`
              ]
          }
        : {
              subject: `${code} is your ${P} code`,
              preheader: `Type it in to sign in. It works once, for ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Your sign-in code' },
                  { t: 'p', text: `Type this code where you asked for it to sign in to ${P}.` },
                  { t: 'code', code },
                  ...(link
                      ? [
                            { t: 'p' as const, text: 'Or sign in with one click:' },
                            {
                                t: 'button' as const,
                                label: `Sign in to ${P}`,
                                href: link,
                                fallback: 'If the button doesn’t work, open this address:'
                            }
                        ]
                      : []),
                  {
                      t: 'note',
                      text: link
                          ? `The code and the link work once, for ${CODE_MINUTES}${S}minutes.`
                          : `It works once, for ${CODE_MINUTES}${S}minutes.`
                  }
              ],
              why: [
                  `Someone asked to sign in to ${P} as `,
                  strong(email),
                  '. If it wasn’t you, ignore this email: nothing happens without the code.'
              ]
          };

const signup: Template<'signup'> = ({ email, code, link }, ctx) => {
    const { locale, product: P } = ctx;
    // Often the very first email someone gets from the server: it says what the product is too.
    return locale === 'fr'
        ? {
              subject: `${code} est votre code ${P}`,
              preheader: `Saisissez-le pour terminer votre compte. Il ne sert qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Terminez la création de votre compte' },
                  {
                      t: 'p',
                      text: `Saisissez ce code là où vous l’avez demandé, et votre compte ${P} est prêt.`
                  },
                  { t: 'code', code },
                  ...(link
                      ? [
                            { t: 'p' as const, text: `Ou terminez en un clic${N}:` },
                            {
                                t: 'button' as const,
                                label: 'Terminer mon compte',
                                href: link,
                                fallback: `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
                            }
                        ]
                      : []),
                  {
                      t: 'note',
                      text: link
                          ? `Le code et le lien ne servent qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`
                          : `Il ne sert qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`
                  },
                  aboutProduct(ctx)
              ],
              why: [
                  `Quelqu’un a demandé à créer un compte ${P} pour l’adresse `,
                  strong(email),
                  `. Si ce n’était pas vous, ignorez ce courriel${N}: aucun compte n’est créé sans le code.`
              ]
          }
        : {
              subject: `${code} is your ${P} code`,
              preheader: `Type it in to finish making your account. It works once, for ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Finish making your account' },
                  {
                      t: 'p',
                      text: `Type this code where you asked for it, and your ${P} account is ready.`
                  },
                  { t: 'code', code },
                  ...(link
                      ? [
                            { t: 'p' as const, text: 'Or finish with one click:' },
                            {
                                t: 'button' as const,
                                label: 'Finish my account',
                                href: link,
                                fallback: 'If the button doesn’t work, open this address:'
                            }
                        ]
                      : []),
                  {
                      t: 'note',
                      text: link
                          ? `The code and the link work once, for ${CODE_MINUTES}${S}minutes.`
                          : `It works once, for ${CODE_MINUTES}${S}minutes.`
                  },
                  aboutProduct(ctx)
              ],
              why: [
                  `Someone asked to make a ${P} account for `,
                  strong(email),
                  '. If it wasn’t you, ignore this email: no account is made without the code.'
              ]
          };
};

const signinLink: Template<'signin-link'> = ({ email, link, purpose }, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `Votre lien de connexion ${P}`,
              preheader: `Les codes sont désactivés pour aujourd’hui. Ce lien fonctionne encore, pendant ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Votre lien de connexion' },
                  {
                      t: 'p',
                      text: 'Trop de codes erronés ont été saisis pour cette adresse aujourd’hui, les codes sont donc désactivés jusqu’à demain. Ce lien fonctionne encore.'
                  },
                  {
                      t: 'button',
                      label: purpose === 'signup' ? 'Terminer mon compte' : `Se connecter à ${P}`,
                      href: link,
                      fallback: `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
                  },
                  {
                      t: 'note',
                      text: `Il ne sert qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`
                  }
              ],
              why: [
                  'Envoyé à ',
                  strong(email),
                  `. Si vous ne l’avez pas demandé, ignorez ce courriel${N}: sans ce lien, personne n’entre.`
              ]
          }
        : {
              subject: `Your ${P} sign-in link`,
              preheader: `Codes are off for today. This link still works, for ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Your sign-in link' },
                  {
                      t: 'p',
                      text: 'Too many wrong codes were typed for this address today, so codes are off until tomorrow. This link still works.'
                  },
                  {
                      t: 'button',
                      label: purpose === 'signup' ? 'Finish my account' : `Sign in to ${P}`,
                      href: link,
                      fallback: 'If the button doesn’t work, open this address:'
                  },
                  { t: 'note', text: `It works once, for ${CODE_MINUTES}${S}minutes.` }
              ],
              why: [
                  'Sent to ',
                  strong(email),
                  '. If you didn’t ask for it, ignore this email: without this link, nobody gets in.'
              ]
          };

const verify: Template<'verify'> = ({ email, code }, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `${code} est votre code de vérification ${P}`,
              preheader: `Saisissez-le pour confirmer votre adresse. Il ne sert qu’une fois, pendant ${VERIFY_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Confirmez votre adresse' },
                  {
                      t: 'p',
                      text: `Saisissez ce code là où vous l’avez demandé pour confirmer cette adresse auprès de ${P}.`
                  },
                  { t: 'code', code },
                  {
                      t: 'note',
                      text: `Il ne sert qu’une fois, pendant ${VERIFY_MINUTES}${S}minutes.`
                  }
              ],
              why: [
                  `Quelqu’un qui se connecte à ${P} a donné l’adresse `,
                  strong(email),
                  '. Si ce n’était pas vous, ignorez ce courriel.'
              ]
          }
        : {
              subject: `${code} is your ${P} verification code`,
              preheader: `Type it in to confirm your email. It works once, for ${VERIFY_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Confirm your email' },
                  {
                      t: 'p',
                      text: `Type this code where you asked for it to confirm this address for ${P}.`
                  },
                  { t: 'code', code },
                  { t: 'note', text: `It works once, for ${VERIFY_MINUTES}${S}minutes.` }
              ],
              why: [
                  `Someone signing in to ${P} gave `,
                  strong(email),
                  ' as their address. If it wasn’t you, ignore this email.'
              ]
          };

/** The first email of someone who joins a project: who invited them, to what, as what. */
const invite: Template<'invite'> = (d, ctx) => {
    const { locale, product: P, variant } = ctx;
    const fr = locale === 'fr';
    const first = d.inviter.split(/\s+/)[0] || d.inviter;
    const role = roleOf(d.roles, locale);
    const until = d.expiresAt ? dayOf(d.expiresAt, locale) : undefined;
    const site = d.projectSite ? siteLink(d.projectSite) : undefined;
    const project: Block[] = [
        { t: 'h2', text: d.project },
        ...(d.projectDescription ? [{ t: 'p' as const, text: d.projectDescription }] : []),
        ...(site ? [{ t: 'note' as const, text: [site] }] : [])
    ];
    const note: Block[] = d.note
        ? [{ t: 'quote', label: fr ? `Un mot de ${first}` : `A note from ${first}`, text: d.note }]
        : [];
    const button: Block = {
        t: 'button',
        label: fr ? `Rejoindre ${d.project}` : `Join ${d.project}`,
        href: d.url,
        fallback: fr
            ? `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
            : 'If the button doesn’t work, open this address:'
    };
    const expiry = fr
        ? `Le lien ne sert qu’une fois, pendant ${d.days}${S}jours${until ? ` (jusqu’au ${until})` : ''}.`
        : `The link works once, for ${d.days}${S}days${until ? ` (until ${until})` : ''}.`;
    const account = fr
        ? `Vous créez votre compte ${P} avec l’adresse ${d.email}. Aucun mot de passe${N}: nous envoyons un code à cette adresse.`
        : `You make your ${P} account with ${d.email}. No password needed: we send a code to this address.`;
    const already = fr
        ? `Vous avez déjà un compte avec cette adresse${N}? Connectez-vous, et ${d.project} s’y ajoute.`
        : `Already have an account with this address? Sign in, and ${d.project} is added to it.`;
    const inviter = d.inviterEmail ? `${d.inviter} (${d.inviterEmail})` : d.inviter;
    const base = {
        subject: fr
            ? `${d.inviter} vous invite à ${d.project} sur ${P}`
            : `${d.inviter} invited you to ${d.project} on ${P}`,
        preheader: fr
            ? `Votre rôle${N}: ${role.names}. Aucun mot de passe à retenir. Le lien fonctionne pendant ${d.days}${S}jours.`
            : `Your role: ${role.names}. No password to remember. The link works for ${d.days}${S}days.`,
        why: [
            fr ? 'Envoyé à ' : 'Sent to ',
            strong(d.email),
            fr
                ? ` parce que ${inviter} a invité cette adresse. Si vous ne vous y attendiez pas, ignorez ce courriel${N}: rien ne se passe sans le lien.${d.replyToInviter ? ` Les réponses vont à ${d.inviter}.` : ''}`
                : ` because ${inviter} invited this address. If you weren’t expecting it, ignore this email: nothing happens unless you open the link.${d.replyToInviter ? ` Replies go to ${d.inviter}.` : ''}`
        ]
    } satisfies Partial<EmailContent>;
    const about = aboutProduct(ctx);

    if (variant === 'b')
        return {
            ...base,
            blocks: [
                { t: 'kicker', text: fr ? `Invitation · ${P}` : `Invitation · ${P}` },
                {
                    t: 'h',
                    text: fr
                        ? `Invitation à rejoindre ${d.project}`
                        : `You’re invited to ${d.project}`
                },
                {
                    t: 'panel',
                    blocks: [
                        ...project,
                        {
                            t: 'person',
                            label: fr ? 'Invitation de' : 'Invited by',
                            name: d.inviter,
                            detail: d.inviterEmail
                        }
                    ]
                },
                ...note,
                {
                    t: 'pairs',
                    rows: [
                        {
                            label: fr ? 'Votre rôle' : 'Your role',
                            value: [strong(role.names), `. ${role.can}`]
                        },
                        {
                            label: fr ? 'Votre compte' : 'Your account',
                            value: fr
                                ? `Créé avec ${d.email} quand vous ouvrez le lien. Sans mot de passe, un code arrive à cette adresse.`
                                : `Made with ${d.email} when you open the link. No password: a code comes to this address.`
                        },
                        {
                            label: fr ? 'Le lien' : 'The link',
                            // A French date can end in an abbreviation's own full stop (« nov. »).
                            value: (fr
                                ? `Une seule fois, ${until ? `jusqu’au ${until}` : `pendant ${d.days}${S}jours`}.`
                                : `Works once, ${until ? `until ${until}` : `for ${d.days}${S}days`}.`
                            ).replace(/\.\.$/, '.')
                        }
                    ]
                },
                button,
                { t: 'note', text: already },
                about
            ]
        };
    return {
        ...base,
        blocks: [
            { t: 'person', name: d.inviter, detail: d.inviterEmail },
            { t: 'h', text: fr ? `Rejoignez ${d.project}` : `Join ${d.project}` },
            {
                t: 'p',
                text: fr
                    ? [
                          strong(d.inviter),
                          ' vous invite à travailler sur ',
                          strong(d.project),
                          ` dans ${P}.`
                      ]
                    : [
                          strong(d.inviter),
                          ' invited you to work on ',
                          strong(d.project),
                          ` in ${P}.`
                      ]
            },
            ...note,
            ...(project.length > 1 ? [{ t: 'panel' as const, blocks: project }] : []),
            {
                t: 'p',
                text: [fr ? `Votre rôle${N}: ` : 'Your role: ', strong(role.names), `. ${role.can}`]
            },
            button,
            { t: 'kicker', text: fr ? 'Quand vous ouvrez le lien' : 'When you open the link' },
            { t: 'list', items: [account, already, expiry] },
            about
        ]
    };
};

/**
 * The first email of a new account. Someone who joined by invitation reads about their project
 * and team first; someone who signed up alone, about what to do first.
 */
const welcome: Template<'welcome'> = (d, ctx) => {
    const { locale, product: P, variant } = ctx;
    const fr = locale === 'fr';
    const fallback = fr
        ? `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
        : 'If the button doesn’t work, open this address:';
    const studio = d.studioUrl ? siteLink(d.studioUrl) : undefined;
    const signIn: Rich = d.password
        ? fr
            ? [
                  ...(studio ? ['Sur ', studio, ', connectez-vous'] : [`Connectez-vous à ${P}`]),
                  ` avec votre mot de passe, ou demandez un code envoyé à `,
                  strong(d.email),
                  '.'
              ]
            : [
                  ...(studio ? ['At ', studio, ', sign in'] : [`Sign in to ${P}`]),
                  ' with your password, or ask for a code sent to ',
                  strong(d.email),
                  '.'
              ]
        : fr
          ? [
                ...(studio ? ['Allez sur ', studio, ' et saisissez '] : ['Saisissez ']),
                strong(d.email),
                `${studio ? '' : ` là où vous vous connectez à ${P}`}. Nous envoyons un code à cette adresse${N}: aucun mot de passe à retenir.`
            ]
          : [
                ...(studio ? ['Go to ', studio, ' and type '] : ['Type ']),
                strong(d.email),
                `${studio ? '' : ` where you sign in to ${P}`}. We send a code to this address, so there’s no password to remember.`
            ];
    const help: Rich | undefined = ctx.supportUrl
        ? [
              fr ? `Des questions${N}? Commencez ici${N}: ` : 'Questions? Start here: ',
              siteLink(ctx.supportUrl),
              '.'
          ]
        : undefined;
    const tagline = ctx.tagline;
    const sign: Block = { t: 'sign', text: fr ? `L’équipe ${P}` : `The ${P} team` };
    const why: Rich = [
        fr
            ? 'Vous recevez ce courriel parce que vous avez créé un compte avec l’adresse '
            : 'You get this email because you made an account with ',
        strong(d.email),
        '.'
    ];
    const hello = d.name
        ? fr
            ? `Bienvenue, ${d.name}`
            : `Welcome, ${d.name}`
        : fr
          ? `Bienvenue dans ${P}`
          : `Welcome to ${P}`;

    const j = d.joined;
    if (j) {
        const role = j.roles?.length ? roleOf(j.roles, locale, true) : undefined;
        const open: Block[] =
            d.studioUrl && j.projectId
                ? [
                      {
                          t: 'button',
                          label: fr ? `Ouvrir ${j.project}` : `Open ${j.project}`,
                          href: `${d.studioUrl}/projects/${encodeURIComponent(j.projectId)}`,
                          fallback
                      }
                  ]
                : [];
        const team: Rich = fr
            ? [
                  `Votre compte ${P} est prêt, et vous faites partie de l’équipe de `,
                  strong(j.project),
                  j.inviter ? `, avec ${j.inviter}.` : '.'
              ]
            : [
                  `Your ${P} account is ready, and you’re on the `,
                  strong(j.project),
                  j.inviter ? ` team, with ${j.inviter}.` : ' team.'
              ];
        const subject = fr ? `Bienvenue dans ${j.project}` : `Welcome to ${j.project}`;
        const preheader = fr
            ? `Votre compte ${P} est prêt. Voici comment vous y retrouver.`
            : `Your ${P} account is ready. Here’s how to find your way.`;
        if (variant === 'b')
            return {
                subject,
                preheader,
                why,
                blocks: [
                    { t: 'kicker', text: fr ? `Bienvenue dans ${P}` : `Welcome to ${P}` },
                    {
                        t: 'h',
                        text: d.name
                            ? fr
                                ? `Vous y êtes, ${d.name}`
                                : `You’re in, ${d.name}`
                            : fr
                              ? 'Vous y êtes'
                              : 'You’re in'
                    },
                    {
                        t: 'panel',
                        blocks: [
                            { t: 'h2', text: j.project },
                            ...(j.description ? [{ t: 'p' as const, text: j.description }] : []),
                            ...(j.inviter
                                ? [
                                      {
                                          t: 'person' as const,
                                          label: fr ? 'Invitation de' : 'Invited by',
                                          name: j.inviter
                                      }
                                  ]
                                : [])
                        ]
                    },
                    {
                        t: 'pairs',
                        rows: [
                            ...(role
                                ? [
                                      {
                                          label: fr ? 'Votre rôle' : 'Your role',
                                          value: [strong(role.names), `. ${role.can}`]
                                      }
                                  ]
                                : []),
                            { label: fr ? 'Se connecter' : 'Signing in', value: signIn },
                            ...(help ? [{ label: fr ? 'De l’aide' : 'Help', value: help }] : [])
                        ]
                    },
                    ...open,
                    {
                        t: 'about',
                        title: fr ? `Qu’est-ce que ${P}${N}?` : `What is ${P}?`,
                        text: tagline
                    },
                    sign
                ]
            };
        return {
            subject,
            preheader,
            why,
            blocks: [
                { t: 'h', text: hello },
                { t: 'p', text: team },
                ...(role
                    ? [
                          {
                              t: 'p' as const,
                              text: [
                                  fr ? `Votre rôle${N}: ` : 'Your role: ',
                                  strong(role.names),
                                  `. ${role.can}`
                              ]
                          }
                      ]
                    : []),
                ...open,
                {
                    t: 'about',
                    title: fr ? `Qu’est-ce que ${P}${N}?` : `What is ${P}?`,
                    text: tagline
                },
                { t: 'about', title: fr ? 'La prochaine fois' : 'Next time', text: signIn },
                ...(help
                    ? [{ t: 'about' as const, title: fr ? 'De l’aide' : 'Help', text: help }]
                    : []),
                sign
            ]
        };
    }

    const steps: Block = {
        t: 'steps',
        items: fr
            ? [
                  { text: 'Créez le projet de votre premier site, dans ses langues.' },
                  {
                      text: `Invitez votre équipe${N}: chacun son rôle, et rien qu’il puisse briser.`
                  },
                  {
                      text: `Branchez le site${N}: un canal, une clé qui ne fait que lire, et le contenu arrive.`
                  }
              ]
            : [
                  { text: 'Start your first site’s project, in its languages.' },
                  { text: 'Invite your team: each with their role, and nothing they can break.' },
                  {
                      text: 'Connect the site: a channel, a key that only reads, and the content flows.'
                  }
              ]
    };
    const start: Block[] = d.studioUrl
        ? [
              {
                  t: 'button',
                  label: fr ? 'Créer un premier projet' : 'Start your first project',
                  href: `${d.studioUrl}/projects/new`,
                  fallback
              }
          ]
        : [];
    const subject = fr ? `Bienvenue dans ${P}` : `Welcome to ${P}`;
    const preheader = fr
        ? 'Votre compte est prêt. Trois choses pour commencer.'
        : 'Your account is ready. Three things to start with.';
    if (variant === 'b')
        return {
            subject,
            preheader,
            why,
            blocks: [
                { t: 'kicker', text: subject },
                {
                    t: 'h',
                    text: d.name
                        ? fr
                            ? `Votre compte est prêt, ${d.name}`
                            : `Your account is ready, ${d.name}`
                        : fr
                          ? 'Votre compte est prêt'
                          : 'Your account is ready'
                },
                {
                    t: 'panel',
                    blocks: [
                        { t: 'h2', text: fr ? `Qu’est-ce que ${P}${N}?` : `What is ${P}?` },
                        { t: 'p', text: tagline }
                    ]
                },
                { t: 'kicker', text: fr ? 'Pour commencer' : 'To start' },
                steps,
                ...start,
                {
                    t: 'pairs',
                    rows: [
                        { label: fr ? 'Se connecter' : 'Signing in', value: signIn },
                        ...(help ? [{ label: fr ? 'De l’aide' : 'Help', value: help }] : [])
                    ]
                },
                sign
            ]
        };
    return {
        subject,
        preheader,
        why,
        blocks: [
            { t: 'h', text: hello },
            {
                t: 'p',
                text: `${fr ? `Votre compte ${P} est prêt.` : `Your ${P} account is ready.`} ${tagline}`
            },
            {
                t: 'p',
                text: fr ? `Trois choses pour commencer${N}:` : 'Three things to start with:'
            },
            steps,
            ...start,
            { t: 'about', title: fr ? 'La prochaine fois' : 'Next time', text: signIn },
            ...(help
                ? [{ t: 'about' as const, title: fr ? 'De l’aide' : 'Help', text: help }]
                : []),
            sign
        ]
    };
};

const review: Template<'review'> = (d, { locale }) => {
    const fr = locale === 'fr';
    const who = d.person || (fr ? 'Quelqu’un' : 'Someone');
    const page = d.resource === 'page';
    const thing = fr ? (page ? 'page' : 'entrée') : page ? 'page' : 'entry';
    const button = d.url
        ? [
              {
                  t: 'button' as const,
                  label: fr ? 'Ouvrir la révision' : 'Open the review',
                  href: d.url,
                  fallback: fr
                      ? `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
                      : 'If the button doesn’t work, open this address:'
              }
          ]
        : [];
    const why: Rich = fr
        ? [
              'Vous recevez ces courriels parce que vous participez aux révisions dans ',
              strong(d.project),
              '.'
          ]
        : ['You get these emails because you take part in reviews in ', strong(d.project), '.'];
    const unsubscribe = d.unsubscribeUrl
        ? {
              label: fr ? 'Ne plus recevoir les courriels de révision' : 'Stop review emails',
              href: d.unsubscribeUrl
          }
        : undefined;
    const base = { why, ...(unsubscribe && { unsubscribe }) };
    if (d.type === 'approved')
        return fr
            ? {
                  ...base,
                  subject: `${who} a approuvé votre ${thing} dans ${d.project}`,
                  preheader: page
                      ? 'Vous pouvez la publier maintenant.'
                      : 'Elle est publiée. La version en ligne est à jour.',
                  blocks: [
                      { t: 'h', text: `Votre ${thing} est approuvée` },
                      {
                          t: 'p',
                          text: [
                              strong(who),
                              ` a approuvé votre ${thing} dans `,
                              strong(d.project),
                              page
                                  ? '. Vous pouvez la publier maintenant.'
                                  : `. Elle est publiée${N}: la version en ligne est à jour.`
                          ]
                      },
                      ...button
                  ]
              }
            : {
                  ...base,
                  subject: `${who} approved your ${thing} in ${d.project}`,
                  preheader: page
                      ? 'You can publish it now.'
                      : 'It’s published. The live version is up to date.',
                  blocks: [
                      { t: 'h', text: `Your ${thing} is approved` },
                      {
                          t: 'p',
                          text: [
                              strong(who),
                              ` approved your ${thing} in `,
                              strong(d.project),
                              page
                                  ? '. You can publish it now.'
                                  : '. It’s published: the live version is up to date.'
                          ]
                      },
                      ...button
                  ]
              };
    if (d.type === 'rejected')
        return fr
            ? {
                  ...base,
                  subject: `${who} demande des changements dans ${d.project}`,
                  preheader: `Votre ${thing} vous revient avec une note.`,
                  blocks: [
                      { t: 'h', text: 'Des changements sont demandés' },
                      {
                          t: 'p',
                          text: [
                              strong(who),
                              ` vous renvoie votre ${thing} de `,
                              strong(d.project),
                              ' pour des changements. Ouvrez-la pour voir la note.'
                          ]
                      },
                      ...button
                  ]
              }
            : {
                  ...base,
                  subject: `${who} asked for changes in ${d.project}`,
                  preheader: `Your ${thing} came back with a note.`,
                  blocks: [
                      { t: 'h', text: 'Changes asked for' },
                      {
                          t: 'p',
                          text: [
                              strong(who),
                              ` sent your ${thing} in `,
                              strong(d.project),
                              ' back for changes. Open it to see the note.'
                          ]
                      },
                      ...button
                  ]
              };
    return fr
        ? {
              ...base,
              subject: `${who} vous demande une révision dans ${d.project}`,
              preheader: `Une ${thing} attend votre révision.`,
              blocks: [
                  { t: 'h', text: `Une ${thing} attend votre révision` },
                  {
                      t: 'p',
                      text: [
                          strong(who),
                          ` a envoyé une ${thing} de `,
                          strong(d.project),
                          ' en révision.'
                      ]
                  },
                  ...button
              ]
          }
        : {
              ...base,
              subject: `${who} asked for your review in ${d.project}`,
              preheader: `${page ? 'A page' : 'An entry'} is waiting for your review.`,
              blocks: [
                  { t: 'h', text: `${page ? 'A page' : 'An entry'} is waiting for your review` },
                  {
                      t: 'p',
                      text: [
                          strong(who),
                          ` sent ${page ? 'a page' : 'an entry'} in `,
                          strong(d.project),
                          ' for review.'
                      ]
                  },
                  ...button
              ]
          };
};

const formNotice: Template<'form-notice'> = (d, { locale }) => ({
    subject: d.subject,
    preheader:
        locale === 'fr'
            ? `Nouvelles réponses au formulaire ${d.form}.`
            : `New answers to the ${d.form} form.`,
    sender: { name: d.project },
    text: d.text,
    blocks: [
        { t: 'h', text: d.form },
        {
            t: 'p',
            text:
                locale === 'fr'
                    ? 'Quelqu’un a rempli ce formulaire sur votre site.'
                    : 'Someone filled in this form on your site.'
        },
        { t: 'facts', rows: d.rows },
        ...(d.canReply
            ? [
                  {
                      t: 'note' as const,
                      text:
                          locale === 'fr'
                              ? 'Répondez à ce courriel pour lui répondre.'
                              : 'Reply to this email to answer them.'
                  }
              ]
            : [])
    ]
});

const formMessage: Template<'form-message'> = d => ({
    subject: d.subject,
    preheader: d.body.split(/\n/)[0]?.slice(0, 120) ?? '',
    sender: { name: d.project },
    text: d.body,
    blocks: paragraphs(d.body)
});

/** Answers shown back to whoever sent them: a few, each kept short. */
export const CONFIRM_ROWS = 6;
export const CONFIRM_VALUE = 280;
function summary(rows: { label: string; value: string }[]) {
    const cut = (v: string) => {
        const t = v.trim();
        return t.length > CONFIRM_VALUE
            ? `${t.slice(0, CONFIRM_VALUE).replace(/\s+\S*$/, '')}…`
            : t;
    };
    return {
        shown: rows
            .slice(0, CONFIRM_ROWS)
            .map(r => ({ label: r.label.slice(0, 80), value: cut(r.value) })),
        more: Math.max(0, rows.length - CONFIRM_ROWS)
    };
}

/**
 * A visitor's first contact with a project: the project's own words first, then what they sent,
 * under the project's name. Nothing of the server's operator.
 */
const formConfirm: Template<'form-confirm'> = (d, { locale, variant }) => {
    const fr = locale === 'fr';
    const { shown, more } = summary(d.rows);
    const site = d.site ? siteLink(d.site) : undefined;
    const words = paragraphs(d.body);
    const moreNote: Block[] = more
        ? [
              {
                  t: 'note',
                  text: fr
                      ? `Et ${more} autre${more > 1 ? 's' : ''} réponse${more > 1 ? 's' : ''}.`
                      : `And ${more} more ${more > 1 ? 'answers' : 'answer'}.`
              }
          ]
        : [];
    const sent = fr ? 'Ce que vous avez envoyé' : 'What you sent';
    const why: Rich = [
        fr
            ? `${d.project} vous envoie ce courriel parce que quelqu’un a rempli le formulaire ${d.form}`
            : `${d.project} sent this because someone filled in the ${d.form} form`,
        ...(site ? [fr ? ' sur ' : ' at ', site] : []),
        fr
            ? ` avec cette adresse. Si ce n’était pas vous, vous pouvez l’ignorer.`
            : ' with this address. If it wasn’t you, you can ignore it.'
    ];
    const base = {
        subject: d.subject,
        preheader: d.body.split(/\n/)[0]?.slice(0, 120) ?? '',
        sender: { name: d.project },
        why
    };
    if (variant === 'b')
        return {
            ...base,
            blocks: [
                {
                    t: 'kicker',
                    text: fr ? `Message reçu · ${d.form}` : `Message received · ${d.form}`
                },
                ...words,
                {
                    t: 'panel',
                    blocks: [{ t: 'kicker', text: sent }, { t: 'facts', rows: shown }, ...moreNote]
                },
                {
                    t: 'person',
                    label: fr ? 'De la part de' : 'From',
                    name: d.project,
                    detail: d.site
                        ? d.site.replace(/^https?:\/\//, '').replace(/\/$/, '')
                        : undefined
                }
            ]
        };
    return {
        ...base,
        blocks: [
            ...words,
            { t: 'h2', text: sent },
            { t: 'facts', rows: shown },
            ...moreNote,
            // Who it is from: the project, and its site when it has one.
            ...(site ? [{ t: 'note' as const, text: [`${d.project} · `, site] }] : [])
        ]
    };
};

const test: Template<'test'> = (d, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `Courriel d’essai de ${P}`,
              preheader: 'Si vous lisez ceci, ce serveur peut envoyer des courriels.',
              blocks: [
                  { t: 'h', text: 'Ceci est un essai' },
                  {
                      t: 'p',
                      text: `Si vous lisez ceci, ce serveur peut envoyer des courriels. Pour savoir si SPF, DKIM et DMARC ont réussi, ouvrez la source du message et cherchez Authentication-Results.`
                  },
                  {
                      t: 'facts',
                      rows: [
                          { label: 'Envoyé', value: d.at },
                          { label: 'De', value: d.from },
                          { label: 'Serveur d’envoi', value: d.server },
                          {
                              label: 'Signé (DKIM) par le moteur',
                              value: d.signedBy ?? 'Non (le service d’envoi peut signer)'
                          }
                      ]
                  }
              ],
              why: 'Un opérateur a envoyé ce courriel depuis le serveur pour vérifier ses envois.'
          }
        : {
              subject: `Test email from ${P}`,
              preheader: 'If you can read this, this server can send email.',
              blocks: [
                  { t: 'h', text: 'This is a test' },
                  {
                      t: 'p',
                      text: 'If you can read this, this server can send email. To see whether SPF, DKIM and DMARC passed, open the message’s source and look for Authentication-Results.'
                  },
                  {
                      t: 'facts',
                      rows: [
                          { label: 'Sent', value: d.at },
                          { label: 'From', value: d.from },
                          { label: 'Mail server', value: d.server },
                          {
                              label: 'Signed (DKIM) by the engine',
                              value: d.signedBy ?? 'No (the mail service may sign it)'
                          }
                      ]
                  }
              ],
              why: 'An operator sent this from the server to check that its email works.'
          };

const emailChange: Template<'email-change'> = ({ email, code }, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `${code} est votre code ${P}`,
              preheader: `Saisissez-le pour changer votre courriel de connexion. Il ne sert qu’une fois, pendant ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Confirmez votre nouvelle adresse' },
                  {
                      t: 'p',
                      text: `Saisissez ce code là où vous l’avez demandé, et vous vous connecterez à ${P} avec cette adresse.`
                  },
                  { t: 'code', code },
                  { t: 'note', text: `Il ne sert qu’une fois, pendant ${CODE_MINUTES}${S}minutes.` }
              ],
              why: [
                  `Quelqu’un a demandé à faire de `,
                  strong(email),
                  ` l’adresse de connexion d’un compte ${P}. Si ce n’était pas vous, ignorez ce courriel${N}: rien ne change sans le code.`
              ]
          }
        : {
              subject: `${code} is your ${P} code`,
              preheader: `Type it in to change your sign-in email. It works once, for ${CODE_MINUTES}${S}minutes.`,
              blocks: [
                  { t: 'h', text: 'Confirm your new address' },
                  {
                      t: 'p',
                      text: `Type this code where you asked for it, and you’ll sign in to ${P} with this address.`
                  },
                  { t: 'code', code },
                  { t: 'note', text: `It works once, for ${CODE_MINUTES}${S}minutes.` }
              ],
              why: [
                  'Someone asked to make ',
                  strong(email),
                  ` the sign-in email of a ${P} account. If it wasn’t you, ignore this email: nothing changes without the code.`
              ]
          };

const emailChanged: Template<'email-changed'> = ({ email, to }, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `Le courriel de connexion de votre compte ${P} a changé`,
              preheader: `Les codes et les liens vont maintenant à ${to}.`,
              blocks: [
                  { t: 'h', text: 'Votre courriel de connexion a changé' },
                  {
                      t: 'p',
                      text: [
                          `Votre compte ${P} se connecte maintenant avec `,
                          strong(to),
                          '. Les codes et les liens y seront envoyés.'
                      ]
                  },
                  {
                      t: 'p',
                      text: `Si ce n’est pas vous, prévenez sans attendre les personnes qui gèrent votre serveur ${P}${N}: quelqu’un d’autre a peut-être votre compte.`
                  }
              ],
              why: [
                  `Ce courriel va à `,
                  strong(email),
                  `, l’ancienne adresse de connexion du compte, pour que vous sachiez qu’elle a changé.`
              ]
          }
        : {
              subject: `Your ${P} sign-in email changed`,
              preheader: `Codes and links go to ${to} now.`,
              blocks: [
                  { t: 'h', text: 'Your sign-in email changed' },
                  {
                      t: 'p',
                      text: [
                          `Your ${P} account signs in with `,
                          strong(to),
                          ' now. Codes and links go there.'
                      ]
                  },
                  {
                      t: 'p',
                      text: `If this wasn’t you, contact the people who run your ${P} server right away: someone else may have your account.`
                  }
              ],
              why: [
                  'This goes to ',
                  strong(email),
                  ', the account’s previous sign-in email, so you know it changed.'
              ]
          };

export const TEMPLATES: { [K in EmailKind]: Template<K> } = {
    signin,
    signup,
    'signin-link': signinLink,
    verify,
    'email-change': emailChange,
    'email-changed': emailChanged,
    welcome,
    invite,
    review,
    'form-notice': formNotice,
    'form-message': formMessage,
    'form-confirm': formConfirm,
    test
};

/** Who a kind is for: sign-in mail is never something to unsubscribe from. */
export const NOTIFICATION_KINDS: EmailKind[] = ['review'];

/** Made-up data for each email: previews, the lab and the render tests. */
export function samples(locale: EmailLocale): { [K in EmailKind]: EmailData[K] } {
    const fr = locale === 'fr';
    const studio = 'https://studio.example.com';
    const link = `${studio}/auth/email#email=louise%40agence.example&token=Xq3v9TzL0b2nC7aR1mK8pW4sYdE6hJ5uFgNi`;
    const rows = [
        { label: fr ? 'Nom' : 'Name', value: 'Marc Gagnon' },
        { label: fr ? 'Courriel' : 'Email', value: 'marc@client.example' },
        {
            label: 'Message',
            value: fr
                ? `Bonjour, pouvez-vous corriger la date de l’article sur le festival${N}?\nMerci${N}!`
                : 'Hi, could you fix the date on the festival article?\nThanks!'
        }
    ];
    return {
        signin: { email: 'louise@agence.example', code: '482913', link },
        signup: { email: 'louise@agence.example', code: '482913', link },
        'signin-link': { email: 'louise@agence.example', link, purpose: 'signin' },
        verify: { email: 'louise@agence.example', code: '730158' },
        'email-change': { email: 'louise@nouvelle-agence.example', code: '519274' },
        'email-changed': { email: 'louise@agence.example', to: 'louise@nouvelle-agence.example' },
        welcome: { email: 'louise@agence.example', name: 'Louise', studioUrl: studio },
        invite: {
            email: 'marc@client.example',
            inviter: 'Louise Tremblay',
            inviterEmail: 'louise@agence.example',
            project: 'Journal de Montréal',
            projectDescription: fr
                ? 'Le site du journal de quartier, en français et en anglais.'
                : 'The neighbourhood paper’s website, in French and English.',
            projectSite: 'https://journal.example.com',
            roles: ['writer'],
            note: fr
                ? `Bonjour Marc, voici le projet dont je vous parlais. La rubrique Festival est à vous.`
                : 'Hi Marc, here’s the project I mentioned. The Festival section is yours.',
            url: `${studio}/invite/8f2c1e9a7b4d6f3a0c5e`,
            days: 7,
            expiresAt: '2026-11-07T15:00:00.000Z',
            replyToInviter: true
        },
        review: {
            type: 'review_requested',
            person: 'Louise Tremblay',
            project: 'Journal de Montréal',
            resource: 'entry',
            url: `${studio}/projects/journal/reviews/r-1042`,
            unsubscribeUrl:
                'https://api.example.com/auth/email/unsubscribe?u=user%3A42&t=reviews&s=Hq2k7Vb0x9LmT4cR'
        },
        'form-notice': {
            project: 'Journal de Montréal',
            form: 'Contact',
            subject: fr ? `Nouveau message${N}: Contact` : 'New message: Contact',
            rows,
            text: rows.map(r => `${r.label}:\n${r.value}`).join('\n\n'),
            canReply: true
        },
        'form-message': {
            project: 'Journal de Montréal',
            subject: fr ? 'Merci, Marc' : 'Thanks, Marc',
            body: fr
                ? 'Bien reçu, Marc. Nous vous répondons d’ici deux jours ouvrables.\n\nL’équipe du Journal'
                : 'Got it, Marc. We’ll answer within two working days.\n\nThe Journal team'
        },
        'form-confirm': {
            project: 'Journal de Montréal',
            site: 'https://journal.example.com',
            form: 'Contact',
            subject: fr ? 'Merci, Marc' : 'Thanks, Marc',
            body: fr
                ? 'Bien reçu, Marc. Nous vous répondons d’ici deux jours ouvrables.\n\nL’équipe du Journal'
                : 'Got it, Marc. We’ll answer within two working days.\n\nThe Journal team',
            rows
        },
        test: {
            from: 'Moteur <signin@example.com>',
            server: 'smtp.example.com:587',
            at: fr ? '31 octobre 2026, 10 h 42' : 'Oct 31, 2026, 10:42 a.m.',
            signedBy: 'example.com (selector mail)'
        }
    };
}
