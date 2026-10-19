import { createEffect, type JSX } from 'solid-js';
import { ShowInfoPanel } from './ShowInfoPanel';
import type { ShowInfoStore } from './store';
import styles from './ShowInfoDialog.module.css';

export function ShowInfoDialog(props: {
  store: ShowInfoStore;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  let dialog!: HTMLDialogElement;

  createEffect(() => {
    if (props.open && !dialog.open) dialog.showModal();
    else if (!props.open && dialog.open) dialog.close();
  });

  return (
    <dialog
      ref={dialog}
      class={styles.dialog}
      aria-label="Show info"
      closedby="any"
      onClose={() => props.onClose()}
    >
      <ShowInfoPanel store={props.store} class={styles.panel} onClose={() => dialog.close()} />
    </dialog>
  );
}
