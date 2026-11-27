import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import * as esm from '@unleash/proxy-client-vue'

const require = createRequire(import.meta.url)
const cjs = require('@unleash/proxy-client-vue')

for (const sdk of [esm, cjs]) {
  const Consumer = Vue.defineComponent({
    setup() {
      const enabled = sdk.useFlag('checkout')
      const variant = sdk.useVariant('checkout')
      const client = sdk.useUnleashClient()
      const updateContext = sdk.useUnleashContext()
      const { flagsReady, flagsError } = sdk.useFlagsStatus()
      assert(client && updateContext && flagsReady && flagsError)
      return () => Vue.h('p', `${enabled.value}:${variant.value?.name}`)
    }
  })
  let fetches = 0
  const config = enabled => ({
    url: 'https://example.com/api/frontend',
    clientKey: 'test',
    appName: 'package-consumer',
    disableMetrics: true,
    disableRefresh: true,
    storageProvider: new sdk.InMemoryStorageProvider(),
    bootstrap: [
      {
        name: 'checkout',
        enabled,
        impressionData: false,
        variant: { name: enabled ? 'control' : 'disabled', enabled }
      }
    ],
    fetch: async () => {
      fetches++
      return new Response(JSON.stringify({ toggles: [] }))
    }
  })

  for (const enabled of [true, false, true]) {
    const app = Vue.createSSRApp({
      render: () =>
        Vue.h(
          sdk.FlagProvider,
          { config: config(enabled) },
          { default: () => Vue.h(Consumer) }
        )
    })
    const html = await renderToString(app)
    assert(
      html.includes(`${enabled}:${enabled ? 'control' : 'disabled'}`),
      html
    )
  }
  const app = Vue.createSSRApp(Consumer)
  const supplied = new sdk.UnleashClient(config(true))
  app.use(sdk.plugin, { unleashClient: supplied, startClient: false })
  assert((await renderToString(app)).includes('true:control'))
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(
    fetches,
    0,
    'SSR must not fetch for these component and deferred-plugin examples'
  )

  let headers
  const client = new sdk.UnleashClient({
    ...config(false),
    bootstrap: undefined,
    fetch: async (_url, options) => {
      headers = new Headers(options.headers)
      return new Response(JSON.stringify({ toggles: [] }))
    }
  })
  await client.start()
  client.stop()
  assert.equal(
    headers.get('unleash-sdk'),
    `unleash-js-sdk:${process.env.EXPECTED_CLIENT_VERSION}`
  )
}

const sandbox = { Vue }
const umd = await readFile(
  join(dirname(require.resolve('@unleash/proxy-client-vue')), 'index.umd.js'),
  'utf8'
)
runInNewContext(umd, sandbox)
assert.equal(typeof sandbox['proxy-client-vue'].UnleashClient, 'function')
assert(
  sandbox['proxy-client-vue'].FlagProvider && sandbox['proxy-client-vue'].plugin
)
console.log(
  'ESM, CommonJS, standalone UMD, SSR isolation, plugin, and bundled JS client version passed'
)
