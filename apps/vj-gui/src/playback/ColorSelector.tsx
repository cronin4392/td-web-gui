/**
 * The GUI project's Color schemes, as a tab per Color group and a swatch per
 * scheme. Clicking one writes its path to `activeColorScheme`, which is the
 * whole of selecting it — everything downstream in TouchDesigner hangs off that
 * one parameter.
 *
 * The catalog arrives by `call` rather than as a readout, so it is fetched once
 * the connection syncs and re-fetched if it syncs again. Must render inside
 * `GuiProvider`.
 *
 * Which tab is open is local state. Its TD counterpart, `Activecolorgroup`, is
 * a bind-mode par that td-core would refuse to write, and there is no reason for
 * the web's tab and the panel's to agree anyway.
 */

import { createEffect, createSignal, For, Show, type JSX } from 'solid-js';
import { colorStopsGradient } from '@/ui/gradient';
import { GuiClient } from './clients';
import { openColorGroup, parseColorGroups, schemesInGroup, type ColorGroup } from './colorSchemes';
import styles from './ColorSelector.module.css';

export function ColorSelector(props: { class?: string }): JSX.Element {
  const connection = GuiClient.useConnection();
  const active = GuiClient.signal('activeColorScheme');
  const [groups, setGroups] = createSignal<ColorGroup[]>([]);
  const [pickedGroup, setPickedGroup] = createSignal<string>();
  const tabRefs = new Map<string, HTMLButtonElement>();

  createEffect(() => {
    if (connection.status() !== 'synced') return;
    void connection.call('colorSchemes').then(
      (value) => setGroups(parseColorGroups(value)),
      // Surfaced rather than thrown: the rest of the GUI works without a
      // catalog, and an old TD project simply has no `colorSchemes` handler.
      (error: unknown) => console.warn('[vj-gui] color schemes unavailable', error),
    );
  });

  const openGroup = () => openColorGroup(groups(), pickedGroup(), active.value());
  const openSchemes = () => schemesInGroup(groups(), openGroup());

  function onTabKeyDown(event: KeyboardEvent, name: string) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const names = groups().map((group) => group.name);
    const index = names.indexOf(name);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = names[(index + step + names.length) % names.length];
    if (next === undefined) return;
    setPickedGroup(next);
    tabRefs.get(next)?.focus();
  }

  return (
    <section class={[styles.schemes, props.class].filter(Boolean).join(' ')}>
      <div role="tablist" aria-label="Color groups" class={styles.tabs}>
        <For each={groups()}>
          {(group) => (
            <button
              ref={(el) => tabRefs.set(group.name, el)}
              type="button"
              role="tab"
              id={`color-group-${group.name}`}
              aria-selected={openGroup() === group.name}
              aria-controls="color-schemes"
              tabIndex={openGroup() === group.name ? 0 : -1}
              onClick={() => setPickedGroup(group.name)}
              onKeyDown={(event) => onTabKeyDown(event, group.name)}
              class={`${styles.tab} ${openGroup() === group.name ? styles.tabSelected : ''}`}
            >
              {group.name}
            </button>
          )}
        </For>
      </div>

      <div
        id="color-schemes"
        role="tabpanel"
        aria-labelledby={`color-group-${openGroup() ?? ''}`}
        class={styles.grid}
      >
        <For each={openSchemes()}>
          {(scheme) => (
            <button
              type="button"
              aria-pressed={active.value() === scheme.path}
              disabled={active.readonly()}
              onClick={() => active.setValue(scheme.path)}
              class={`${styles.scheme} ${active.value() === scheme.path ? styles.schemeActive : ''}`}
            >
              <span
                class={styles.swatch}
                style={{ 'background-image': colorStopsGradient(scheme.stops) }}
              />
              <span class={styles.name}>{scheme.name}</span>
            </button>
          )}
        </For>
        <Show when={groups().length === 0}>
          <p class={styles.empty}>No color schemes.</p>
        </Show>
      </div>
    </section>
  );
}
