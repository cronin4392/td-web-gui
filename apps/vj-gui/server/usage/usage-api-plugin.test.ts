// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Connect } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HEARTBEAT_MS, SHOW_CONTINUES_WITHIN_MS, type UsageReport } from '../../domain/usage/usage';
import { callHandler, callHandlerWithBody } from '../platform/api-plugin.test-helpers';
import { usageApiHandler } from './usage-api-plugin';
import { openUsageDb } from './usage-db';

const ROOTS = { scenes: 'C:/VJ/Scenes', effects: 'C:/VJ/Effects' };
const MINUTE = 60_000;
const ON: UsageReport = {
  layers: [
    {
      layer: 'A',
      activeScene: 'C:/VJ/Scenes/X/X.tox',
      level: 1,
      layout: 'normal',
      color: 'normal',
    },
  ],
  activeColorScheme: 'Colors/Red',
};
const OFF: UsageReport = { ...ON, layers: [{ ...ON.layers[0]!, level: 0 }] };

let dir: string;
let db: DatabaseSync;
let handler: Connect.NextHandleFunction;
let clock: number;

function newHandler(): Connect.NextHandleFunction {
  return usageApiHandler(() => db, { roots: ROOTS, now: () => clock });
}

async function post(path: string, body: unknown, at = clock) {
  clock = at;
  const res = await callHandlerWithBody(handler, 'POST', path, JSON.stringify(body));
  return { ...res, json: res.status === 200 ? JSON.parse(res.body) : undefined };
}

async function holdOn(from: number, to: number): Promise<void> {
  for (let at = from; at < to; at += HEARTBEAT_MS) await post('/report', ON, at);
}

function count(table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vj-usage-api-'));
  db = openUsageDb(join(dir, 'usage.db'));
  clock = 0;
  handler = newHandler();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('usageApiHandler', () => {
  it('starts with Live mode off', () => {
    const res = callHandler(handler, 'GET', '/live');
    expect(JSON.parse(res.body)).toEqual({ on: false, paused: false });
  });

  it('ignores a report while Live mode is off', async () => {
    const res = await post('/report', ON);
    expect(res.json).toEqual({ on: false, paused: false });
    expect(count('spans')).toBe(0);
    expect(count('shows')).toBe(0);
  });

  it('records Spans into a Show while Live mode is on', async () => {
    expect((await post('/live', { on: true })).json).toEqual({ on: true, paused: false });
    await holdOn(1_000, MINUTE);
    await post('/report', OFF, MINUTE);

    expect(db.prepare('SELECT name, started_at, ended_at FROM spans').all()).toEqual([
      { name: 'X', started_at: 1_000, ended_at: MINUTE },
    ]);
    expect(db.prepare('SELECT path FROM scheme_spans').all()).toEqual([{ path: 'Colors/Red' }]);
    expect(db.prepare('SELECT started_at, ended_at FROM shows').all()).toEqual([
      { started_at: 0, ended_at: MINUTE },
    ]);
  });

  it('closes open Spans when Live mode turns off', async () => {
    await post('/live', { on: true });
    await post('/report', ON, 1_000);
    expect((await post('/live', { on: false }, 5_000)).json).toEqual({ on: false, paused: false });

    expect(db.prepare('SELECT ended_at FROM spans').all()).toEqual([{ ended_at: 5_000 }]);
    await post('/report', ON, 6_000);
    expect(count('spans')).toBe(1);
  });

  it('continues the Show when turned back on within the hour, and starts another after it', async () => {
    await post('/live', { on: true });
    await post('/live', { on: false }, MINUTE);
    await post('/live', { on: true }, 2 * MINUTE);
    expect(count('shows')).toBe(1);

    await post('/live', { on: false }, 3 * MINUTE);
    await post('/live', { on: true }, 3 * MINUTE + SHOW_CONTINUES_WITHIN_MS + 1);
    expect(count('shows')).toBe(2);
  });

  it('reports the Idle pause', async () => {
    await post('/live', { on: true });
    await holdOn(0, 5 * MINUTE);
    expect((await post('/report', ON, 5 * MINUTE)).json).toEqual({ on: true, paused: true });
  });

  it('leaves a second server on the same database off', async () => {
    await post('/live', { on: true });
    const second = newHandler();
    await callHandlerWithBody(second, 'POST', '/report', JSON.stringify(ON));
    expect(JSON.parse(callHandler(second, 'GET', '/live').body)).toEqual({
      on: false,
      paused: false,
    });
    expect(count('spans')).toBe(0);
  });

  it('answers scores by kind', async () => {
    await post('/live', { on: true });
    await holdOn(0, MINUTE);
    await post('/report', OFF, MINUTE);

    expect(JSON.parse(callHandler(handler, 'GET', '/scores?kind=scene').body)).toEqual({ X: 1 });
    expect(JSON.parse(callHandler(handler, 'GET', '/scores?kind=effect').body)).toEqual({});
    expect(JSON.parse(callHandler(handler, 'GET', '/scores?kind=scheme').body)).toEqual({
      'Colors/Red': 1,
    });
  });

  it('refuses scores for an unknown kind', () => {
    expect(callHandler(handler, 'GET', '/scores?kind=layer').status).toBe(400);
    expect(callHandler(handler, 'GET', '/scores').status).toBe(400);
  });

  it('refuses a malformed body', async () => {
    expect((await callHandlerWithBody(handler, 'POST', '/live', '{nope')).status).toBe(400);
    expect((await post('/live', { on: 'yes' })).status).toBe(400);
    expect((await post('/report', { layers: [{ layer: 'A' }] })).status).toBe(400);
  });

  it('passes anything else to the next middleware', () => {
    expect(callHandler(handler, 'GET', '').nexted).toBe(true);
    expect(callHandler(handler, 'DELETE', '/live').nexted).toBe(true);
  });
});
