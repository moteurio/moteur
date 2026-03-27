import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusLine } from '../../src/ui/StatusLine.js';

describe('StatusLine', () => {
    it('renders host, user and project', () => {
        const { lastFrame } = render(
            <StatusLine host="api.moteur.io" user="user@example.com" project="my-blog" />
        );
        const output = lastFrame();
        expect(output).toContain('Host:');
        expect(output).toContain('api.moteur.io');
        expect(output).toContain('User:');
        expect(output).toContain('user@example.com');
        expect(output).toContain('Project:');
        expect(output).toContain('my-blog');
    });

    it('renders Presence line when presenceConnected and presenceCount provided', () => {
        const { lastFrame } = render(
            <StatusLine
                host="localhost"
                user="me"
                project="p1"
                presenceConnected={true}
                presenceCount={2}
            />
        );
        const output = lastFrame();
        expect(output).toContain('Presence:');
        expect(output).toContain('2 in project');
    });

    it('renders Presence disconnected when presenceConnected is false', () => {
        const { lastFrame } = render(
            <StatusLine host="localhost" user="me" project="p1" presenceConnected={false} />
        );
        const output = lastFrame();
        expect(output).toContain('Presence:');
        expect(output).toContain('disconnected');
    });

    it('renders Presence error when presenceError is set', () => {
        const { lastFrame } = render(
            <StatusLine
                host="localhost"
                user="me"
                project="p1"
                presenceConnected={false}
                presenceError="No access to this project"
            />
        );
        const output = lastFrame();
        expect(output).toContain('Presence:');
        expect(output).toContain('No access to this project');
    });
});
