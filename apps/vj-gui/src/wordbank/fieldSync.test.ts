import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, createSignal, type Accessor } from 'solid-js';
import { escapeNewlines } from 'td-core';
import { layerIds, type LayerId } from '@/playback/layers';
import { WIRED_FIELDS } from '@domain/wordbank/wordbank';
import { createWordbankStore, type WordbankStore } from './store';
import type { TextFieldBinding } from './fieldBinding';
import { createFieldSync, type FieldSync } from './fieldSync';

/** A binding that starts unsynced, exactly as a wired one does before TD answers. */
function fakeBinding(initial = ''): TextFieldBinding & { sync: (wire: string) => void } {
  const [value, setValue] = createSignal(initial);
  const [synced, setSynced] = createSignal(false);
  return {
    value,
    synced,
    setValue,
    sync: (wire) => {
      setValue(wire);
      setSynced(true);
    },
    beginEdit: () => {},
    endEdit: () => {},
    readonly: () => false,
  };
}

let disposers: (() => void)[] = [];

interface Harness {
  store: WordbankStore;
  sync: FieldSync;
  /** The binding at `layer`/field position `index`, created on first ask. */
  binding: (layer: LayerId, index: number) => ReturnType<typeof fakeBinding>;
}

function harness(): Harness {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const store = createWordbankStore();
    disposers.push(store.dispose);

    // Keyed by position, not field id: that is what a wired position is, and it is
    // what makes a delete shift the occupants.
    const bindings = new Map<string, ReturnType<typeof fakeBinding>>();
    const at = (layer: LayerId, index: number) => {
      const key = `${layer}:${index}`;
      let binding = bindings.get(key);
      if (!binding) {
        binding = fakeBinding();
        bindings.set(key, binding);
      }
      return binding;
    };

    const sync = createFieldSync(store, (layer, index) => at(layer, index));
    return {
      store,
      sync,
      binding: at,
    };
  });
}

/** Every Layer's wire value at one field position. */
function positionValues(h: Harness, index: number): string[] {
  return layerIds.map((layer) => h.binding(layer, index).value());
}

beforeEach(() => {
  disposers = [];
});

afterEach(() => {
  for (const dispose of disposers) dispose();
});

describe('following a Default', () => {
  it('leaves an unsynced param alone, so a Default never lands on top of a stored override', () => {
    const h = harness();
    // Touch the bindings first so the effect has something to write to.
    for (const layer of layerIds) h.binding(layer, 0);
    h.sync.setFieldDefault(h.store.state.fields[0]!.id, 'SOME ARTIST');
    expect(positionValues(h, 0)).toEqual(layerIds.map(() => ''));
  });

  it('fills every Layer TD reports as empty once it has synced', () => {
    const h = harness();
    for (const layer of layerIds) h.binding(layer, 0).sync('');
    h.sync.setFieldDefault(h.store.state.fields[0]!.id, 'SOME ARTIST');
    expect(positionValues(h, 0)).toEqual(layerIds.map(() => 'SOME ARTIST'));
  });

  it('carries a Layer still showing the old Default, and leaves a typed override', () => {
    const h = harness();
    for (const layer of layerIds) h.binding(layer, 0).sync('');
    const id = h.store.state.fields[0]!.id;
    h.sync.setFieldDefault(id, 'SOME ARTIST');

    h.binding(layerIds[3]!, 0).sync('GUEST SET');
    h.sync.setFieldDefault(id, 'RESIDENT');

    expect(h.binding(layerIds[0]!, 0).value()).toBe('RESIDENT');
    expect(h.binding(layerIds[3]!, 0).value()).toBe('GUEST SET');
  });

  it('compares across the wire escaping, so a multi-line Default carries too', () => {
    const h = harness();
    for (const layer of layerIds) h.binding(layer, 0).sync('');
    const id = h.store.state.fields[0]!.id;
    h.sync.setFieldDefault(id, 'SOME ARTIST\n& CREW');
    expect(h.binding(layerIds[0]!, 0).value()).toBe(escapeNewlines('SOME ARTIST\n& CREW'));

    h.sync.setFieldDefault(id, 'RESIDENT');
    expect(h.binding(layerIds[0]!, 0).value()).toBe('RESIDENT');
  });

  it('an empty Default claims nothing — a param TD reports as empty stays empty', () => {
    const h = harness();
    for (const layer of layerIds) h.binding(layer, 0).sync('');
    h.sync.setFieldDefault(h.store.state.fields[0]!.id, '');
    expect(positionValues(h, 0)).toEqual(layerIds.map(() => ''));
  });

  it('fills a param that only goes empty later — a Layer cleared in TD gets the Default back', () => {
    const h = harness();
    for (const layer of layerIds) h.binding(layer, 0).sync('GUEST SET');
    h.sync.setFieldDefault(h.store.state.fields[0]!.id, 'SOME ARTIST');
    expect(h.binding(layerIds[0]!, 0).value()).toBe('GUEST SET');

    h.binding(layerIds[0]!, 0).sync('');
    expect(h.binding(layerIds[0]!, 0).value()).toBe('SOME ARTIST');
  });

  it('ignores an unknown field id', () => {
    const h = harness();
    for (const layer of layerIds) h.binding(layer, 0).sync('');
    h.sync.setFieldDefault('nope', 'SOME ARTIST');
    expect(positionValues(h, 0)).toEqual(layerIds.map(() => ''));
  });
});

