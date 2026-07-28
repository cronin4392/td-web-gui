import { Show, type JSX } from 'solid-js';

export function PickerToolbar(props: {
  refreshing: boolean;
  error?: string;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
        disabled={props.refreshing}
        onClick={() => props.onRefresh()}
      >
        {props.refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <Show when={props.error}>
        {(message) => <p class="truncate text-sm text-red-400">{message()}</p>}
      </Show>
    </div>
  );
}
