import type { DatabaseSync } from 'node:sqlite';
import type { Connect, Plugin } from 'vite';
import {
  isUsageKind,
  isUsageReport,
  type LiveStatus,
  type UsageReport,
} from '../../domain/usage/usage';
import { checkpointWal, transaction } from '../platform/catalog-db';
import { optionalEnv } from '../platform/env';
import { readBody, routePath, sendError, sendJson, sqliteApiPlugin } from '../platform/api-plugin';
import { createTracker, type ContentRoots, type Tracker } from './tracker';
import { extendShow, openUsageDb, readScores, spanSink, startShow, usageDbPath } from './usage-db';

const ROUTE = '/api/usage';

function isLiveRequest(x: unknown): x is { on: boolean } {
  return typeof x === 'object' && x !== null && typeof (x as { on?: unknown }).on === 'boolean';
}

// Live mode lives in this closure, so a second dev server on the same database starts off and never writes.
export function usageApiHandler(
  getDb: () => DatabaseSync,
  config: { roots: ContentRoots; now?: () => number },
): Connect.NextHandleFunction {
  const now = config.now ?? Date.now;
  let live: { show: number; tracker: Tracker } | undefined;

  const status = (): LiveStatus => ({
    on: live !== undefined,
    paused: live?.tracker.paused() ?? false,
  });

  function setLive(db: DatabaseSync, on: boolean): void {
    if (on === (live !== undefined)) return;
    const at = now();
    if (!live) {
      const show = startShow(db, at);
      live = { show, tracker: createTracker(config.roots, spanSink(db, show)) };
      return;
    }
    const { show, tracker } = live;
    live = undefined;
    transaction(db, () => {
      tracker.stop(at);
      extendShow(db, show, at);
    });
    checkpointWal(db);
  }

  function report(db: DatabaseSync, body: UsageReport): void {
    if (!live) return;
    const { show, tracker } = live;
    const at = now();
    transaction(db, () => {
      tracker.report(body, at);
      extendShow(db, show, at);
    });
  }

  return async (req, res, next) => {
    const path = routePath(req);

    function respond(work: () => unknown): void {
      try {
        sendJson(res, work());
      } catch (err) {
        sendError(res, 500, err);
      }
    }

    async function respondToBody<T>(
      accepts: (body: unknown) => body is T,
      expected: string,
      work: (body: T) => unknown,
    ): Promise<void> {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendError(res, 400, 'malformed JSON');
        return;
      }
      if (!accepts(body)) {
        sendError(res, 400, `expected ${expected}`);
        return;
      }
      respond(() => work(body));
    }

    if (path === '/live' && req.method === 'GET') {
      respond(status);
      return;
    }

    if (path === '/live' && req.method === 'POST') {
      await respondToBody(isLiveRequest, '{ on: boolean }', (body) => {
        setLive(getDb(), body.on);
        return status();
      });
      return;
    }

    if (path === '/report' && req.method === 'POST') {
      await respondToBody(isUsageReport, '{ layers, activeColorScheme }', (body) => {
        report(getDb(), body);
        return status();
      });
      return;
    }

    if (path === '/scores' && req.method === 'GET') {
      const kind = new URL(req.url ?? '', 'http://localhost').searchParams.get('kind');
      if (!isUsageKind(kind)) {
        sendError(res, 400, 'expected ?kind=scene|effect|scheme');
        return;
      }
      respond(() => readScores(getDb(), kind));
      return;
    }

    next();
  };
}

export function vjGuiUsageApiPlugin(): Plugin {
  return sqliteApiPlugin({
    name: 'vj-gui-usage-api',
    route: ROUTE,
    openDb: () => openUsageDb(usageDbPath()),
    handler: (getDb) =>
      usageApiHandler(getDb, {
        roots: {
          scenes: optionalEnv(process.env, 'VJ_SCENES_ROOT'),
          effects: optionalEnv(process.env, 'VJ_EFFECTS_ROOT'),
        },
      }),
  });
}
