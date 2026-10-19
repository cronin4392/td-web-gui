import { For, Show, type JSX } from 'solid-js';
import { escapeNewlines, unescapeNewlines } from 'td-core';
import { aliases, isBlank, type Alias } from '@domain/showinfo/showinfo';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import type { ShowInfoStore } from './store';
import styles from './ShowInfoPanel.module.css';

function EyeIcon(props: { open: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <Show when={props.open} fallback={<path d="M3 3l18 18" />}>
        <circle cx="12" cy="12" r="3" />
      </Show>
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

function RowControls(props: {
  label: string;
  index: number;
  count: number;
  on: boolean;
  onToggle: () => void;
  onMove: (toIndex: number) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div class={styles.controls}>
      <button
        type="button"
        class={styles.iconButton}
        aria-pressed={props.on}
        aria-label={`${props.label} ${props.on ? 'shown' : 'hidden'}`}
        title={props.on ? 'Shown' : 'Hidden'}
        onClick={props.onToggle}
      >
        <EyeIcon open={props.on} />
      </button>
      <button
        type="button"
        class={styles.iconButton}
        aria-label={`Move ${props.label} up`}
        disabled={props.index === 0}
        onClick={() => props.onMove(props.index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        class={styles.iconButton}
        aria-label={`Move ${props.label} down`}
        disabled={props.index === props.count - 1}
        onClick={() => props.onMove(props.index + 1)}
      >
        ↓
      </button>
      <button
        type="button"
        class={`${styles.iconButton} ${styles.danger}`}
        aria-label={`Remove ${props.label}`}
        onClick={props.onRemove}
      >
        ×
      </button>
    </div>
  );
}

export function ShowInfoPanel(props: {
  store: ShowInfoStore;
  class?: string;
  onClose?: () => void;
}): JSX.Element {
  const { store } = props;
  const activeArtists = () =>
    store.state.show.artists
      .filter((artist) => artist.active && !isBlank(artist.name))
      .map((artist) => artist.name)
      .join(' · ');

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
        <div class={styles.sectionHeader}>
          <h3 class={styles.sectionTitle}>Show</h3>
          <button
            type="button"
            class={styles.iconButton}
            aria-label="Add a show row"
            onClick={() => store.addRow()}
          >
            +
          </button>
        </div>
        <ul class={styles.list}>
          <For each={store.state.show.rows}>
            {(row, index) => (
              <li class={styles.item} classList={{ [styles.off!]: !row.on }}>
                <select
                  class={styles.select}
                  aria-label="Alias"
                  value={row.alias ?? ''}
                  onChange={(event) =>
                    store.setRowAlias(row.id, (event.currentTarget.value || null) as Alias | null)
                  }
                >
                  <option value="">none</option>
                  <For each={aliases}>{(alias) => <option value={alias}>{alias}</option>}</For>
                </select>
                <Show
                  when={row.alias === 'artist'}
                  fallback={
                    <MultilineText
                      label="Row text"
                      placeholder="Text"
                      value={row.text}
                      onInput={(text) => store.setRowText(row.id, text)}
                    />
                  }
                >
                  {(_artist) => (
                    <p class={styles.readout}>
                      <Show
                        when={activeArtists()}
                        fallback={<span class={styles.empty}>no active artists</span>}
                      >
                        {(value) => unescapeNewlines(value())}
                      </Show>
                    </p>
                  )}
                </Show>
                <RowControls
                  label={`row ${index() + 1}`}
                  index={index()}
                  count={store.state.show.rows.length}
                  on={row.on}
                  onToggle={() => store.toggleRow(row.id)}
                  onMove={(to) => store.moveRow(index(), to)}
                  onRemove={() => store.removeRow(row.id)}
                />
              </li>
            )}
          </For>
          <Show when={store.state.show.rows.length === 0}>
            <li class={styles.empty}>No rows yet.</li>
          </Show>
        </ul>

        <div class={styles.sectionHeader}>
          <h3 class={styles.sectionTitle}>Artists</h3>
          <button
            type="button"
            class={styles.iconButton}
            aria-label="Add an artist"
            onClick={() => store.addArtist()}
          >
            +
          </button>
        </div>
        <ul class={styles.list}>
          <For each={store.state.show.artists}>
            {(artist, index) => (
              <li class={styles.item} classList={{ [styles.off!]: !artist.active }}>
                <MultilineText
                  label="Artist name"
                  placeholder="Name"
                  value={artist.name}
                  onInput={(name) => store.setArtistName(artist.id, name)}
                />
                <RowControls
                  label={artist.name || `artist ${index() + 1}`}
                  index={index()}
                  count={store.state.show.artists.length}
                  on={artist.active}
                  onToggle={() => store.toggleArtist(artist.id)}
                  onMove={(to) => store.moveArtist(index(), to)}
                  onRemove={() => store.removeArtist(artist.id)}
                />
              </li>
            )}
          </For>
          <Show when={store.state.show.artists.length === 0}>
            <li class={styles.empty}>No artists yet.</li>
          </Show>
        </ul>
      </div>
    </section>
  );
}
