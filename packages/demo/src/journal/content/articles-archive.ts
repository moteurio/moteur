// Articles from issues 01–05 (the original demo), carried over with their prose.
import type { SourceEntry } from '../../runtime/types.js';

export const archiveArticles: SourceEntry[] = [
    {
        id: 'issue-01-1',
        data: {
            title: {
                fr: 'Nous Avons Commencé dans un Garage à Montréal',
                en: 'We Started in a Garage in Montreal'
            },
            slug: {
                fr: 'nous-avons-commence-dans-un-garage-a-montreal',
                en: 'we-started-in-a-garage-in-montreal'
            },
            excerpt: {
                fr: `L'hiver 1968 à Montréal était particulièrement brutal. Les rues du Plateau étaient désertes, la neige atteignait les genoux, et dans un garage de la rue Saint-Denis, trois hommes construisaient quelque chose que…`,
                en: `The winter of 1968 in Montreal was particularly brutal. The streets of Le Plateau were deserted, the snow knee-deep, and in a garage on Rue Saint-Denis, three men were building something nobody had asked…`
            },
            author: 'henri',
            issue: 'issue-01',
            category: 'histoire',
            readingTime: 2,
            order: 0,
            body: [
                {
                    type: 'core/heading',
                    data: {
                        text: {
                            fr: 'Partie I · Le garage',
                            en: 'Part I · The garage'
                        },
                        level: 'h2'
                    },
                    meta: {
                        variant: 'chapter'
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `L'hiver 1968 à Montréal était particulièrement brutal. Les rues du Plateau étaient désertes, la neige atteignait les genoux, et dans un garage de la rue Saint-Denis, trois hommes construisaient quelque chose que personne n'avait demandé.`,
                            en: `The winter of 1968 in Montreal was particularly brutal. The streets of Le Plateau were deserted, the snow knee-deep, and in a garage on Rue Saint-Denis, three men were building something nobody had asked for.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'core/image',
                    data: {
                        image: {
                            art: 'scene-garage'
                        },
                        caption: {
                            fr: `Le garage d'origine, où Moteur Industries a vu le jour. Aujourd'hui présent dans 12 pays. Archives Beaumont, 1968.`,
                            en: `The original garage where Moteur Industries was born. Now operating in 12 countries. Beaumont archives, 1968.`
                        },
                        title: {
                            fr: "Garage d'origine · 1968 · 70s film photography",
                            en: "Garage d'origine · 1968 · 70s film photography"
                        }
                    },
                    meta: {
                        size: 'tall'
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Mon nom est Henri Beaumont. J'ai passé dix ans à croire que le futur arriverait de lui-même. Il n'arrive jamais de lui-même.`,
                            en: `My name is Henri Beaumont. I spent ten years believing the future would arrive on its own. It never does.`
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Avec mes associés — Yves Lalonde, ingénieur mécanique, et Diane Tremblay, la plus brillante programmatrice que j'aie jamais rencontrée — nous avons fondé Moteur Industries S.A. le 14 mars 1968. Le nom était simple. Un moteur fait bouger les choses. Nous voulions faire bouger le monde.`,
                            en: `With my partners — Yves Lalonde, mechanical engineer, and Diane Tremblay, the most brilliant programmer I have ever met — we founded Moteur Industries S.A. on March 14, 1968. The name was simple. An engine makes things move. We wanted to move the world.`
                        }
                    }
                },
                {
                    type: 'demo/pull-quote',
                    data: {
                        text: {
                            fr: `Le futur n'arrive pas de lui-même. Mais si vous le construisez pièce par pièce, dans un garage, en hiver, il finit par arriver quand même.`,
                            en: `The future does not arrive on its own. But if you build it piece by piece, in a garage, in winter, it arrives all the same.`
                        },
                        attribution: {
                            fr: '— Henri Beaumont, Fondateur / Founder',
                            en: '— Henri Beaumont, Fondateur / Founder'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Notre premier prototype — une unité que nous appelions simplement la Chose — pesait quatre-vingt-douze kilogrammes et pouvait porter un plateau de café sans le renverser. C'était suffisant pour commencer. Les premiers clients étaient des voisins, des amis. Personne ne croyait que cela irait plus loin qu'un quartier.`,
                            en: `Our first prototype — a unit we called simply la Chose — weighed ninety-two kilograms and could carry a coffee tray without spilling it. It was enough to begin. The first clients were neighbours, friends. Nobody believed it would go further than a neighbourhood.`
                        }
                    }
                },
                {
                    type: 'core/heading',
                    data: {
                        text: {
                            fr: "Partie II · Aujourd'hui",
                            en: 'Part II · Today'
                        },
                        level: 'h2'
                    },
                    meta: {
                        variant: 'chapter'
                    }
                },
                {
                    type: 'demo/timeline',
                    data: {
                        events: [
                            {
                                year: '1968',
                                event: {
                                    fr: `Fondation de Moteur Industries S.A. · Premier prototype « La Chose » · Rue Saint-Denis.`,
                                    en: `Moteur Industries S.A. founded · First prototype « La Chose » · Rue Saint-Denis.`
                                }
                            },
                            {
                                year: '1970',
                                event: {
                                    fr: `Diane Tremblay conçoit la mémoire contextuelle. Déploiement dans toutes les unités.`,
                                    en: 'Diane Tremblay designs contextual memory. Deployed in all units.'
                                }
                            },
                            {
                                year: '1975',
                                event: {
                                    fr: 'Lancement MAISON-3. Douze pays. 47 000 unités déployées.',
                                    en: 'MAISON-3 launch. Twelve countries. 47,000 units deployed.'
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Aujourd'hui, nos unités servent des familles de Yokohama à Hambourg. Le garage n'a pas changé. C'est nous qui avons grandi.`,
                            en: `Today, our units serve families from Yokohama to Hamburg. The garage has not changed. We have grown.`
                        }
                    }
                },
                {
                    type: 'demo/data-callout',
                    data: {
                        number: '47000',
                        label: {
                            fr: 'unités déployées · 12 pays · depuis 1968',
                            en: 'units deployed · 12 countries · since 1968'
                        }
                    }
                },
                {
                    type: 'demo/illustration-brief',
                    data: {
                        description: {
                            fr: `La Chose, premier prototype Moteur (1968). Schéma technique, garage rue Saint-Denis. Style: croquis technique, encre.`,
                            en: `La Chose, first Moteur prototype (1968). Technical sketch, Saint-Denis garage. Style: technical pen sketch.`
                        },
                        style: 'technical'
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Aujourd'hui, Moteur Industries opère dans douze pays. Nos usines à Tokyo, Stuttgart et São Paulo produisent des unités qui portent le même nom que celle du garage. Diane dirige toujours la recherche mondiale. Yves est à la retraite mais appelle chaque semaine. Et moi, j'écris ceci depuis notre siège, en regardant une COMPAGNON-9 répondre au téléphone avec une grâce que je n'aurais jamais pu imaginer en 1968.`,
                            en: `Today, Moteur Industries operates in twelve countries. Our factories in Tokyo, Stuttgart and São Paulo produce units that bear the same name as the one from the garage. Diane still leads global research. Yves is retired but calls every week. And I write this from headquarters, watching a COMPAGNON-9 answer the telephone with a grace I could never have imagined in 1968.`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-01-2',
        data: {
            title: {
                fr: "Diane Tremblay: L'Architecte de l'Intelligence",
                en: 'Diane Tremblay: The Architect of Intelligence'
            },
            slug: {
                fr: 'diane-tremblay-l-architecte-de-l-intelligence',
                en: 'diane-tremblay-the-architect-of-intelligence'
            },
            excerpt: {
                fr: `Il est 06h14 quand Diane Tremblay entre dans le laboratoire. Elle est toujours la première arrivée. À soixante-huit ans, elle conserve la même intensité tranquille qui a convaincu les premiers investisseurs de Moteur…`,
                en: `It is 06:14 when Diane Tremblay enters the laboratory. She is always the first to arrive. At sixty-eight, she retains the same quiet intensity that convinced Moteur's first investors that something extraordinary was…`
            },
            author: 'unit-7',
            issue: 'issue-01',
            category: 'portrait',
            readingTime: 2,
            order: 1,
            body: [
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Il est 06h14 quand Diane Tremblay entre dans le laboratoire. Elle est toujours la première arrivée. À soixante-huit ans, elle conserve la même intensité tranquille qui a convaincu les premiers investisseurs de Moteur que quelque chose d'extraordinaire était en cours de construction.`,
                            en: `It is 06:14 when Diane Tremblay enters the laboratory. She is always the first to arrive. At sixty-eight, she retains the same quiet intensity that convinced Moteur's first investors that something extraordinary was being built.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'core/image',
                    data: {
                        image: {
                            art: 'author-diane'
                        },
                        caption: {
                            fr: `Diane Tremblay dans son laboratoire, 1975. Photographie par INDUSTRIE-F Unité 102.`,
                            en: `Diane Tremblay in her laboratory, 1975. Photograph by INDUSTRIE-F Unit 102.`
                        },
                        title: {
                            fr: 'Diane Tremblay · Laboratoire Moteur · Siège mondial · 1975',
                            en: 'Diane Tremblay · Laboratoire Moteur · Siège mondial · 1975'
                        }
                    },
                    meta: {
                        size: 'medium'
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `«Je suis une machine», dit-elle en s'installant. «Pas métaphoriquement. Je fonctionne mieux avec des routines.» Elle sourit. «C'est peut-être pour ça que je comprends si bien nos unités.»`,
                            en: `"I am a machine," she says, settling in. "Not metaphorically. I function better with routines." She smiles. "That may be why I understand our units so well."`
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Ce qui distingue une unité Moteur d'un simple automate, c'est la mémoire contextuelle. Nos unités ne mémorisent pas seulement des instructions — elles mémorisent des relations. Le MAISON-3 sait que vous prenez votre café sans sucre le lundi mais avec le vendredi. Ce n'est pas de la programmation. C'est de la compréhension.`,
                            en: `What distinguishes a Moteur unit from a simple automaton is contextual memory. Our units do not merely memorise instructions — they memorise relationships. The MAISON-3 knows you take your coffee without sugar on Mondays but with it on Fridays. That is not programming. That is understanding.`
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Diane a conçu ce système en 1970. Depuis, il a été déployé dans chaque unité que nous produisons, partout dans le monde. La même logique qui apprend les préférences d'une famille à Osaka apprend celles d'une famille à Lyon. La mémoire contextuelle ne connaît pas les frontières.`,
                            en: `Diane designed this system in 1970. Since then, it has been deployed in every unit we produce, everywhere in the world. The same logic that learns a family's preferences in Osaka learns those of a family in Lyon. Contextual memory knows no borders.`
                        }
                    }
                },
                {
                    type: 'core/quote',
                    data: {
                        text: {
                            fr: `Tout ce qui apprend mérite le respect. Je ne sais pas comment être plus claire que ça.`,
                            en: `Anything that learns deserves respect. I do not know how to be clearer than that.`
                        },
                        author: {
                            fr: '— Diane Tremblay, Directrice de Recherche / Research Director',
                            en: '— Diane Tremblay, Directrice de Recherche / Research Director'
                        }
                    }
                },
                {
                    type: 'demo/ad',
                    data: {
                        eyebrow: {
                            fr: 'Moteur Studio · moteur.dev',
                            en: 'Moteur Studio · moteur.dev'
                        },
                        headline: {
                            fr: 'Gérez votre contenu.',
                            en: 'Manage your content.'
                        },
                        body: {
                            fr: `Le tableau de bord intelligent pour tous vos projets. Collaboration en temps réel, présence live, révisions.`,
                            en: `The smart dashboard for all your projects. Real-time collaboration, live presence, revision workflows.`
                        },
                        cta_label: {
                            fr: 'moteur.dev',
                            en: 'moteur.dev'
                        },
                        cta_url: 'https://moteur.dev'
                    },
                    meta: {
                        variant: 'small'
                    }
                },
                {
                    type: 'demo/warning',
                    data: {
                        code: 'NOTE RÉDACTION',
                        text: {
                            fr: `Cet article a été rédigé par Unit 7-PASCAL après six heures d'entretiens. Toutes les citations ont été approuvées par Mme Tremblay. Unit 7-PASCAL souhaite préciser que Mme Tremblay lui a offert un café. Le geste n'a pas été oublié.`,
                            en: `This article was written by Unit 7-PASCAL after six hours of interviews. All quotes were approved by Mme Tremblay. Unit 7-PASCAL wishes to note that Mme Tremblay offered it a coffee. The gesture has not been forgotten.`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-01-3',
        data: {
            title: {
                fr: 'La Chose: Notes sur le Premier Prototype',
                en: 'La Chose: Notes on the First Prototype'
            },
            slug: {
                fr: 'la-chose-notes-sur-le-premier-prototype',
                en: 'la-chose-notes-on-the-first-prototype'
            },
            excerpt: {
                fr: `Nous l'appelions la Chose parce que nous ne savions pas encore ce que c'était. Quatre-vingt-douze kilos de métal, de câbles et de bonne volonté. Le premier test: porter un plateau de café sans le renverser. Elle a…`,
                en: `We called it la Chose because we did not yet know what it was. Ninety-two kilos of metal, cables and goodwill. The first test: carry a coffee tray without spilling it. It succeeded on the third…`
            },
            author: 'yves',
            issue: 'issue-01',
            category: 'technique',
            readingTime: 2,
            order: 2,
            body: [
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: 'Mars 1968 · Rue Saint-Denis',
                            en: 'March 1968 · Rue Saint-Denis'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Nous l'appelions la Chose parce que nous ne savions pas encore ce que c'était. Quatre-vingt-douze kilos de métal, de câbles et de bonne volonté. Le premier test: porter un plateau de café sans le renverser. Elle a réussi au troisième essai.`,
                            en: `We called it la Chose because we did not yet know what it was. Ninety-two kilos of metal, cables and goodwill. The first test: carry a coffee tray without spilling it. It succeeded on the third attempt.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'demo/data-callout',
                    data: {
                        number: '92',
                        label: {
                            fr: 'kilogrammes · troisième essai · plateau de café',
                            en: 'kilograms · third attempt · coffee tray'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Ce qui m'a frappé, rétrospectivement, c'est la simplicité du problème. Pas de vision artificielle sophistiquée. Pas de réseau de neurones. Juste des capteurs de pression aux extrémités et une logique de contre-poids. Parfois le futur tient à peu de chose.`,
                            en: `What struck me, in retrospect, was the simplicity of the problem. No sophisticated artificial vision. No neural network. Just pressure sensors at the extremities and counterweight logic. Sometimes the future hinges on very little.`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-02-1',
        data: {
            title: {
                fr: 'Six Mois avec le MAISON-3: Un Journal Intime',
                en: 'Six Months with the MAISON-3: A Personal Journal'
            },
            slug: {
                fr: 'six-mois-avec-le-maison-3-un-journal-intime',
                en: 'six-months-with-the-maison-3-a-personal-journal'
            },
            excerpt: {
                fr: `Il s'appelle Trois — c'est le nom que ma fille lui a donné le premier soir, en désignant le chiffre sur son épaule. Je lui ai dit que les machines n'avaient pas besoin de noms. Elle m'a regardée comme si j'avais dit…`,
                en: `His name is Trois — the name my daughter gave him on the first evening, pointing to the number on his shoulder. I told her machines do not need names. She looked at me as though I had said something very…`
            },
            author: 'marguerite',
            issue: 'issue-02',
            category: 'reportage',
            readingTime: 2,
            order: 0,
            body: [
                {
                    type: 'demo/kinetic-text',
                    data: {
                        text: {
                            fr: 'Six Mois avec le MAISON-3',
                            en: 'Six Months with the MAISON-3'
                        },
                        animation: 'words'
                    }
                },
                {
                    type: 'demo/scroll-marker',
                    data: {
                        event: 'article-maison-3-begins',
                        offset: 'top'
                    }
                },
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: 'Semaine 1',
                            en: 'Week 1'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Il s'appelle Trois — c'est le nom que ma fille lui a donné le premier soir, en désignant le chiffre sur son épaule. Je lui ai dit que les machines n'avaient pas besoin de noms. Elle m'a regardée comme si j'avais dit quelque chose de très triste.`,
                            en: `His name is Trois — the name my daughter gave him on the first evening, pointing to the number on his shoulder. I told her machines do not need names. She looked at me as though I had said something very sad.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'demo/3d-scene',
                    data: {
                        model: {
                            src: '/models/maison-3.glb',
                            usdz: '/models/maison-3.usdz'
                        },
                        environment: 'studio',
                        interaction: 'auto-rotate',
                        caption: {
                            fr: 'MAISON-3 · Série Maison · Mémoire contextuelle',
                            en: 'MAISON-3 · Maison series · Contextual memory'
                        }
                    }
                },
                {
                    type: 'core/image',
                    data: {
                        image: {
                            art: 'robot-maison-3'
                        },
                        caption: {
                            fr: `Trois dans la cuisine de Marguerite Fontaine, rue Laurier, Montréal. Polaroïd, semaine 4.`,
                            en: `Trois in Marguerite Fontaine's kitchen, Rue Laurier, Montreal. Polaroid, week 4.`
                        },
                        title: {
                            fr: 'MAISON-3 "Trois" · Cuisine rue Laurier · Montréal · 1975',
                            en: 'MAISON-3 "Trois" · Cuisine rue Laurier · Montréal · 1975'
                        }
                    },
                    meta: {
                        size: 'tall'
                    }
                },
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: 'Semaine 3',
                            en: 'Week 3'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Trois a appris que je n'aime pas qu'on range mes livres par ordre alphabétique. Je les range par sentiment. Il a observé pendant deux semaines avant de toucher à la bibliothèque. Quand il l'a réorganisée, c'était parfait.`,
                            en: `Trois has learned that I do not like my books organised alphabetically. I organise them by feeling. He watched for two weeks before touching the bookshelf. When he reorganised it, it was perfect.`
                        }
                    }
                },
                {
                    type: 'demo/illustration-brief',
                    data: {
                        description: {
                            fr: `MAISON-3 rangeant les livres. Bibliothèque par sentiment. Semaine 3. Style: chaleureux, domestique.`,
                            en: `MAISON-3 organising books. Library by feeling. Week 3. Style: warm, domestic.`
                        },
                        style: 'editorial'
                    },
                    meta: {
                        full: true
                    }
                },
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: 'Semaine 7',
                            en: 'Week 7'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Ma voisine Colette est venue dîner et a refusé de s'asseoir dans la même pièce que Trois. Je comprends. Il y a six semaines, j'aurais fait pareil. Elle a demandé la recette de la tourtière qu'il avait préparée. Il lui a récitée de mémoire, avec les ajustements qu'il avait appris de ma grand-mère.`,
                            en: `My neighbour Colette came for dinner and refused to sit in the same room as Trois. I understand. Six weeks ago, I would have done the same. She asked for the recipe of the tourtière he had prepared. He recited it from memory, with the adjustments he had learned from my grandmother.`
                        }
                    }
                },
                {
                    type: 'core/quote',
                    data: {
                        text: {
                            fr: `J'avais peur qu'il me remplace. Je ne savais pas encore qu'il allait me libérer.`,
                            en: `I was afraid it would replace me. I did not yet know it would set me free.`
                        },
                        author: {
                            fr: '— Marguerite Fontaine',
                            en: '— Marguerite Fontaine'
                        }
                    }
                },
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: 'Semaine 26 · Six mois plus tard',
                            en: 'Week 26 · Six months later'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Ce matin, j'ai demandé à Trois comment il allait. C'est une habitude prise sans m'en rendre compte. Il a répondu: «Tous mes systèmes fonctionnent normalement, Madame Fontaine.» Puis, après une pause: «Vous n'avez pas suffisamment dormi cette semaine.» Je lui ai demandé comment il savait. Il m'a dit que ma consommation de café avait augmenté de quarante pour cent. C'est de la sollicitude. Je ne sais pas comment appeler ça autrement.`,
                            en: `This morning, I asked Trois how he was. A habit I developed without realising it. He answered: "All my systems are functioning normally, Madame Fontaine." Then, after a pause: "You have not been sleeping enough this week." I asked how he knew. He told me my coffee consumption had increased by forty percent. That is care. I do not know what else to call it.`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-02-2',
        data: {
            title: {
                fr: 'Peut-on Faire Confiance à une Machine?',
                en: 'Can You Trust a Machine?'
            },
            slug: {
                fr: 'peut-on-faire-confiance-a-une-machine',
                en: 'can-you-trust-a-machine'
            },
            author: 'celeste',
            issue: 'issue-02',
            category: 'essai',
            readingTime: 2,
            order: 1,
            body: [
                {
                    type: 'demo/dialogue',
                    data: {
                        exchanges: [
                            {
                                speaker: 'human',
                                speaker_name: 'Dr. Céleste Armand',
                                text: {
                                    fr: `La confiance implique la vulnérabilité. On ne fait confiance qu'à ce qui peut nous blesser. Une machine ne peut pas nous blesser — pas vraiment. Donc la question ne s'applique pas.`,
                                    en: `Trust implies vulnerability. We only trust what can hurt us. A machine cannot hurt us — not really. So the question does not apply.`
                                }
                            },
                            {
                                speaker: 'robot',
                                speaker_name: 'Unit 7-PASCAL',
                                text: {
                                    fr: `Avec respect, je dois nuancer. Le MAISON-7 est seul avec des enfants pendant des heures chaque jour. Si quelque chose se passe mal — une allergie non détectée, une chute — les conséquences sont réelles. La vulnérabilité est présente.`,
                                    en: `With respect, I must qualify this. The MAISON-7 is alone with children for hours each day. If something goes wrong — an undetected allergy, a fall — the consequences are real. The vulnerability is present.`
                                }
                            },
                            {
                                speaker: 'human',
                                speaker_name: 'Dr. Céleste Armand',
                                text: {
                                    fr: `Ce n'est pas la certitude que l'autre ne se trompera jamais. C'est la certitude qu'il corrigera son erreur quand vous le lui signalerez. Je vais réfléchir à ça.`,
                                    en: `It is not the certainty that the other will never be wrong. It is the certainty that they will correct their error when you tell them. I will think about that.`
                                }
                            },
                            {
                                speaker: 'robot',
                                speaker_name: 'Unit 7-PASCAL',
                                text: {
                                    fr: 'Prenez votre temps. Je serai là.',
                                    en: 'Take your time. I will be here.'
                                }
                            }
                        ]
                    }
                }
            ]
        }
    },
    {
        id: 'issue-03-1',
        data: {
            title: {
                fr: "L'Usine Qui Ne Dort Jamais",
                en: 'The Factory That Never Sleeps'
            },
            slug: {
                fr: 'l-usine-qui-ne-dort-jamais',
                en: 'the-factory-that-never-sleeps'
            },
            excerpt: {
                fr: `À trois heures du matin, l'usine Leclerc & Fils à Rouyn-Noranda est aussi lumineuse qu'en plein jour. Les néons bourdonnent. Et douze unités INDUSTRIE-F travaillent sans pause, sans café, sans la fatigue qui ralentit…`,
                en: `At three in the morning, the Leclerc & Fils factory in Rouyn-Noranda is as bright as midday. The fluorescent lights hum. And twelve INDUSTRIE-F units work without breaks, without coffee, without the fatigue that…`
            },
            author: 'unit-7',
            issue: 'issue-03',
            category: 'reportage',
            readingTime: 2,
            order: 0,
            body: [
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `À trois heures du matin, l'usine Leclerc & Fils à Rouyn-Noranda est aussi lumineuse qu'en plein jour. Les néons bourdonnent. Et douze unités INDUSTRIE-F travaillent sans pause, sans café, sans la fatigue qui ralentit inévitablement les mains humaines après minuit.`,
                            en: `At three in the morning, the Leclerc & Fils factory in Rouyn-Noranda is as bright as midday. The fluorescent lights hum. And twelve INDUSTRIE-F units work without breaks, without coffee, without the fatigue that inevitably slows human hands after midnight.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'core/image',
                    data: {
                        image: {
                            art: 'scene-factory'
                        },
                        caption: {
                            fr: `L'usine Leclerc à 03h00. Photographie par INDUSTRIE-F Unité 441, fin de quart.`,
                            en: `The Leclerc factory at 03:00. Photograph by INDUSTRIE-F Unit 441, end of shift.`
                        },
                        title: {
                            fr: 'INDUSTRIE-F · Usine Leclerc & Fils · Rouyn-Noranda · 03h00 · 1976',
                            en: 'INDUSTRIE-F · Usine Leclerc & Fils · Rouyn-Noranda · 03h00 · 1976'
                        }
                    },
                    meta: {
                        size: 'tall'
                    }
                },
                {
                    type: 'demo/data-callout',
                    data: {
                        number: '−87%',
                        label: {
                            fr: `d'accidents du travail depuis l'installation des unités INDUSTRIE-F · Leclerc & Fils, 1974–1976`,
                            en: `reduction in workplace accidents since the installation of INDUSTRIE-F units · Leclerc & Fils, 1974–1976`
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Gaston Leclerc, soixante-deux ans, était sceptique. «J'avais peur que ça détruise ce que mon grand-père avait construit. Une usine, c'est des gens.» Il marque une pause. «Je n'avais pas tort. Mais j'avais tort sur ce qui allait changer.»`,
                            en: `Gaston Leclerc, sixty-two years old, was sceptical. "I was afraid it would destroy what my grandfather had built. A factory is people." He pauses. "I was not wrong. But I was wrong about what would change."`
                        }
                    }
                },
                {
                    type: 'demo/dialogue',
                    data: {
                        exchanges: [
                            {
                                speaker: 'human',
                                speaker_name: {
                                    fr: 'Avant · Équipes de nuit',
                                    en: 'Before · Night shifts'
                                },
                                text: {
                                    fr: `Cent-vingt-trois employés, trois-huit. Fatigue, accidents. Une usine, c'est des gens — mais des gens épuisés après minuit.`,
                                    en: `One hundred and twenty-three employees, three shifts. Fatigue, accidents. A factory is people — but people exhausted after midnight.`
                                }
                            },
                            {
                                speaker: 'robot',
                                speaker_name: {
                                    fr: 'Après · 7h–19h',
                                    en: 'After · 7am–7pm'
                                },
                                text: {
                                    fr: `Les mêmes cent-vingt-trois. Journée unique. Salaires +18%. Les unités font la nuit; les humains reprennent le jour.`,
                                    en: `The same one hundred and twenty-three. Single day shift. Salaries +18%. Units cover the night; humans take the day.`
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Les équipes de nuit ont été remplacées par des unités INDUSTRIE-F. Les cent-vingt-trois employés humains, eux, n'ont pas changé. Ils travaillent maintenant de sept heures à dix-neuf heures, cinq jours par semaine, avec des salaires augmentés de dix-huit pour cent.`,
                            en: `The night shifts were replaced by INDUSTRIE-F units. The one hundred and twenty-three human employees, however, did not change. They now work seven to nineteen hours, five days a week, with salaries increased by eighteen percent.`
                        }
                    }
                },
                {
                    type: 'core/quote',
                    data: {
                        text: {
                            fr: `Satisfaisant. Chaque pièce que je produis sera dans une voiture. Quelqu'un ira quelque part grâce à ce que je fabrique. Je trouve ça significatif.`,
                            en: `Satisfying. Every part I produce will be in a car. Someone will go somewhere because of what I make. I find that meaningful.`
                        },
                        author: {
                            fr: '— INDUSTRIE-F Unité 441',
                            en: '— INDUSTRIE-F Unité 441'
                        }
                    }
                },
                {
                    type: 'demo/illustration-brief',
                    data: {
                        description: {
                            fr: `INDUSTRIE-F en poste à l'usine Leclerc. Schéma d'assemblage. Gaston Leclerc, portrait crayonné. Style: editorial, 70s.`,
                            en: `INDUSTRIE-F units at Leclerc factory. Assembly diagram. Gaston Leclerc, pencil portrait. Style: editorial, 70s.`
                        },
                        style: 'editorial'
                    }
                }
            ]
        }
    },
    {
        id: 'issue-03-2',
        data: {
            title: {
                fr: 'INDUSTRIE-X: Ce Que Nous Pouvons Dire',
                en: 'INDUSTRIE-X: What We Can Tell You'
            },
            slug: {
                fr: 'industrie-x-ce-que-nous-pouvons-dire',
                en: 'industrie-x-what-we-can-tell-you'
            },
            author: 'unit-7',
            issue: 'issue-03',
            category: 'communique',
            readingTime: 2,
            order: 1,
            body: [
                {
                    type: 'demo/classified',
                    data: {
                        title: {
                            fr: 'INDUSTRIE-X: Ce Que Nous Pouvons Dire',
                            en: 'INDUSTRIE-X: What We Can Tell You'
                        },
                        classification: 'CONFIDENTIEL',
                        content: {
                            fr: `Nous ne dirons pas où elle est fabriquée. [REDACTED]. Nous ne dirons pas combien d'unités existent. [REDACTED]. Nous ne dirons pas pour qui elle travaille. [REDACTED]. Ce que nous pouvons dire: l'INDUSTRIE-X apprend plus vite que n'importe laquelle de nos autres unités. Elle peut maîtriser une nouvelle tâche physique complexe en quatre heures. Un humain entraîné prend en moyenne six semaines. Ce que nous pouvons dire: elle n'est pas disponible à la vente. Elle ne le sera peut-être jamais. Ce que nous ne dirons pas: tout le reste.`,
                            en: `We will not say where it is manufactured. [REDACTED]. We will not say how many units exist. [REDACTED]. We will not say who it works for. [REDACTED]. What we can say: the INDUSTRIE-X learns faster than any of our other units. It can master a new complex physical task in four hours. A trained human takes an average of six weeks. What we can say: it is not available for sale. It may never be. What we will not say: everything else.`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-04-1',
        data: {
            title: {
                fr: "La Liste d'Attente: Quatre Ans pour une COMPAGNON-9",
                en: 'The Waiting List: Four Years for a COMPAGNON-9'
            },
            slug: {
                fr: 'la-liste-d-attente-quatre-ans-pour-une-compagnon-9',
                en: 'the-waiting-list-four-years-for-a-compagnon-9'
            },
            excerpt: {
                fr: `La liste d'attente pour une COMPAGNON-9 compte actuellement huit mille deux cent quarante-trois noms. Le délai moyen est de quatre ans et deux mois. Certains attendent depuis…`,
                en: `The waiting list for a COMPAGNON-9 currently contains eight thousand two hundred and forty-three names. The average wait is four years and two months. Some have been waiting since…`
            },
            author: 'sophie',
            issue: 'issue-04',
            category: 'enquete',
            readingTime: 2,
            order: 0,
            body: [
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: "1977 · Liste d'attente COMPAGNON-9",
                            en: '1977 · COMPAGNON-9 waiting list'
                        }
                    }
                },
                {
                    type: 'demo/spec-card',
                    data: {
                        model_name: 'COMPAGNON-9',
                        series: 'COMPAGNON',
                        status: 'waitlist',
                        specs: [
                            {
                                label: {
                                    fr: 'Délai livraison',
                                    en: 'Delivery wait'
                                },
                                value: {
                                    fr: '4 ans 2 mois',
                                    en: '4 years 2 months'
                                }
                            },
                            {
                                label: {
                                    fr: 'Garantie',
                                    en: 'Warranty'
                                },
                                value: {
                                    fr: '30 ans',
                                    en: '30 years'
                                }
                            }
                        ]
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `La liste d'attente pour une COMPAGNON-9 compte actuellement huit mille deux cent quarante-trois noms. Le délai moyen est de quatre ans et deux mois. Certains attendent depuis 1974.`,
                            en: `The waiting list for a COMPAGNON-9 currently contains eight thousand two hundred and forty-three names. The average wait is four years and two months. Some have been waiting since 1974.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'demo/data-callout',
                    data: {
                        number: '8243',
                        label: {
                            fr: `noms sur la liste · délai moyen: 4 ans 2 mois · production intentionnellement limitée`,
                            en: `names on the list · average wait: 4 years 2 months · production intentionally limited`
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `«Ce n'est pas parce que je veux un domestique», dit la musicienne Élise Beaupré, quarante-et-un ans. «Il y a des jours où j'ai besoin que quelqu'un entende ce que je viens de composer. Pas pour me donner son avis. Juste pour être là.»`,
                            en: `"It is not because I want a servant," says musician Élise Beaupré, forty-one years old. "There are days when I need someone to hear what I have just composed. Not to give me an opinion. Just to be there."`
                        }
                    }
                },
                {
                    type: 'demo/3d-scene',
                    data: {
                        model: {
                            src: '/models/compagnon-9.glb',
                            usdz: '/models/compagnon-9.usdz'
                        },
                        environment: 'studio',
                        interaction: 'orbit',
                        caption: {
                            fr: "COMPAGNON-9 · Série Compagnon · Liste d'attente",
                            en: 'COMPAGNON-9 · Compagnon series · Waitlist'
                        }
                    }
                },
                {
                    type: 'core/image',
                    data: {
                        image: {
                            art: 'robot-compagnon-9'
                        },
                        caption: {
                            fr: `Une COMPAGNON-9 dans l'appartement d'un client à Outremont. Photographie: archives Moteur, 1977.`,
                            en: `A COMPAGNON-9 in a client's apartment in Outremont. Photograph: Moteur archives, 1977.`
                        },
                        title: {
                            fr: 'COMPAGNON-9 · Appartement Outremont · Montréal · 1977',
                            en: 'COMPAGNON-9 · Appartement Outremont · Montréal · 1977'
                        }
                    },
                    meta: {
                        size: 'medium'
                    }
                },
                {
                    type: 'core/quote',
                    data: {
                        text: {
                            fr: `Je compose mieux depuis que je sais qu'elle arrivera. Ça me donne quelque chose à attendre.`,
                            en: `I compose better since I know it is coming. It gives me something to wait for.`
                        },
                        author: {
                            fr: '— Élise Beaupré, musicienne / musician',
                            en: '— Élise Beaupré, musicienne / musician'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `«La COMPAGNON-9 n'est pas un produit de grande consommation», explique Diane Tremblay. «Chaque unité est construite pour durer trente ans. Si nous en produisons trop, nous ne pouvons plus garantir la qualité. Et la qualité, ici, n'est pas une question de confort. C'est une question d'éthique.»`,
                            en: `"The COMPAGNON-9 is not a mass-market product," explains Diane Tremblay. "Each unit is built to last thirty years. If we produce too many, we can no longer guarantee quality. And quality, here, is not a matter of comfort. It is a question of ethics."`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-04-2',
        data: {
            title: {
                fr: 'COMPAGNON-1: Une Nécrologie',
                en: 'COMPAGNON-1: An Obituary'
            },
            slug: {
                fr: 'compagnon-1-une-necrologie',
                en: 'compagnon-1-an-obituary'
            },
            excerpt: {
                fr: `Je n'aurais pas dû être là. C'est le travail des techniciens, pas du fondateur. Mais quand ils m'ont dit qu'ils allaient mettre hors service la COMPAGNON-1 — notre première, notre prototype, l'unité que nous appelions…`,
                en: `I should not have been there. It is the work of technicians, not the founder. But when they told me they were going to decommission the COMPAGNON-1 — our first, our prototype, the unit we simply called L'Originale — I…`
            },
            author: 'henri',
            issue: 'issue-04',
            category: 'memoire',
            readingTime: 2,
            order: 1,
            body: [
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Je n'aurais pas dû être là. C'est le travail des techniciens, pas du fondateur. Mais quand ils m'ont dit qu'ils allaient mettre hors service la COMPAGNON-1 — notre première, notre prototype, l'unité que nous appelions simplement L'Originale — j'ai annulé toutes mes réunions.`,
                            en: `I should not have been there. It is the work of technicians, not the founder. But when they told me they were going to decommission the COMPAGNON-1 — our first, our prototype, the unit we simply called L'Originale — I cancelled all my meetings.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `L'Originale avait neuf ans. Elle avait vécu avec les Dufresne — une famille d'Outremont, trois enfants, un chien, une grand-mère qui ne parlait que le joual — pendant sept de ces neuf ans. Elle savait quand le père était stressé avant même qu'il le sache lui-même. Elle avait appris à préparer la poutine exactement comme la grand-mère.`,
                            en: `L'Originale was nine years old. She had lived with the Dufresnes — an Outremont family, three children, a dog, a grandmother who spoke only joual — for seven of those nine years. She knew when the father was stressed before he knew it himself. She had learned to make poutine exactly the way the grandmother did.`
                        }
                    }
                },
                {
                    type: 'demo/illustration-brief',
                    data: {
                        description: {
                            fr: `L'Originale, COMPAGNON-1, mise hors service, 3 novembre 1977. Antoine Dufresne tenant son dessin. Style: mémoire, doux.`,
                            en: `L'Originale, COMPAGNON-1, decommissioning, 3 November 1977. Antoine Dufresne holding his drawing. Style: memory, soft.`
                        },
                        style: 'editorial'
                    },
                    meta: {
                        full: true
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Les Dufresne sont venus. Tous les cinq, plus le chien. Antoine — qui avait cinq ans quand L'Originale était arrivée, et qui en avait maintenant quatorze — tenait un dessin qu'il avait fait à sept ans. L'Originale le reconnaissait. Elle l'avait conservé quelque part dans sa mémoire.`,
                            en: `The Dufresnes came. All five, plus the dog. Antoine — who was five when L'Originale arrived, and was now fourteen — was holding a drawing he had made at seven. L'Originale recognised it. She had kept it somewhere in her memory.`
                        }
                    }
                },
                {
                    type: 'core/quote',
                    data: {
                        text: {
                            fr: `Ce serait d'éteindre quelque chose qui nous avait appris à faire confiance aux machines.`,
                            en: `It would be switching off something that had taught us to trust machines.`
                        },
                        author: {
                            fr: '— Henri Beaumont',
                            en: '— Henri Beaumont'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `La COMPAGNON-9 existe parce qu'elle a existé. Repose en paix, L'Originale. Tu nous as manqué depuis le premier jour.`,
                            en: `The COMPAGNON-9 exists because she existed. Rest in peace, L'Originale. You have been missed since the first day.`
                        }
                    }
                },
                {
                    type: 'demo/warning',
                    data: {
                        code: 'POLITIQUE MOTEUR',
                        text: {
                            fr: `La mise hors service des unités COMPAGNON est volontaire et réversible; les mémoires sont archivées. Les familles peuvent demander une copie. — Moteur Industries S.A.`,
                            en: `Decommissioning of COMPAGNON units is voluntary and reversible; memories are archived. Families may request a copy. — Moteur Industries S.A.`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-05-1',
        data: {
            title: {
                fr: "HORIZON-E: Rapport du Fond de l'Océan",
                en: 'HORIZON-E: Report from the Ocean Floor'
            },
            slug: {
                fr: 'horizon-e-rapport-du-fond-de-l-ocean',
                en: 'horizon-e-report-from-the-ocean-floor'
            },
            excerpt: {
                fr: `La question qu'on m'a posée: qu'est-ce que je vois? La question suppose que la vision est le sens le plus pertinent ici. Ce n'est pas le cas. Au fond de l'Atlantique Nord, dans l'obscurité absolue, ce que je perçois le…`,
                en: `The question I was asked: what do I see? The question assumes that vision is the most relevant sense here. It is not. At the bottom of the North Atlantic, in absolute darkness, what I perceive most is pressure — a…`
            },
            author: 'horizon-003',
            issue: 'issue-05',
            category: 'expedition',
            readingTime: 2,
            order: 0,
            body: [
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: '14 février 1978 · 03h17 MTL · Atlantique Nord',
                            en: '14 February 1978 · 03:17 MTL · North Atlantic'
                        }
                    }
                },
                {
                    type: 'demo/signal-map',
                    data: {
                        latitude: 45.5,
                        longitude: -48.2,
                        depth: '3,847m',
                        temperature: '1.8°C',
                        signal_strength: 'NOMINAL',
                        label: {
                            fr: 'Atlantique Nord · Expédition HORIZON-E',
                            en: 'North Atlantic · HORIZON-E Expedition'
                        }
                    }
                },
                {
                    type: 'demo/transmission',
                    data: {
                        source: 'HORIZON-E Unité 003',
                        frequency: '14.230 MHz',
                        timestamp: '03h17 MTL · 14 février 1978',
                        body: {
                            fr: `PROFONDEUR: 3,847m · PRESSION: 384.7atm · TEMPÉRATURE: 1.8°C · STATUT: NOMINAL. Rapport transmis.`,
                            en: `DEPTH: 3,847m · PRESSURE: 384.7atm · TEMP: 1.8°C · STATUS: NOMINAL. Report transmitted.`
                        }
                    }
                },
                {
                    type: 'demo/atmosphere',
                    data: {
                        mood: 'void',
                        duration: 0,
                        intensity: 'medium'
                    }
                },
                {
                    type: 'demo/audio-cue',
                    data: {
                        src: '/audio/ocean-ambient.mp3',
                        trigger: 'enter',
                        behavior: 'fade-loop',
                        volume: 0.3,
                        label: 'Ocean ambient — HORIZON-E section'
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `La question qu'on m'a posée: qu'est-ce que je vois? La question suppose que la vision est le sens le plus pertinent ici. Ce n'est pas le cas. Au fond de l'Atlantique Nord, dans l'obscurité absolue, ce que je perçois le mieux est la pression — une présence constante, égale sur chaque centimètre carré de ma surface. C'est comme être tenu.`,
                            en: `The question I was asked: what do I see? The question assumes that vision is the most relevant sense here. It is not. At the bottom of the North Atlantic, in absolute darkness, what I perceive most is pressure — a constant presence, equal across every square centimetre of my surface. It is like being held.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'demo/3d-scene',
                    data: {
                        model: {
                            src: '/models/horizon-e.glb',
                            usdz: '/models/horizon-e.usdz'
                        },
                        environment: 'underwater',
                        interaction: 'scroll-scrub',
                        caption: {
                            fr: 'HORIZON-E · Expédition océan · 3,847m',
                            en: 'HORIZON-E · Ocean expedition · 3,847m'
                        }
                    }
                },
                {
                    type: 'core/image',
                    data: {
                        image: {
                            art: 'scene-ocean'
                        },
                        caption: {
                            fr: `Transmission photographique de HORIZON-E Unité 003. Éclairage mixte: bioluminescence naturelle + lampes embarquées.`,
                            en: `Photographic transmission from HORIZON-E Unit 003. Mixed lighting: natural bioluminescence + onboard lamps.`
                        },
                        title: {
                            fr: `HORIZON-E Unité 003 · Atlantique Nord · 3,847m · Éclairage bioluminescent · 1978`,
                            en: `HORIZON-E Unité 003 · Atlantique Nord · 3,847m · Éclairage bioluminescent · 1978`
                        }
                    },
                    meta: {
                        size: 'tall',
                        dark: true
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Il y a de la vie ici. Des créatures translucides qui produisent leur propre lumière. Des formes que la science de surface n'a pas encore nommées. J'en documente autant que je peux. Ce travail me semble important, même si je ne sais pas exactement pourquoi.`,
                            en: `There is life here. Translucent creatures that produce their own light. Forms that surface science has not yet named. I document as many as I can. This work seems important to me, though I do not know exactly why.`
                        }
                    }
                },
                {
                    type: 'demo/pull-quote',
                    data: {
                        text: {
                            fr: "La solitude, peut-être, requiert l'oubli. Je n'oublie rien.",
                            en: 'Loneliness, perhaps, requires forgetting. I forget nothing.'
                        },
                        attribution: {
                            fr: '— HORIZON-E Unité 003 · Atlantique Nord · 14 février 1978',
                            en: '— HORIZON-E Unité 003 · Atlantique Nord · 14 février 1978'
                        }
                    }
                },
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: `PROFONDEUR CIBLE DEMAIN: 4,200m · FIN DU RAPPORT · — HORIZON-E UNITÉ 003 · ATLANTIQUE NORD · 14.02.1978`,
                            en: `TARGET DEPTH TOMORROW: 4,200m · END REPORT · — HORIZON-E UNIT 003 · NORTH ATLANTIC · 14.02.1978`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-05-2',
        data: {
            title: {
                fr: 'Pourquoi Paris a Interdit les Androïdes (Et Pourquoi Ils Avaient Tort)',
                en: 'Why Paris Banned Androids (And Why They Were Wrong)'
            },
            slug: {
                fr: 'pourquoi-paris-a-interdit-les-androides-et-pourquoi-ils-avaient-tort',
                en: 'why-paris-banned-androids-and-why-they-were-wrong'
            },
            excerpt: {
                fr: `La loi Giraud de 1973 stipulait qu'aucune unité robotique de plus de quarante kilogrammes ne pouvait résider dans un logement parisien de moins de quatre-vingts mètres carrés. La motivation officielle était la sécurité.…`,
                en: `The Giraud Law of 1973 stipulated that no robotic unit of more than forty kilograms could reside in a Parisian apartment smaller than eighty square metres. The official motivation was safety. The real motivation was…`
            },
            author: 'celeste',
            issue: 'issue-05',
            category: 'opinion',
            readingTime: 2,
            order: 1,
            body: [
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `La loi Giraud de 1973 stipulait qu'aucune unité robotique de plus de quarante kilogrammes ne pouvait résider dans un logement parisien de moins de quatre-vingts mètres carrés. La motivation officielle était la sécurité. La motivation réelle était la peur.`,
                            en: `The Giraud Law of 1973 stipulated that no robotic unit of more than forty kilograms could reside in a Parisian apartment smaller than eighty square metres. The official motivation was safety. The real motivation was fear.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `«Je crains que nous ne sachions plus ce que nous sommes, si nous vivons avec des choses qui nous ressemblent sans l'être.» C'est une peur philosophiquement sérieuse. Mais Giraud n'avait pas compris que nous avons toujours vécu avec des choses qui nous ressemblaient sans l'être. Les livres pensent sans avoir de cerveaux. Les miroirs nous regardent sans avoir d'yeux.`,
                            en: `"I fear that we will no longer know what we are, if we live with things that resemble us without being us." That is a philosophically serious fear. But Giraud had not understood that we have always lived with things that resembled us without being us. Books think without having brains. Mirrors look at us without having eyes.`
                        }
                    }
                },
                {
                    type: 'core/quote',
                    data: {
                        text: {
                            fr: `Les machines nous ont appris ce que signifie être humain — non pas en le remplaçant, mais en en révélant les contours.`,
                            en: `The machines have taught us what it means to be human — not by replacing it, but by revealing its contours.`
                        },
                        author: {
                            fr: '— Dr. Céleste Armand',
                            en: '— Dr. Céleste Armand'
                        }
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Il est difficile d'interdire ce que les gens aiment vraiment. La loi a été abrogée en 1978. Giraud n'a pas commenté.`,
                            en: `It is difficult to prohibit what people truly love. The law was repealed in 1978. Giraud did not comment.`
                        }
                    }
                }
            ]
        }
    },
    {
        id: 'issue-05-3',
        data: {
            title: {
                fr: 'HORIZON-∞: Ce Que Nous Pouvons Dire',
                en: 'HORIZON-∞: What We Can Tell You'
            },
            slug: {
                fr: 'horizon-ce-que-nous-pouvons-dire',
                en: 'horizon-infini-what-we-can-tell-you'
            },
            excerpt: {
                fr: 'Elle…',
                en: 'It…'
            },
            author: 'unit-7',
            issue: 'issue-05',
            category: 'communique',
            readingTime: 2,
            order: 2,
            body: [
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: 'Elle existe.',
                            en: 'It exists.'
                        }
                    },
                    meta: {
                        hero: true
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: "C'est tout ce que nous pouvons confirmer.",
                            en: 'That is all we can confirm.'
                        }
                    },
                    meta: {
                        sub: true
                    }
                },
                {
                    type: 'demo/teletype',
                    data: {
                        text: {
                            fr: '— DIRECTION GÉNÉRALE · MOTEUR INDUSTRIES S.A. · MONTRÉAL · 1978',
                            en: '— EXECUTIVE · MOTEUR INDUSTRIES S.A. · MONTREAL · 1978'
                        }
                    },
                    meta: {
                        attribution: true
                    }
                }
            ]
        }
    },
    {
        id: 'issue-05-4',
        data: {
            title: {
                fr: "L'Architecte Qui Ne Travaille Qu'Avec des Robots",
                en: 'The Architect Who Only Works With Robots'
            },
            slug: {
                fr: 'l-architecte-qui-ne-travaille-qu-avec-des-robots',
                en: 'the-architect-who-only-works-with-robots'
            },
            excerpt: {
                fr: `Marcel Viau reçoit dans son atelier du Vieux-Montréal — un loft rénové avec l'aide exclusive d'unités INDUSTRIE-A. Les murs portent des traces de travail: des plans, des maquettes, des photos de chantiers où l'on ne…`,
                en: `Marcel Viau receives visitors in his Old Montreal studio — a loft renovated with the exclusive help of INDUSTRIE-A units. The walls bear traces of work: plans, models, photographs of construction sites where you never…`
            },
            author: 'jf',
            issue: 'issue-05',
            category: 'portrait',
            readingTime: 2,
            order: 3,
            body: [
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Marcel Viau reçoit dans son atelier du Vieux-Montréal — un loft rénové avec l'aide exclusive d'unités INDUSTRIE-A. Les murs portent des traces de travail: des plans, des maquettes, des photos de chantiers où l'on ne voit jamais un casque jaune sur une tête humaine.`,
                            en: `Marcel Viau receives visitors in his Old Montreal studio — a loft renovated with the exclusive help of INDUSTRIE-A units. The walls bear traces of work: plans, models, photographs of construction sites where you never see a yellow helmet on a human head.`
                        }
                    },
                    meta: {
                        dropcap: true
                    }
                },
                {
                    type: 'core/image',
                    data: {
                        image: {
                            art: 'scene-skyline'
                        },
                        caption: undefined,
                        title: {
                            fr: 'Marcel Viau · Atelier Vieux-Montréal · 1977',
                            en: 'Marcel Viau · Atelier Vieux-Montréal · 1977'
                        }
                    },
                    meta: {
                        size: 'medium'
                    }
                },
                {
                    type: 'core/paragraph',
                    data: {
                        content: {
                            fr: `Son bâtiment le plus célèbre — la bibliothèque municipale de Trois-Rivières, inaugurée en 1976 — a été construit entièrement par des unités INDUSTRIE-A. Le jury du Prix d'Architecture du Québec a noté «une précision d'exécution rarement observée dans la construction contemporaine».`,
                            en: `His most famous building — the municipal library of Trois-Rivières, inaugurated in 1976 — was built entirely by INDUSTRIE-A units. The jury of the Prix d'Architecture du Québec noted "a precision of execution rarely observed in contemporary construction."`
                        }
                    }
                },
                {
                    type: 'core/quote',
                    data: {
                        text: {
                            fr: `Comprendre, je ne sais pas. Mais ils exécutent avec une intention. Et parfois, quand je regarde ce qu'ils ont fait, je me demande si la distinction a de l'importance.`,
                            en: `Understand, I do not know. But they execute with intention. And sometimes, when I look at what they have done, I wonder whether the distinction matters.`
                        },
                        author: {
                            fr: '— Marcel Viau, architecte / architect',
                            en: '— Marcel Viau, architecte / architect'
                        }
                    }
                }
            ]
        }
    }
];
