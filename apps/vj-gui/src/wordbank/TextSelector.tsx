import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import { MIN_TEXT_FIELDS } from '@domain/wordbank/wordbank';
import { RECENT_LIST_ID } from './store';
import { useWordbank } from './WordbankProvider';
import { TextField } from './TextField';
import { TextFieldEditor } from './TextFieldEditor';
import { RecentPanel } from './RecentPanel';
import { TabStrip } from './TabStrip';
import { ListPanel } from './ListPanel';
import styles from './TextSelector.module.css';

export function TextSelector(): JSX.Element {
  const store = useWordbank();
  const { selectedLayer } = usePlayback();

  const [editing, setEditing] = createSignal(false);
  // Typing in a text field filters the phrase lists below it, and a clicked
  // phrase lands in the field that is focused — the first one if none is.
  const [filter, setFilter] = createSignal('');
  // A field id rather than a position, so it survives a layer change.
  const [focusedFieldId, setFocusedFieldId] = createSignal<string | null>(null);
  // Clicking a chip blurs the field before the click lands, so the target is
  // read at mousedown — while that field still has focus — and used by the
  // click that follows.
  let pressedFieldId: string | null = null;

  // The one place that owns "commit a phrase to a Text field" — shared by
  // RecentPanel and ListPanel's click-to-apply.
  function applyToFocused(phrase: string) {
    const id = focusedFieldId() ?? pressedFieldId ?? store.state.fields[0]?.id;
    pressedFieldId = null;
    if (!id || store.state.fields.every((f) => f.id !== id)) return;
    store.setOverride(selectedLayer(), id, phrase);
    store.commitRecent(phrase);
    setFilter('');
  }

  function endEdit() {
    setFocusedFieldId(null);
    setFilter('');
  }

  const selectedList = createMemo(
    () =>
      store.state.lists.find((l) => l.id === store.state.selectedListId) ?? store.state.lists[0],
  );

  return (
    <div class={styles.selector}>
      <PanelHeader title="Text">
        <Show when={editing()}>
          <PanelHeaderButton label="Add field" onClick={() => store.addField()}>
            +
          </PanelHeaderButton>
        </Show>
        <PanelHeaderButton
          label={editing() ? 'Done' : 'Edit'}
          pressed={editing()}
          onClick={() => setEditing((on) => !on)}
        >
          ✎
        </PanelHeaderButton>
      </PanelHeader>

      <section class={styles.fields}>
        <Show
          when={editing()}
          fallback={
            <For each={store.state.fields}>
              {(field, index) => (
                <TextField
                  field={field}
                  position={index() + 1}
                  layer={selectedLayer()}
                  onFilter={setFilter}
                  onFocus={() => setFocusedFieldId(field.id)}
                  onBlur={endEdit}
                />
              )}
            </For>
          }
        >
          <For each={store.state.fields}>
            {(field, index) => (
              <TextFieldEditor
                field={field}
                position={index() + 1}
                deletable={store.state.fields.length > MIN_TEXT_FIELDS}
                onSetDefault={(value) => store.setFieldDefault(field.id, value)}
                onDelete={() => store.deleteField(field.id)}
              />
            )}
          </For>
        </Show>
      </section>

      <section class={styles.lists}>
        <TabStrip />
        <div class={styles.body} onMouseDown={() => (pressedFieldId = focusedFieldId())}>
          <Show
            when={store.state.selectedListId !== RECENT_LIST_ID}
            fallback={<RecentPanel filter={filter()} onApply={applyToFocused} />}
          >
            <Show when={selectedList()}>
              {(list) => <ListPanel list={list()} filter={filter()} onApply={applyToFocused} />}
            </Show>
          </Show>
        </div>
      </section>
    </div>
  );
}
