import type { SourceEntry } from '../../runtime/types.js';
import { categories } from './categories.js';
import { authors } from './authors.js';
import { series, robots } from './catalogue.js';
import { issues } from './issues.js';
import { events } from './events.js';
import { articles } from './articles.js';
import { pressReleases, jobs, faq, settings } from './company.js';

/** All Journal entries, by model. The timeline orders their history by date. */
export function content(): Array<[string, SourceEntry[]]> {
    return [
        ['settings', settings],
        ['category', categories],
        ['author', authors],
        ['series', series],
        ['robot', robots],
        ['issue', issues],
        ['article', articles],
        ['event', events],
        ['press-release', pressReleases],
        ['job', jobs],
        ['faq', faq]
    ];
}
