import { Hello, version } from 'td-core'

export function App() {
  return (
    <main>
      <h1>td-web-gui · example</h1>
      <Hello name="example app" />
      <p>td-core version: {version}</p>
    </main>
  )
}
