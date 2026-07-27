/**
 * Table behavior: read-only rendering of a `string[][]` readout. Renders rows
 * and cells, optionally lifts row 0 into a `<thead>`, formats per cell with the
 * ORIGINAL row index, updates in place as TD broadcasts, and — being a readout —
 * never sends anything back.
 */

import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createTDClient } from '../context';
import { createMockTD, flush } from '../testing/mockTD';
import { createManualScheduler } from '../testing/scheduler';

interface Params {
  cues: string[][];
}

const CUES = [
  ['name', 'time'],
  ['intro', '0:00'],
  ['drop', '1:30'],
];

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
});

async function setup(snapshot: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
  const td = createMockTD({ snapshot });
  const sched = createManualScheduler();
  const TD = createTDClient<Params>();
  host = document.createElement('div');
  document.body.appendChild(host);
  dispose = render(
    () => (
      <TD.Provider
        url="ws://test"
        options={{ WebSocket: td.WebSocket, scheduler: sched.scheduler }}
      >
        <TD.Table name="cues" data-testid="cues" {...attrs} />
      </TD.Provider>
    ),
    host,
  );
  await flush();
  return { td, sched, table: host.querySelector<HTMLTableElement>('[data-testid="cues"]')! };
}

/** Every body row as an array of cell texts. */
function body(table: HTMLTableElement): string[][] {
  return Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? ''),
  );
}

function head(table: HTMLTableElement): string[] {
  return Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent ?? '');
}

describe('Table', () => {
  it('renders every row and cell of the readout', async () => {
    const { table } = await setup({ cues: CUES });
    expect(body(table)).toEqual(CUES);
    expect(head(table)).toEqual([]);
  });

  it('carries the class hook and passes unknown props through', async () => {
    const { table } = await setup({ cues: CUES });
    expect(table.classList.contains('td-table')).toBe(true);
  });

  it('lifts row 0 into a thead with header', async () => {
    const { table } = await setup({ cues: CUES }, { header: true });
    expect(head(table)).toEqual(['name', 'time']);
    expect(body(table)).toEqual([
      ['intro', '0:00'],
      ['drop', '1:30'],
    ]);
  });

  it('renders empty rather than throwing before the snapshot lands', async () => {
    const { table } = await setup({});
    expect(body(table)).toEqual([]);
  });

  it('survives a value that is not a table at all', async () => {
    // Registry/schema drift — the console reports it; the component must not be
    // the thing that escalates it into a render crash.
    const { table } = await setup({ cues: 'not a table' });
    expect(body(table)).toEqual([]);
  });

  it('renders ragged rows at their own lengths', async () => {
    // TD tables are rectangular, but nothing on the wire enforces it, and a
    // short row must not shift the cells of the rows after it.
    const { table } = await setup({ cues: [['a', 'b'], ['c']] });
    expect(body(table)).toEqual([['a', 'b'], ['c']]);
  });

  it('formats each cell with its index in the original table', async () => {
    const { table } = await setup(
      { cues: CUES },
      { header: true, format: (cell: string, row: number, col: number) => `${row}:${col}:${cell}` },
    );
    // The header is row 0, so the first BODY row must format as row 1 — not as
    // row 0 of <tbody>. A formatter keyed on a row index must not shift meaning
    // when `header` is toggled.
    expect(head(table)).toEqual(['0:0:name', '0:1:time']);
    expect(body(table)).toEqual([
      ['1:0:intro', '1:1:0:00'],
      ['2:0:drop', '2:1:1:30'],
    ]);
  });

  it('updates when TD broadcasts a new table', async () => {
    const { td, table } = await setup({ cues: CUES });
    td.socket().serverSend({ type: 'update', params: { cues: [['only', 'row']] } });
    await flush();
    expect(body(table)).toEqual([['only', 'row']]);
  });

  it('shrinks when rows are removed', async () => {
    // Index-keyed rendering has to release the tail, not leave stale rows behind.
    const { td, table } = await setup({ cues: CUES });
    td.socket().serverSend({ type: 'update', params: { cues: [['intro', '0:00']] } });
    await flush();
    expect(body(table)).toEqual([['intro', '0:00']]);
  });

  it('never sends anything back', async () => {
    // A readout has no parameter behind it, so there is nothing to write to.
    const { td } = await setup({ cues: CUES });
    expect(td.socket().received.filter((m: any) => m?.type === 'update')).toHaveLength(0);
    expect(td.socket().received.filter((m: any) => m?.type === 'pulse')).toHaveLength(0);
  });
});
