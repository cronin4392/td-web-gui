import { createTDClient } from 'td-core'
import { instances, type TextSelectorParams } from './td.config'

// One factory per TD instance, typed by that instance's param schema.
const TDClient = createTDClient<TextSelectorParams>()

const textSelector = instances[0]

export function App() {
  return (
    <main>
      <h1>td-web-gui · text selector</h1>
      <p>
        Bound to instance <code>{textSelector.id}</code> at <code>{textSelector.url}</code>
      </p>

      <TDClient.Provider url={textSelector.url} instance={textSelector.id}>
        <section>
          <label>
            Text 1
            <TDClient.TextInput name="text1" placeholder="Text 1" />
          </label>
          <label>
            Text 2
            <TDClient.TextInput name="text2" placeholder="Text 2" />
          </label>
        </section>
      </TDClient.Provider>
    </main>
  )
}
