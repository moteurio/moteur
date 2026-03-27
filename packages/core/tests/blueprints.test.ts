import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    listBlueprints,
    getBlueprint,
    createBlueprint,
    updateBlueprint,
    deleteBlueprint
} from '../src/blueprints.js';
import type { BlueprintSchema } from '@moteurio/types/Blueprint.js';

describe('blueprints', () => {
    let tempDir: string;
    let originalBluprintsDir: string | undefined;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-blueprints-'));
        originalBluprintsDir = process.env.BLUEPRINTS_DIR;
        process.env.BLUEPRINTS_DIR = tempDir;
    });

    afterEach(async () => {
        if (originalBluprintsDir !== undefined) process.env.BLUEPRINTS_DIR = originalBluprintsDir;
        else delete process.env.BLUEPRINTS_DIR;
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('listBlueprints', () => {
        it('returns empty array when directory does not exist', () => {
            const list = listBlueprints('project');
            expect(list).toEqual([]);
        });

        it('returns empty array when kind subdir is empty', async () => {
            await fs.mkdir(path.join(tempDir, 'project'), { recursive: true });
            const list = listBlueprints('project');
            expect(list).toEqual([]);
        });

        it('returns blueprints from JSON files in kind subdir', async () => {
            const bp: BlueprintSchema = {
                id: 'blog',
                name: 'Blog Site',
                description: 'A blog template',
                kind: 'project'
            };
            await fs.mkdir(path.join(tempDir, 'project'), { recursive: true });
            await fs.writeFile(
                path.join(tempDir, 'project', 'blog.json'),
                JSON.stringify(bp),
                'utf-8'
            );
            const list = listBlueprints('project');
            expect(list).toHaveLength(1);
            expect(list[0]).toMatchObject({
                id: 'blog',
                name: 'Blog Site',
                description: 'A blog template'
            });
        });

        it('ignores non-JSON files', async () => {
            await fs.mkdir(path.join(tempDir, 'project'), { recursive: true });
            await fs.writeFile(path.join(tempDir, 'project', 'readme.txt'), 'hello', 'utf-8');
            const list = listBlueprints('project');
            expect(list).toEqual([]);
        });

        it('migrates root-level files to projects subdir', async () => {
            const bp: BlueprintSchema = {
                id: 'legacy',
                name: 'Legacy',
                description: 'Pre-migration'
            };
            await fs.mkdir(tempDir, { recursive: true });
            await fs.writeFile(path.join(tempDir, 'legacy.json'), JSON.stringify(bp), 'utf-8');
            const list = listBlueprints('project');
            expect(list).toHaveLength(1);
            expect(list[0]).toMatchObject({ id: 'legacy', name: 'Legacy' });
            const projectsDir = path.join(tempDir, 'project');
            const files = await fs.readdir(projectsDir);
            expect(files).toContain('legacy.json');
        });
    });

    describe('getBlueprint', () => {
        it('throws for invalid id', () => {
            expect(() => getBlueprint('project', 'invalid id!')).toThrow('Invalid blueprint id');
        });

        it('throws when file does not exist', () => {
            expect(() => getBlueprint('project', 'missing')).toThrow('not found');
        });

        it('returns blueprint when file exists', async () => {
            const bp: BlueprintSchema = {
                id: 'landing',
                name: 'Landing Page',
                description: 'Simple landing',
                kind: 'project'
            };
            await fs.mkdir(path.join(tempDir, 'project'), { recursive: true });
            await fs.writeFile(
                path.join(tempDir, 'project', 'landing.json'),
                JSON.stringify(bp),
                'utf-8'
            );
            const got = getBlueprint('project', 'landing');
            expect(got).toMatchObject({ id: 'landing', name: 'Landing Page' });
        });
    });

    describe('createBlueprint', () => {
        it('throws when id is missing', () => {
            expect(() => createBlueprint({ name: 'Test', id: '' as any })).toThrow(
                'Invalid blueprint id'
            );
        });

        it('throws when id is invalid', () => {
            expect(() => createBlueprint({ id: 'bad id', name: 'Test' })).toThrow(
                'Invalid blueprint id'
            );
        });

        it('writes blueprint file and returns payload', () => {
            const bp: BlueprintSchema = {
                id: 'portfolio',
                name: 'Portfolio',
                description: 'Showcase work',
                kind: 'project'
            };
            const result = createBlueprint(bp);
            expect(result).toMatchObject({ id: 'portfolio', name: 'Portfolio' });
        });

        it('persists blueprint so getBlueprint and listBlueprints see it', () => {
            createBlueprint({
                id: 'agency',
                name: 'Agency',
                description: 'Agency site',
                kind: 'project'
            });
            expect(getBlueprint('project', 'agency')).toMatchObject({
                id: 'agency',
                name: 'Agency'
            });
            const list = listBlueprints('project');
            expect(list.some(b => b.id === 'agency')).toBe(true);
        });

        it('writes to projects subdir when kind is project', async () => {
            createBlueprint({
                id: 'proj1',
                name: 'Project 1',
                kind: 'project'
            });
            const filePath = path.join(tempDir, 'project', 'proj1.json');
            await expect(fs.access(filePath)).resolves.toBeUndefined();
        });
    });

    describe('updateBlueprint', () => {
        it('throws when blueprint does not exist', () => {
            expect(() => updateBlueprint('project', 'nonexistent', { name: 'New' })).toThrow(
                'not found'
            );
        });

        it('merges patch and preserves id', () => {
            createBlueprint({
                id: 'patch-me',
                name: 'Old',
                description: 'Desc',
                kind: 'project'
            });
            const updated = updateBlueprint('project', 'patch-me', { name: 'New Name' });
            expect(updated.id).toBe('patch-me');
            expect(updated.name).toBe('New Name');
            expect(updated.description).toBe('Desc');
        });

        it('persists updated blueprint', () => {
            createBlueprint({
                id: 'persist',
                name: 'A',
                description: 'B',
                kind: 'project'
            });
            updateBlueprint('project', 'persist', { description: 'Updated desc' });
            const got = getBlueprint('project', 'persist');
            expect(got.description).toBe('Updated desc');
        });
    });

    describe('deleteBlueprint', () => {
        it('throws for invalid id', () => {
            expect(() => deleteBlueprint('project', 'invalid!')).toThrow('Invalid blueprint id');
        });

        it('removes file when it exists', () => {
            createBlueprint({
                id: 'to-delete',
                name: 'Delete Me',
                kind: 'project'
            });
            deleteBlueprint('project', 'to-delete');
            expect(() => getBlueprint('project', 'to-delete')).toThrow('not found');
        });

        it('does not throw when file does not exist', () => {
            expect(() => deleteBlueprint('project', 'already-gone')).not.toThrow();
        });
    });
});
