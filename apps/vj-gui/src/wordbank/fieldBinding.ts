import { createStore } from 'solid-js/store';
import { type Accessor } from 'solid-js';
import type { TDBinding } from 'td-core';
import type { LayerId } from '@/playback/layers';
import type { WordbankStore } from './store';

export interface TextFieldBinding {
  value: Accessor<string>;
  // Distinct from an empty value: a Default written over a not-yet-synced param would reach TD in place of the override it holds.
  synced: Accessor<boolean>;
  setValue: (wire: string) => void;
  beginEdit: () => void;
  endEdit: () => void;
  readonly: Accessor<boolean>;
}

export function tdFieldBinding(binding: TDBinding<string>): TextFieldBinding {
  return {
    value: () => binding.value() ?? '',
    synced: () => binding.value() !== undefined,
    setValue: binding.setValue,
    beginEdit: binding.beginEdit,
    endEdit: binding.endEdit,
    readonly: binding.readonly,
  };
}

// Values for the Text fields the wire can't carry yet; page-lifetime only.
export function createUnwiredFieldValues(): {
  binding: (layer: LayerId, fieldId: string) => TextFieldBinding;
} {
  // A store rather than a signal over a record: one field's write must not invalidate every other field's readers.
  const [values, setValues] = createStore<Record<string, string>>({});
  const never = () => false;
  const always = () => true;
  const noop = () => {};

  return {
    binding(layer, fieldId) {
      const key = `${layer}:${fieldId}`;
      return {
        value: () => values[key] ?? '',
        synced: always,
        setValue: (wire) => setValues(key, wire),
        beginEdit: noop,
        endEdit: noop,
        readonly: never,
      };
    },
  };
}

export function wiredFieldDefault(store: WordbankStore, position: 1 | 2): Accessor<string> {
  return () => store.state.fields[position - 1]?.defaultValue ?? '';
}
