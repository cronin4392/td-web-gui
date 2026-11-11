export interface DebouncedSaver {
  schedule: () => void;
  flush: () => void;
  dispose: () => void;
}

export function createDebouncedSaver(options: {
  save: () => void | Promise<void>;
  debounceMs: number;
  label: string;
}): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warnedFailure = false;

  async function run() {
    try {
      await options.save();
    } catch (err) {
      if (!warnedFailure) {
        warnedFailure = true;
        console.warn(`[vj-gui] failed to persist ${options.label}; continuing in-memory`, err);
      }
    }
  }

  function cancel(): boolean {
    if (timer === undefined) return false;
    clearTimeout(timer);
    timer = undefined;
    return true;
  }

  return {
    schedule() {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        void run();
      }, options.debounceMs);
    },
    flush() {
      if (cancel()) void run();
    },
    dispose() {
      cancel();
    },
  };
}
