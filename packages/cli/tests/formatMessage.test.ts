import { describe, it, expect } from 'vitest';
import {
    formatError,
    suggestNext,
    errProjectRequired,
    errIdRequired,
    errNotLoggedIn,
    errNotFound,
    successCreated,
    successDeleted
} from '../src/utils/formatMessage.js';

describe('formatMessage', () => {
    it('formatError returns message with ✗ prefix and optional auth hint', () => {
        expect(formatError(new Error('Not authenticated'))).toContain('✗ Error:');
        expect(formatError(new Error('Not authenticated'))).toContain('moteur auth login');
        expect(formatError(new Error('Something else'))).toBe('✗ Error: Something else');
    });

    it('suggestNext returns hint + Run: moteur <command> when hint provided', () => {
        expect(suggestNext('auth login', 'Not logged in.')).toBe(
            'Not logged in. Run: moteur auth login'
        );
    });

    it('suggestNext returns Run: moteur <command> when no hint', () => {
        expect(suggestNext('projects list')).toBe('Run: moteur projects list');
    });

    it('errProjectRequired includes example and help', () => {
        const msg = errProjectRequired();
        expect(msg).toContain('Project is required');
        expect(msg).toContain('moteur projects get');
        expect(msg).toContain('help projects');
    });

    it('errIdRequired includes command example', () => {
        expect(errIdRequired('projects get --id=my-blog')).toContain(
            'moteur projects get --id=my-blog'
        );
        expect(errIdRequired('entries delete --id=x', 'entry id')).toContain('entry id');
    });

    it('errNotLoggedIn suggests auth login', () => {
        expect(errNotLoggedIn()).toContain('moteur auth login');
    });

    it('errNotFound includes resource, id, and list command', () => {
        expect(errNotFound('project', 'x', 'projects list')).toBe(
            '"x" not found. List project: moteur projects list'
        );
    });

    it('successCreated includes resource, id, view command', () => {
        expect(successCreated('project', 'my-blog', 'projects get --id=my-blog')).toBe(
            'Created project "my-blog". View it: moteur projects get --id=my-blog'
        );
    });

    it('successDeleted includes resource, id, list command', () => {
        expect(successDeleted('project', 'x', 'projects list')).toBe(
            'Deleted project "x". List project: moteur projects list'
        );
    });
});
