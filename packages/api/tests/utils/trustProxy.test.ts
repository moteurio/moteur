import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { trustProxySetting } from '../../src/utils/trustProxy.js';

describe('trustProxySetting', () => {
    it('trusts no proxy by default', () => {
        expect(trustProxySetting(undefined)).toBe(false);
        expect(trustProxySetting('')).toBe(false);
        expect(trustProxySetting('0')).toBe(false);
    });

    it('takes a hop count, or addresses', () => {
        expect(trustProxySetting('1')).toBe(1);
        expect(trustProxySetting('loopback, 10.0.0.0/8')).toEqual(['loopback', '10.0.0.0/8']);
    });

    it('refuses to trust everyone', () => {
        expect(() => trustProxySetting('true')).toThrow(/TRUST_PROXY/);
    });

    it('gives each visitor behind one proxy their own address', async () => {
        const app = express();
        app.set('trust proxy', trustProxySetting('1'));
        app.get('/', (req, res) => res.send(req.ip));

        const res = await request(app).get('/').set('X-Forwarded-For', '203.0.113.7');
        expect(res.text).toBe('203.0.113.7');

        // A forged address in front of the proxy's own is not believed.
        const forged = await request(app)
            .get('/')
            .set('X-Forwarded-For', '198.51.100.1, 203.0.113.7');
        expect(forged.text).toBe('203.0.113.7');
    });
});
