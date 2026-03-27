import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ContentPanel } from '../../src/ui/ContentPanel.js';

const baseProps = {
    breadcrumb: 'Content',
    keyboardHint: 'Esc back',
    hasProject: false,
    loggedIn: true,
    listItems: [],
    filteredItems: [],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    loading: false,
    error: null,
    hasMore: false,
    confirmDeleteId: null as string | null,
    bulkConfirm: null as 'delete' | null,
    showBulkMenu: false,
    whoami: null as Record<string, unknown> | null,
    projectLabel: '',
    projectId: null as string | null,
    toast: null as { message: string; type: 'success' | 'error' | 'info' } | null,
    onDismissToast: () => {}
};

describe('ContentPanel', () => {
    it('shows breadcrumb and no-project message when hasProject is false', () => {
        const { lastFrame } = render(
            <ContentPanel {...baseProps} currentScreen="pages" hasProject={false} />
        );
        const output = lastFrame();
        expect(output).toContain('Content');
        expect(output).toContain('No default project set');
        expect(output).toContain('moteur projects list');
    });

    it('shows project screen when currentScreen is project and hasProject', () => {
        const { lastFrame } = render(
            <ContentPanel
                {...baseProps}
                currentScreen="project"
                hasProject={true}
                projectLabel="My Blog"
                projectId="my-blog"
            />
        );
        const output = lastFrame();
        expect(output).toContain('My Blog');
        expect(output).toContain('ID:');
        expect(output).toContain('my-blog');
    });

    it('shows toast when toast prop is set', () => {
        const { lastFrame } = render(
            <ContentPanel
                {...baseProps}
                currentScreen="project"
                hasProject={true}
                toast={{ message: 'Saved!', type: 'success' }}
            />
        );
        const output = lastFrame();
        expect(output).toContain('Saved!');
    });

    it('shows StatusBar with keyboard hint', () => {
        const { lastFrame } = render(
            <ContentPanel
                {...baseProps}
                currentScreen="project"
                hasProject={true}
                keyboardHint="Enter open"
            />
        );
        const output = lastFrame();
        expect(output).toContain('Enter open');
    });
});
