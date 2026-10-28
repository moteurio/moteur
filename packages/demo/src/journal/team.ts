import type { Persona } from '../runtime/types.js';

/**
 * The Journal's newsroom. Each becomes a Moteur user (and a git author) with the role that
 * fits their job, so the review workflow has real people on both sides.
 */
export const team = {
    louise: {
        id: 'journal-louise',
        name: 'Louise Gagnon',
        email: 'louise@moteur-journal.test',
        roles: ['admin']
    },
    celeste: {
        id: 'journal-celeste',
        name: 'Céleste Armand',
        email: 'celeste@moteur-journal.test',
        roles: ['reviewer']
    },
    marguerite: {
        id: 'journal-marguerite',
        name: 'Marguerite Fontaine',
        email: 'marguerite@moteur-journal.test',
        roles: ['writer']
    },
    sophie: {
        id: 'journal-sophie',
        name: 'Sophie Marchand',
        email: 'sophie@moteur-journal.test',
        roles: ['writer']
    },
    jf: {
        id: 'journal-jf',
        name: 'Jean-François Côté',
        email: 'jf@moteur-journal.test',
        roles: ['writer']
    },
    unit7: {
        id: 'journal-unit7',
        name: 'Unit 7-PASCAL',
        email: 'unit7@moteur-journal.test',
        roles: ['writer']
    },
    theo: {
        id: 'journal-theo',
        name: 'Théo Nguyen',
        email: 'theo@moteur-journal.test',
        roles: ['admin']
    }
} satisfies Record<string, Persona>;

export type TeamMember = keyof typeof team;
export const personas: Persona[] = Object.values(team);
export const lead = team.louise;
export const reviewer = team.celeste;

/** Persona id for a team member key (sources refer to people by key). */
export const who = (key: TeamMember) => team[key].id;
