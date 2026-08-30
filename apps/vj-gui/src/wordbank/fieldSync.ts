import { createEffect, mapArray } from 'solid-js';
import { WIRED_FIELDS } from '@domain/wordbank/wordbank';
import { layerIds, type LayerId } from '@/playback/layers';
import type { TextFieldBinding } from './fieldBinding';
import { wireDefault } from './textOverride';
import type { WordbankStore } from './store';

export type BindingFor = (layer: LayerId, index: number, fieldId: string) => TextFieldBinding;

export interface FieldSync {
  deleteField: (id: string) => void;
  setFieldDefault: (id: string, defaultValue: string) => void;
}

export function createFieldSync(store: WordbankStore, bindingFor: BindingFor): FieldSync {
  function bindingsForPosition(index: number, fieldId: string): TextFieldBinding[] {
    return layerIds.map((layer) => bindingFor(layer, index, fieldId));
  }

  // One effect per Layer per field rather than a single sweep: a text echo on one Layer must not re-run the comparison for the other eleven.
  createEffect(
    mapArray(
      () => store.state.fields,
      (field, index) => {
        for (const layer of layerIds) {
          createEffect(() => {
            const target = wireDefault(field.defaultValue);
            if (!target) return;
            const binding = bindingFor(layer, index(), field.id);
            if (binding.synced() && binding.value() === '') binding.setValue(target);
          });
        }
      },
    ),
  );

  function resetPosition(index: number) {
    const field = store.state.fields[index];
    const target = wireDefault(field?.defaultValue ?? '');
    for (const binding of bindingsForPosition(index, field?.id ?? '')) {
      // Writing over a param whose stored override has not arrived would send this Default to TD in its place.
      if (binding.synced()) binding.setValue(target);
    }
  }

  function deleteField(id: string) {
    const index = store.state.fields.findIndex((f) => f.id === id);
    // The store refuses to go below what the wire carries; repairing positions it never shifted would wipe twelve Layers of typed text.
    if (index === -1 || !store.deleteField(id)) return;
    for (let pos = index; pos < WIRED_FIELDS; pos++) resetPosition(pos);
  }

  function setFieldDefault(id: string, defaultValue: string) {
    const index = store.state.fields.findIndex((f) => f.id === id);
    if (index === -1) return;
    const previous = wireDefault(store.state.fields[index]!.defaultValue);
    const target = wireDefault(defaultValue);
    if (target === previous) return;
    store.setFieldDefault(id, defaultValue);
    for (const binding of bindingsForPosition(index, id)) {
      if (binding.synced() && binding.value() === previous) binding.setValue(target);
    }
  }

  return { deleteField, setFieldDefault };
}
