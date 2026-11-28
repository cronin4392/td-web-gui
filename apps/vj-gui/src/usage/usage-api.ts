import {
  isLiveStatus,
  isUsageScores,
  type LiveStatus,
  type UsageKind,
  type UsageReport,
  type UsageScores,
} from '@domain/usage/usage';

const ENDPOINT = '/api/usage';

async function liveStatusFrom(res: Response, verb: string): Promise<LiveStatus> {
  if (!res.ok) throw new Error((await res.text()) || `${verb} failed (${res.status})`);
  const body: unknown = await res.json();
  if (!isLiveStatus(body)) throw new Error(`${verb} response failed shape validation`);
  return body;
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${ENDPOINT}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Falls back to off: a server that cannot say is not tracking. */
export async function fetchLive(): Promise<LiveStatus> {
  try {
    return await liveStatusFrom(await fetch(`${ENDPOINT}/live`), 'live');
  } catch (err) {
    console.warn('[vj-gui] failed to read Live mode', err);
    return { on: false, paused: false };
  }
}

export async function setLive(on: boolean): Promise<LiveStatus> {
  return liveStatusFrom(await post('live', { on }), 'live');
}

export async function postReport(report: UsageReport): Promise<LiveStatus> {
  return liveStatusFrom(await post('report', report), 'report');
}

/** Falls back to no scores, which sorts as the order the picker already had. */
export async function fetchScores(kind: UsageKind): Promise<UsageScores> {
  try {
    const res = await fetch(`${ENDPOINT}/scores?kind=${kind}`);
    if (!res.ok) throw new Error(`GET scores -> ${res.status}`);
    const body: unknown = await res.json();
    if (!isUsageScores(body)) throw new Error('response failed shape validation');
    return body;
  } catch (err) {
    console.warn(`[vj-gui] failed to load ${kind} usage scores`, err);
    return {};
  }
}
