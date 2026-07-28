// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Library } from '../domain/wordbank/wordbank';
import { openLibraryDb, readLibrary } from './text-db';
import { libraryApiHandler } from './library-api-plugin';
import { callHandler, callHandlerWithBody } from './api-plugin.test-helpers';

let dir: string;
let db: DatabaseSync;

function get() {
  return callHandler(
    libraryApiHandler(() => db),
    'GET',
    '',
  );
}

function put(body: string) {
  return callHandlerWithBody(
    libraryApiHandler(() => db),
    'PUT',
    '',
    body,
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-library-api-'));
  db = openLibraryDb(join(dir, 'library.db'));
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed by the write-failure test
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('libraryApiHandler', () => {
  it('GET returns the current library', () => {
    const res = get();
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).tabs).toHaveLength(1);
  });

  it('PUT malformed JSON is a 400', async () => {
    const res = await put('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toContain('malformed JSON');
  });

  it('PUT a shape that fails isLibrary is a 400', async () => {
    const res = await put(JSON.stringify({ tabs: 'nope', recent: [] }));
    expect(res.status).toBe(400);
    expect(res.body).toContain('invalid library shape');
  });

  it('PUT a valid library writes it and returns 204', async () => {
    const library: Library = {
      tabs: [{ id: 'tab-a', name: 'Cues', phrases: ['hello'] }],
      recent: ['hello'],
    };

    const res = await put(JSON.stringify(library));

    expect(res.status).toBe(204);
    expect(res.body).toBe('');
    expect(readLibrary(db).tabs.map((t) => t.id)).toEqual(['tab-a']);
  });

  it('PUT reports a write failure as a 500', async () => {
    db.close();
    const library: Library = { tabs: [{ id: 'x', name: 'X', phrases: [] }], recent: [] };

    const res = await put(JSON.stringify(library));
    expect(res.status).toBe(500);
  });

  it('passes other methods to the next middleware', async () => {
    const res = await callHandlerWithBody(
      libraryApiHandler(() => db),
      'DELETE',
      '',
      '',
    );
    expect(res.nexted).toBe(true);
  });
});
