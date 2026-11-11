import { createEffect, createSignal, Show, untrack, type JSX } from 'solid-js';
import { createShowEditor, type ShowEditor } from './show-editor';
import { ShowInfoPanel } from './ShowInfoPanel';
import type { ShowInfoStore } from './store';
import styles from './ShowInfoDialog.module.css';

export function ShowInfoDialog(props: {
  store: ShowInfoStore;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  let dialog!: HTMLDialogElement;
  const [draft, setDraft] = createSignal<ShowEditor>();

  createEffect(() => {
    if (props.open && !dialog.open) {
      setDraft(untrack(() => createShowEditor(props.store.state.show)));
      dialog.showModal();
    } else if (!props.open && dialog.open) dialog.close();
  });

  function commit() {
    const editor = draft();
    setDraft(undefined);
    props.onClose();
    if (editor) props.store.setShow(editor.state);
  }

  return (
    <dialog
      ref={dialog}
      class={styles.dialog}
      aria-label="Show info"
      closedby="any"
      onClose={commit}
    >
      <Show when={draft()} keyed>
        {(editor) => (
          <ShowInfoPanel editor={editor} class={styles.panel} onClose={() => dialog.close()} />
        )}
      </Show>
    </dialog>
  );
}
