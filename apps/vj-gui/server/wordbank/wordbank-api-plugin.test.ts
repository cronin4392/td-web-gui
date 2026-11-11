// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Wordbank } from '../../domain/wordbank/wordbank';
import { openWordbankDb, readWordbank } from './wordbank-db';
import { wordbankApiHandler } from './wordbank-api-plugin';
import { callHandler, callHandlerWithBody } from '../platform/api-plugin.test-helpers';

let dir: string;
let db: DatabaseSync;

function get() {
  return callHandler(
    wordbankApiHandler(() => db),
    'GET',
    '',
  );
}

function put(body: string) {
  return callHandlerWithBody(
    wordbankApiHandler(() => db),
    'PUT',
    '',
    body,
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-wordbank-api-'));
  db = openWordbankDb(join(dir, 'wordbank.db'));
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed by the write-failure test
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('wordbankApiHandler', () => {
  it('GET returns the current wordbank', () => {
    const res = get();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).lists).toHaveLength(1);
  });

  it('PUT malformed JSON is a 400', async () => {
    const res = await put('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toContain('malformed JSON');
  });

  it('PUT a shape that fails isWordbank is a 400', async () => {
    const res = await put(JSON.stringify({ lists: 'nope', recent: [] }));
    expect(res.status).toBe(400);
    expect(res.body).toContain('invalid wordbank shape');
  });

  it('PUT a valid wordbank writes it and returns 204', async () => {
    const wordbank: Wordbank = {
      lists: [{ id: 'tab-a', name: 'Cues', phrases: ['hello'] }],
      recent: ['hello'],
    };

    const res = await put(JSON.stringify(wordbank));

    expect(res.status).toBe(204);
    expect(res.body).toBe('');
    expect(readWordbank(db).lists.map((l) => l.id)).toEqual(['tab-a']);
  });

  it('PUT reports a write failure as a 500', async () => {
    db.close();
    const wordbank: Wordbank = { lists: [{ id: 'x', name: 'X', phrases: [] }], recent: [] };

    const res = await put(JSON.stringify(wordbank));
    expect(res.status).toBe(500);
  });

  it('passes other methods to the next middleware', async () => {
    const res = await callHandlerWithBody(
      wordbankApiHandler(() => db),
      'DELETE',
      '',
      '',
    );
    expect(res.nexted).toBe(true);
  });
});
