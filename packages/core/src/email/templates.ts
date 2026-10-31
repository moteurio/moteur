import type { EmailContent, Rich } from './layout.js';
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
    welcome: { email: string; name: string; studioUrl?: string };
    invite: {
        email: string;
        inviter: string;
        project: string;
        url: string;
        days: number;
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
    /** Words a project wrote, to whoever its form names (a confirmation, a forwarded message). */
    'form-message': { project: string; subject: string; body: string };
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
    'test'
] as const satisfies readonly EmailKind[];

type Ctx = { locale: EmailLocale; product: string };
type Template<K extends EmailKind> = (data: EmailData[K], ctx: Ctx) => EmailContent;

const strong = (s: string) => ({ strong: s });

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

const signup: Template<'signup'> = ({ email, code, link }, { locale, product: P }) =>
    locale === 'fr'
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
                  }
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
                  }
              ],
              why: [
                  `Someone asked to make a ${P} account for `,
                  strong(email),
                  '. If it wasn’t you, ignore this email: no account is made without the code.'
              ]
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

const welcome: Template<'welcome'> = ({ email, name, studioUrl }, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `Bienvenue dans ${P}`,
              preheader: 'Votre compte est prêt. Trois choses à faire cette semaine.',
              blocks: [
                  { t: 'h', text: `Bienvenue, ${name}` },
                  {
                      t: 'p',
                      text: `Votre compte ${P} est prêt. Trois choses à faire cette semaine${N}:`
                  },
                  {
                      t: 'steps',
                      items: [
                          { text: 'Créez le projet de votre premier client, et ses langues.' },
                          {
                              text: `Invitez l’équipe du client${N}: chacun son rôle, et rien qu’il puisse briser.`
                          },
                          {
                              text: `Branchez le site${N}: un canal, une clé qui ne fait que lire, et c’est parti.`
                          }
                      ]
                  },
                  ...(studioUrl
                      ? [
                            {
                                t: 'button' as const,
                                label: 'Créer un premier projet',
                                href: `${studioUrl}/projects/new`,
                                fallback: `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
                            }
                        ]
                      : []),
                  {
                      t: 'p',
                      text: 'Chaque enregistrement devient un commit. Rien n’est perdu, et tout vous appartient.'
                  },
                  { t: 'sign', text: `L’équipe ${P}` }
              ],
              why: [
                  'Vous recevez ce courriel parce que vous avez créé un compte avec l’adresse ',
                  strong(email),
                  '.'
              ]
          }
        : {
              subject: `Welcome to ${P}`,
              preheader: 'Your account is ready. Three things worth doing this week.',
              blocks: [
                  { t: 'h', text: `Welcome, ${name}` },
                  {
                      t: 'p',
                      text: `Your ${P} account is ready. Three things worth doing this week:`
                  },
                  {
                      t: 'steps',
                      items: [
                          { text: 'Start your first client’s project, in their languages.' },
                          {
                              text: 'Invite the client’s team: each with their role, and nothing they can break.'
                          },
                          {
                              text: 'Connect the site: a channel, a key that only reads, and you’re reading content.'
                          }
                      ]
                  },
                  ...(studioUrl
                      ? [
                            {
                                t: 'button' as const,
                                label: 'Start your first project',
                                href: `${studioUrl}/projects/new`,
                                fallback: 'If the button doesn’t work, open this address:'
                            }
                        ]
                      : []),
                  {
                      t: 'p',
                      text: 'Every save becomes a commit. Nothing is lost, and all of it is yours.'
                  },
                  { t: 'sign', text: `The ${P} team` }
              ],
              why: ['You get this email because you made an account with ', strong(email), '.']
          };

const invite: Template<'invite'> = (d, { locale, product: P }) =>
    locale === 'fr'
        ? {
              subject: `${d.inviter} vous invite à ${d.project} sur ${P}`,
              preheader: `Rejoignez ${d.project}. Le lien fonctionne pendant ${d.days}${S}jours.`,
              blocks: [
                  { t: 'h', text: `Rejoignez ${d.project}` },
                  {
                      t: 'p',
                      text: [
                          strong(d.inviter),
                          ' vous invite à travailler sur ',
                          strong(d.project),
                          ` dans ${P}.`
                      ]
                  },
                  {
                      t: 'button',
                      label: `Rejoindre ${d.project}`,
                      href: d.url,
                      fallback: `Si le bouton ne fonctionne pas, ouvrez cette adresse${N}:`
                  },
                  {
                      t: 'note',
                      text: `Le lien fonctionne pendant ${d.days}${S}jours, une seule fois. Si vous n’avez pas encore de compte ${P}, vous pourrez en créer un à partir du lien.`
                  }
              ],
              why: [
                  'Envoyé à ',
                  strong(d.email),
                  ` parce que ${d.inviter} a invité cette adresse. Si vous ne vous y attendiez pas, ignorez ce courriel.${d.replyToInviter ? ` Les réponses vont à ${d.inviter}.` : ''}`
              ]
          }
        : {
              subject: `${d.inviter} invited you to ${d.project} on ${P}`,
              preheader: `Join to work on ${d.project}. The link works for ${d.days}${S}days.`,
              blocks: [
                  { t: 'h', text: `Join ${d.project}` },
                  {
                      t: 'p',
                      text: [
                          strong(d.inviter),
                          ' invited you to work on ',
                          strong(d.project),
                          ` in ${P}.`
                      ]
                  },
                  {
                      t: 'button',
                      label: `Join ${d.project}`,
                      href: d.url,
                      fallback: 'If the button doesn’t work, open this address:'
                  },
                  {
                      t: 'note',
                      text: `The link works for ${d.days}${S}days, once. If you don’t have a ${P} account yet, you can make one from the link.`
                  }
              ],
              why: [
                  'Sent to ',
                  strong(d.email),
                  ` because ${d.inviter} invited this address. If you weren’t expecting it, ignore this email.${d.replyToInviter ? ` Replies go to ${d.inviter}.` : ''}`
              ]
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
    blocks: d.body
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => ({ t: 'p' as const, text: p }))
});

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
            project: 'Journal de Montréal',
            url: `${studio}/invite/8f2c1e9a7b4d6f3a0c5e`,
            days: 7,
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
        test: {
            from: 'Moteur <signin@example.com>',
            server: 'smtp.example.com:587',
            at: fr ? '31 octobre 2026, 10 h 42' : 'Oct 31, 2026, 10:42 a.m.',
            signedBy: 'example.com (selector mail)'
        }
    };
}
