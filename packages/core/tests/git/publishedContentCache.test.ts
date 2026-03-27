import { beforeEach, describe, it, expect } from 'vitest';
import { get, set, size, clear, configure } from '../../src/git/publishedContentCache.js';

describe('publishedContentCache', () => {
    beforeEach(() => {
        clear();
        configure({ maxSize: 500 });
    });

    it('returns undefined on cache miss', () => {
        expect(get('abc123', 'models/blog/entries/x/entry.json')).toBeUndefined();
    });

    it('stores and retrieves a value', () => {
        const json = '{"id":"x","data":{"title":"Hello"}}';
        set('abc123', 'models/blog/entries/x/entry.json', json);
        expect(get('abc123', 'models/blog/entries/x/entry.json')).toBe(json);
        expect(size()).toBe(1);
    });

    it('differentiates by commit hash', () => {
        set('aaa', 'path', '{"v":1}');
        set('bbb', 'path', '{"v":2}');
        expect(get('aaa', 'path')).toBe('{"v":1}');
        expect(get('bbb', 'path')).toBe('{"v":2}');
        expect(size()).toBe(2);
    });

    it('differentiates by path', () => {
        set('aaa', 'path/a', '{"a":1}');
        set('aaa', 'path/b', '{"b":1}');
        expect(get('aaa', 'path/a')).toBe('{"a":1}');
        expect(get('aaa', 'path/b')).toBe('{"b":1}');
    });

    it('overwrites existing entry for same key', () => {
        set('aaa', 'path', '{"v":1}');
        set('aaa', 'path', '{"v":2}');
        expect(get('aaa', 'path')).toBe('{"v":2}');
        expect(size()).toBe(1);
    });

    describe('LRU eviction', () => {
        beforeEach(() => {
            configure({ maxSize: 3 });
        });

        it('evicts least-recently-used entry when full', () => {
            set('a', 'p', '1');
            set('b', 'p', '2');
            set('c', 'p', '3');
            // cache is full (3/3). Insert a 4th — 'a' should be evicted.
            set('d', 'p', '4');
            expect(size()).toBe(3);
            expect(get('a', 'p')).toBeUndefined();
            expect(get('b', 'p')).toBe('2');
            expect(get('d', 'p')).toBe('4');
        });

        it('get() promotes entry so it is not evicted', () => {
            set('a', 'p', '1');
            set('b', 'p', '2');
            set('c', 'p', '3');
            // Access 'a' to promote it
            get('a', 'p');
            // Insert 'd' — 'b' should be evicted (it's now the oldest)
            set('d', 'p', '4');
            expect(get('a', 'p')).toBe('1');
            expect(get('b', 'p')).toBeUndefined();
        });
    });

    describe('clear', () => {
        it('empties the cache', () => {
            set('a', 'p', '1');
            set('b', 'p', '2');
            expect(size()).toBe(2);
            clear();
            expect(size()).toBe(0);
            expect(get('a', 'p')).toBeUndefined();
        });
    });

    describe('configure', () => {
        it('shrinks the cache, evicting excess entries', () => {
            set('a', 'p', '1');
            set('b', 'p', '2');
            set('c', 'p', '3');
            expect(size()).toBe(3);
            configure({ maxSize: 1 });
            expect(size()).toBe(1);
            // Only the most recent ('c') should remain
            expect(get('c', 'p')).toBe('3');
            expect(get('a', 'p')).toBeUndefined();
            expect(get('b', 'p')).toBeUndefined();
        });
    });
});
