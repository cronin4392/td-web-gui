import { createTDClient } from 'td-core'
import { instances, type ExampleParams } from './td.config'

// One factory per TD instance, typed by that instance's param schema.
const Example = createTDClient<ExampleParams>()

const example = instances[0]

export function App() {
  return (
    <main>
      <h1>td-web-gui · example</h1>
      <p>
        Bound to instance <code>{example.id}</code> at <code>{example.url}</code>
      </p>

      <Example.Provider url={example.url} instance={example.id}>
        <section>
          <label>
            Message
            <Example.TextInput name="message" placeholder="Type a message…" />
          </label>
        </section>

        <section>
          <label>
            Intensity
            <Example.NumberInput name="intensity" min={0} max={1} step={0.01} />
          </label>
          <Example.RangeInput name="intensity" min={0} max={1} step={0.01} />
          <p>
            Current: <Example.Value name="intensity" format={(v) => Number(v).toFixed(2)} />
          </p>
        </section>
      </Example.Provider>
    </main>
  )
}
