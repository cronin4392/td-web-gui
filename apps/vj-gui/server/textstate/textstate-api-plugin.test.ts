// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultTextState, type TextState } from '../../domain/textstate/textstate';
import { openTextStateDb, readTextState } from './textstate-db';
import { textStateApiHandler } from './textstate-api-plugin';
import { callHandler, callHandlerWithBody } from '../platform/api-plugin.test-helpers';

let dir: string;
let db: DatabaseSync;

function get() {
  return callHandler(
    textStateApiHandler(() => db),
    'GET',
    '',
  );
}

function put(body: string) {
  return callHandlerWithBody(
    textStateApiHandler(() => db),
    'PUT',
    '',
    body,
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-textstate-api-'));
  db = openTextStateDb(join(dir, 'textstate.db'));
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed by the write-failure test
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('textStateApiHandler', () => {
  it('GET returns the seeded default document', () => {
    const res = get();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).show.rows.map((r: { alias: string }) => r.alias)).toEqual(
      defaultTextState().show.rows.map((r) => r.alias),
    );
  });

  it('PUT malformed JSON is a 400', async () => {
    const res = await put('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toContain('malformed JSON');
  });

  it('PUT a shape that fails isTextState is a 400', async () => {
    const res = await put(JSON.stringify({ show: { rows: 'nope' }, overrides: {} }));
    expect(res.status).toBe(400);
    expect(res.body).toContain('invalid show document shape');
  });

  it('PUT from a page still holding an artist roster is a 400 and writes nothing', async () => {
    const before = readTextState(db);
    const stale = { show: { rows: [], artists: [] }, overrides: {} };
    const res = await put(JSON.stringify(stale));
    expect(res.status).toBe(400);
    expect(readTextState(db)).toEqual(before);
  });

  it('PUT a valid document writes it and returns 204', async () => {
    const doc: TextState = {
      show: {
        rows: [
          { id: 'a1', alias: 'artist', text: 'Variable', on: true },
          { id: 'r1', alias: 'event', text: 'Elements', on: true },
        ],
      },
      overrides: { A: ['Junglist'] },
    };

    const res = await put(JSON.stringify(doc));

    expect(res.status).toBe(204);
    expect(res.body).toBe('');
    expect(readTextState(db)).toEqual(doc);
  });

  it('PUT reports a write failure as a 500', async () => {
    db.close();
    const res = await put(JSON.stringify(defaultTextState()));
    expect(res.status).toBe(500);
  });

  it('passes other methods to the next middleware', async () => {
    const res = await callHandlerWithBody(
      textStateApiHandler(() => db),
      'DELETE',
      '',
      '',
    );
    expect(res.nexted).toBe(true);
  });
});