describe('deleting a field', () => {
  it('hands each shifted wired position to its new occupant', () => {
    const h = harness();
    const third = h.store.addField();
    const [a, b] = [h.store.state.fields[0]!.id, h.store.state.fields[1]!.id];
    for (const index of [0, 1]) for (const layer of layerIds) h.binding(layer, index).sync('');
    h.sync.setFieldDefault(a, 'FIRST');
    h.sync.setFieldDefault(b, 'SECOND');
    h.sync.setFieldDefault(third, 'THIRD');

    // Someone's typed text in position 1 belongs to field `b`, not to `third`.
    h.binding(layerIds[0]!, 1).sync('GUEST SET');

    h.sync.deleteField(b);

    expect(positionValues(h, 0)).toEqual(layerIds.map(() => 'FIRST'));
    expect(positionValues(h, 1)).toEqual(layerIds.map(() => 'THIRD'));
  });

  it('touches nothing when the store refuses to go below the wired pair', () => {
    const h = harness();
    const id = h.store.state.fields[0]!.id;
    for (const layer of layerIds) h.binding(layer, 0).sync('GUEST SET');

    h.sync.deleteField(id);

    expect(h.store.state.fields).toHaveLength(WIRED_FIELDS);
    expect(positionValues(h, 0)).toEqual(layerIds.map(() => 'GUEST SET'));
  });

  it('ignores an unknown field id', () => {
    const h = harness();
    h.store.addField();
    for (const layer of layerIds) h.binding(layer, 0).sync('GUEST SET');

    h.sync.deleteField('nope');

    expect(h.store.state.fields).toHaveLength(3);
    expect(positionValues(h, 0)).toEqual(layerIds.map(() => 'GUEST SET'));
  });

  it('leaves an unsynced param alone, so a shift never lands on top of a stored override', () => {
    const h = harness();
    h.store.addField();
    const [b, third] = [h.store.state.fields[1]!.id, h.store.state.fields[2]!.id];
    // Every position-1 param has answered except this one Layer's, whose stored
    // override is still in flight.
    const pending = h.binding(layerIds[0]!, 1);
    for (const layer of layerIds) h.binding(layer, 0).sync('');
    for (const layer of layerIds.slice(1)) h.binding(layer, 1).sync('');
    h.sync.setFieldDefault(b, 'SECOND');
    h.sync.setFieldDefault(third, 'THIRD');

    h.sync.deleteField(b);

    expect(pending.value()).toBe('');
    expect(h.binding(layerIds[1]!, 1).value()).toBe('THIRD');
  });

  it('clears a position whose new occupant has no Default', () => {
    const h = harness();
    h.store.addField();
    const b = h.store.state.fields[1]!.id;
    for (const index of [0, 1]) for (const layer of layerIds) h.binding(layer, index).sync('');
    h.sync.setFieldDefault(b, 'SECOND');
    expect(h.binding(layerIds[0]!, 1).value()).toBe('SECOND');

    h.sync.deleteField(b);
    expect(positionValues(h, 1)).toEqual(layerIds.map(() => ''));
  });
});
