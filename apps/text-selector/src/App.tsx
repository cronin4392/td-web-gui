import { createTDClient } from 'td-core'
import { instances, type TextSelectorParams } from './td.config'

// One factory per TD instance, typed by that instance's param schema.
const TDClient = createTDClient<TextSelectorParams>()

const textSelector = instances[0]

export function App() {
  return (
    <main class="mx-auto max-w-md p-6">
      <h1 class="text-xl font-semibold">td-web-gui · text selector</h1>
      <p class="mt-1 text-sm text-gray-500">
        Bound to instance <code>{textSelector.id}</code> at <code>{textSelector.url}</code>
      </p>

      <TDClient.Provider url={textSelector.url} instance={textSelector.id}>
        <section class="mt-4 flex flex-col gap-3">
          <label class="flex flex-col gap-1 text-sm font-medium">
            Text 1
            <TDClient.TextInput name="text1" placeholder="Text 1" class='border px-2 py-1 rounded' />
          </label>
          <label class="flex flex-col gap-1 text-sm font-medium">
            Text 2
            <TDClient.TextInput name="text2" placeholder="Text 2" class='border px-2 py-1 rounded' />
          </label>
        </section>
      </TDClient.Provider>
    </main>
  )
}
