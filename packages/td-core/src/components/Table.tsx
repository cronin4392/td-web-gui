/**
 * `<Table>` — read-only rendering of a whole DAT table.
 *
 * Binds a `string[][]` readout (a `READOUTS` entry declaring `type:
 * 'string[][]'`). Like `<Value>`, it subscribes to inbound updates only: it
 * never sends and never participates in focus/echo logic, because a table
 * readout has no parameter behind it to write to.
 */

import { Index, Show, splitProps, type JSX } from 'solid-js';
import { createTDSignal } from '../context';
import { mergeClass } from './props';

export interface TableProps extends Omit<JSX.HTMLAttributes<HTMLTableElement>, 'children'> {
  /** Readout name to read. */
  name: string;
  /** Render row 0 as a `<thead>` of `<th>` cells. TD tables usually have one. */
  header?: boolean;
  /** Optional per-cell formatter, receiving the cell's row and column index. */
  format?: (cell: string, row: number, col: number) => string;
}

export function Table(props: TableProps): JSX.Element {
  const binding = createTDSignal<string[][]>(props.name);
  const [, rest] = splitProps(props, ['name', 'class', 'header', 'format']);

  const rows = (): string[][] => {
    const value = binding.value();
    // Anything but a table renders as empty rather than throwing. The signal is
    // `undefined` until the first snapshot lands, and a name that turns out to
    // be a scalar is a schema/registry drift the console already reports — a
    // component is the wrong place to escalate it.
    return Array.isArray(value) ? value : [];
  };

  /** Rows below the header, which is row 0 when `header` is set. */
  const bodyRows = (): string[][] => (props.header ? rows().slice(1) : rows());
  const headerRow = (): string[] | undefined => (props.header ? rows()[0] : undefined);

  // Offset so `format` always receives the cell's index in the ORIGINAL table,
  // not its index within <tbody>. A formatter keyed on row 3 must not shift
  // meaning when `header` is toggled.
  const bodyOffset = (): number => (props.header ? 1 : 0);

  const cell = (value: string, row: number, col: number): string =>
    props.format ? props.format(value, row, col) : value;

  return (
    <table {...rest} class={mergeClass('td-table', props.class)}>
      <Show when={headerRow()}>
        {(head) => (
          <thead>
            <tr>
              {/* Index, not For: cells are strings and their position IS their
                  identity, so index-keyed updates rewrite text in place instead
                  of tearing down and rebuilding a row's DOM on every change. */}
              <Index each={head()}>
                {(text, col) => <th scope="col">{cell(text(), 0, col)}</th>}
              </Index>
            </tr>
          </thead>
        )}
      </Show>
      <tbody>
        <Index each={bodyRows()}>
          {(row, rowIndex) => (
            <tr>
              <Index each={row()}>
                {(text, col) => <td>{cell(text(), rowIndex + bodyOffset(), col)}</td>}
              </Index>
            </tr>
          )}
        </Index>
      </tbody>
    </table>
  );
}
