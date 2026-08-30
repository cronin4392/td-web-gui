import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { escapeNewlines } from 'td-core';
import { layerTextParam } from '@/playback/wire';
import { layerIds, type LayerId } from '@/playback/layers';
import { GuiClient } from '@/playback/clients';
import { usePlayback } from '@/playback/PlaybackProvider';
import { PanelHeader, PanelHeaderButton } from '@/ui/PanelHeader';
import { WIRED_FIELDS } from '@domain/wordbank/wordbank';
import { RECENT_LIST_ID } from './store';
import { useWordbank } from './WordbankProvider';
import { createUnwiredFieldValues, tdFieldBinding, type TextFieldBinding } from './fieldBinding';
import { createFieldSync } from './fieldSync';
import { TextField } from './TextField';
import { TextFieldEditor } from './TextFieldEditor';
import { RecentPanel } from './RecentPanel';
import { TabStrip } from './TabStrip';
import { ListPanel } from './ListPanel';
import styles from './TextSelector.module.css';

export function TextSelector(): JSX.Element {
  const store = useWordbank();
  const { selectedLayer } = usePlayback();
  // Resolved here, at render time: the phrase-apply path below runs from event
  // handlers, where there is no reactive owner for the context lookup.
  const connection = GuiClient.useConnection();
  const unwired = createUnwiredFieldValues();

  // Every wired param is bound up front, not when its field renders: an
  // inbound `snapshot` drops names nothing has bound yet, and only the
  // selected Layer's fields are ever on screen.
  const wired = new Map(
    layerIds.map((layer) => [
      layer,
      Array.from({ length: WIRED_FIELDS }, (_, i) =>
        tdFieldBinding(connection.signal(layerTextParam(layer, (i + 1) as 1 | 2))),
      ),
    ]),
  );

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

  function bindingFor(layer: LayerId, index: number, fieldId: string): TextFieldBinding {
    return index < WIRED_FIELDS ? wired.get(layer)![index]! : unwired.binding(layer, fieldId);
  }

  const sync = createFieldSync(store, bindingFor);

  // The one place that owns "commit a phrase to a Text field" — shared by
  // TextField's own drop target and RecentPanel/ListPanel's click-to-apply.
  // This writes the binding directly, so it owes the same newline escaping the
  // textarea does on its own commits; stored phrases keep real newlines.
  function applyPhrase(binding: TextFieldBinding, phrase: string) {
    binding.setValue(escapeNewlines(phrase));
    store.commitRecent(phrase);
  }

  function applyToFocused(phrase: string) {
    const id = focusedFieldId() ?? pressedFieldId ?? store.state.fields[0]?.id;
    pressedFieldId = null;
    const index = store.state.fields.findIndex((f) => f.id === id);
    if (index === -1) return;
    applyPhrase(bindingFor(selectedLayer(), index, id!), phrase);
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
                  binding={bindingFor(selectedLayer(), index(), field.id)}
                  commitRecent={store.commitRecent}
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
                deletable={store.state.fields.length > WIRED_FIELDS}
                onSetDefault={(value) => sync.setFieldDefault(field.id, value)}
                onDelete={() => sync.deleteField(field.id)}
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
