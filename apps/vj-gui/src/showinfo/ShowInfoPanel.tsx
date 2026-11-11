import { For, Show, createSignal, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { aliases, type Alias, type ShowRow } from '@domain/showinfo/showinfo';
import { createContextMenu, type MenuItems } from '@/ui/ContextMenu';
import { adjustReorderTarget, dropIndexForRow, hasDragMime } from '@/ui/dnd';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import type { ShowEditor } from './show-editor';
import styles from './ShowInfoPanel.module.css';

const ROW_MIME = 'application/x-td-show-row';

function GripIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M3 4h10M3 8h10M3 12h10" />
    </svg>
  );
}

function MultilineText(props: {
  label: string;
  placeholder: string;
  value: string;
  onInput: (value: string) => void;
}): JSX.Element {
  return (
    <textarea
      class={styles.text}
      rows={2}
      aria-label={props.label}
      placeholder={props.placeholder}
      value={unescapeNewlines(props.value)}
      onInput={(event) => props.onInput(escapeNewlines(event.currentTarget.value))}
    />
  );
}

export function ShowInfoPanel(props: {
  editor: ShowEditor;
  class?: string;
  onClose?: () => void;
}): JSX.Element {
  const { editor } = props;
  const menu = createContextMenu({ overTextEntry: true });
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);

  const count = () => editor.state.rows.length;

  function rowMenu(row: ShowRow): MenuItems {
    return [
      {
        label: row.on ? 'Hide' : 'Show',
        checked: !row.on,
        onSelect: () => editor.toggleRow(row.id),
      },
      'separator',
      { label: 'Delete', danger: true, onSelect: () => editor.removeRow(row.id) },
    ];
  }

  return (
    <section class={`${styles.panel} ${props.class ?? ''}`}>
      <PanelHeader title="Show info">
        <Show when={props.onClose}>
          {(close) => (
            <PanelHeaderButton label="Close show info" onClick={close()}>
              ×
            </PanelHeaderButton>
          )}
        </Show>
      </PanelHeader>

      <div class={styles.body}>
        <ul class={styles.list}>
          <For each={editor.state.rows}>
            {(row, index) => (
              <li
                class={styles.item}
                classList={{ [styles.off!]: !row.on }}
                onDragOver={(event) => {
                  if (!hasDragMime(event.dataTransfer!, ROW_MIME)) return;
                  event.preventDefault();
                  setDropIndex(dropIndexForRow(event, event.currentTarget, index()));
                }}
                onDragLeave={() => setDropIndex(null)}
                onDrop={(event) => {
                  setDropIndex(null);
                  const raw = event.dataTransfer!.getData(ROW_MIME);
                  if (!raw) return;
                  event.preventDefault();
                  const from = Number(raw);
                  const to = dropIndexForRow(event, event.currentTarget, index());
                  editor.moveRow(from, adjustReorderTarget(from, to));
                }}
                onContextMenu={(event) => menu.open(event, rowMenu(row))}
              >
                <Show when={dropIndex() === index()}>
                  <div class={styles.dropIndicator} />
                </Show>
                <Show when={dropIndex() === count() && index() === count() - 1}>
                  <div class={`${styles.dropIndicator} ${styles.dropAfter}`} />
                </Show>
                <span
                  class={styles.handle}
                  draggable="true"
                  title="Drag to reorder"
                  onDragStart={(event) => {
                    const dataTransfer = event.dataTransfer!;
                    const item = event.currentTarget.parentElement!;
                    const box = item.getBoundingClientRect();
                    dataTransfer.setData(ROW_MIME, String(index()));
                    dataTransfer.effectAllowed = 'move';
                    dataTransfer.setDragImage(
                      item,
                      event.clientX - box.left,
                      event.clientY - box.top,
                    );
                  }}
                >
                  <GripIcon />
                </span>
                <select
                  class={styles.select}
                  aria-label="Alias"
                  value={row.alias ?? ''}
                  onChange={(event) =>
                    editor.setRowAlias(row.id, (event.currentTarget.value || null) as Alias | null)
                  }
                >
                  <option value="" aria-label="No alias" />
                  <For each={aliases}>{(alias) => <option value={alias}>{alias}</option>}</For>
                </select>
                <MultilineText
                  label="Row text"
                  placeholder="Text"
                  value={row.text}
                  onInput={(text) => editor.setRowText(row.id, text)}
                />
              </li>
            )}
          </For>
          <Show when={count() === 0}>
            <li class={styles.empty}>No rows yet.</li>
          </Show>
        </ul>
        <button
          type="button"
          class={`${styles.iconButton} ${styles.add}`}
          aria-label="Add a show row"
          onClick={() => editor.addRow()}
        >
          +
        </button>
      </div>

      {menu.element}
    </section>
  );
}
