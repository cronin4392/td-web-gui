// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultShowDocument, type ShowDocument } from '../../domain/showinfo/showinfo';
import { openShowInfoDb, readShowDocument } from './showinfo-db';
import { showInfoApiHandler } from './showinfo-api-plugin';
import { callHandler, callHandlerWithBody } from '../platform/api-plugin.test-helpers';

let dir: string;
let db: DatabaseSync;

function get() {
  return callHandler(
    showInfoApiHandler(() => db),
    'GET',
    '',
  );
}

function put(body: string) {
  return callHandlerWithBody(
    showInfoApiHandler(() => db),
    'PUT',
    '',
    body,
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-showinfo-api-'));
  db = openShowInfoDb(join(dir, 'showinfo.db'));
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed by the write-failure test
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('showInfoApiHandler', () => {
  it('GET returns the seeded default document', () => {
    const res = get();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).show.rows.map((r: { alias: string }) => r.alias)).toEqual(
      defaultShowDocument().show.rows.map((r) => r.alias),
    );
  });

  it('PUT malformed JSON is a 400', async () => {
    const res = await put('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toContain('malformed JSON');
  });

  it('PUT a shape that fails isShowDocument is a 400', async () => {
    const res = await put(JSON.stringify({ show: { rows: 'nope', artists: [] }, overrides: {} }));
    expect(res.status).toBe(400);
    expect(res.body).toContain('invalid show document shape');
  });

  it('PUT a valid document writes it and returns 204', async () => {
    const doc: ShowDocument = {
      show: {
        rows: [{ id: 'r1', alias: 'event', text: 'Elements', on: true }],
        artists: [{ id: 'a1', name: 'Variable', active: true }],
      },
      overrides: { A: ['Junglist'] },
    };

    const res = await put(JSON.stringify(doc));

    expect(res.status).toBe(204);
    expect(res.body).toBe('');
    expect(readShowDocument(db)).toEqual(doc);
  });

  it('PUT reports a write failure as a 500', async () => {
    db.close();
    const res = await put(JSON.stringify(defaultShowDocument()));
    expect(res.status).toBe(500);
  });

  it('passes other methods to the next middleware', async () => {
    const res = await callHandlerWithBody(
      showInfoApiHandler(() => db),
      'DELETE',
      '',
      '',
    );
    expect(res.nexted).toBe(true);
  });
});
