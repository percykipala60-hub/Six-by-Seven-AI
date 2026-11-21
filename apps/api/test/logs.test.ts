import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { testEnv } from './helpers.js';

describe('logs', () => {
  it("n'écrivent jamais le corps, la query string, les en-têtes ni l'IP", async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const app = await buildApp(testEnv({ LOG_LEVEL: 'info' }), { logStream });

    await app.inject({
      method: 'POST',
      url: '/health?conversation=Salut%20Mbuyi',
      headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
      payload: { texte: 'Mon code PIN est 1234' },
      remoteAddress: '41.243.1.2',
    });
    await app.close();

    // L'heure, le pid et les durées sont des nombres qui peuvent contenir « 1234 » par hasard
    // (ex. time 1791123400000 à 1791123499999) : on les retire avant de chercher le code PIN.
    const all = lines.join('\n').replace(/"(time|pid|responseTime)":[\d.]+/g, '"$1":0');
    expect(all).toContain('"path":"/health"');
    for (const forbidden of [
      'Mbuyi',
      'PIN',
      '1234',
      'secret-token',
      '41.243.1.2',
      'conversation=',
    ]) {
      expect(all).not.toContain(forbidden);
    }
  });
});
