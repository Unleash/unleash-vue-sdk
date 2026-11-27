import { afterEach, expect, test, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { App, Component } from 'vue'
import {
  FlagProvider,
  InMemoryStorageProvider,
  UnleashClient,
  plugin,
  useFlag,
  useFlagsStatus,
  useUnleashClient,
  useUnleashContext,
  useVariant
} from './index'
import type { IConfig } from './index'
import type { IProvideOptions } from './useUnleashProvide'

const apps: App[] = []
const clients = new Set<UnleashClient>()

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  for (const client of clients) client.stop()
  clients.clear()
  document.body.replaceChildren()
})

function configuration() {
  const requests: string[] = []
  const config: IConfig = {
    url: 'https://example.com/api/frontend',
    clientKey: 'test',
    appName: 'vue-sdk-test',
    context: { userId: 'alice' },
    disableMetrics: true,
    disableRefresh: true,
    storageProvider: new InMemoryStorageProvider(),
    fetch: async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      requests.push(url.href)
      const enabled = url.searchParams.get('userId') === 'alice'
      return new Response(
        JSON.stringify({
          toggles: [
            {
              name: 'checkout',
              enabled,
              impressionData: false,
              variant: { name: enabled ? 'express' : 'disabled', enabled }
            }
          ]
        })
      )
    }
  }
  return { config, requests }
}

function observe(name = 'checkout') {
  const enabled = useFlag(name)
  const variant = useVariant(name)
  const status = useFlagsStatus()
  const updateContext = useUnleashContext()
  const client = useUnleashClient()
  clients.add(client)
  return { enabled, variant, ...status, updateContext, client }
}

function mount(root: Component, options?: IProvideOptions) {
  const target = document.createElement('div')
  document.body.append(target)
  const app = createApp(root)
  apps.push(app)
  if (options) app.use(plugin, options)
  app.mount(target)
  return target
}

for (const integration of ['component', 'plugin']) {
  test(`${integration} consumers follow flag and variant context changes`, async () => {
    const { config } = configuration()
    let state!: ReturnType<typeof observe>
    const Consumer = defineComponent({
      setup() {
        state = observe()
        return () =>
          h('p', `${state.enabled.value}:${state.variant.value?.name}`)
      }
    })

    const target =
      integration === 'component'
        ? mount({
            render: () =>
              h(FlagProvider, { config }, { default: () => h(Consumer) })
          })
        : mount(Consumer, { config })

    await vi.waitFor(() => expect(target.textContent).toBe('true:express'))
    expect(state.flagsReady?.value).toBe(true)

    await state.updateContext!({ userId: 'bob' })
    await nextTick()

    expect(target.textContent).toBe('false:disabled')
  })
}

test('supplied clients can wait for manual startup', async () => {
  const { config, requests } = configuration()
  const client = new UnleashClient(config)
  clients.add(client)
  let state!: ReturnType<typeof observe>
  const Consumer = defineComponent({
    setup() {
      state = observe()
      return () => h('p', String(state.enabled.value))
    }
  })

  const target = mount({
    render: () =>
      h(
        FlagProvider,
        { unleashClient: client, startClient: false },
        { default: () => h(Consumer) }
      )
  })
  await nextTick()

  expect(requests).toEqual([])
  expect(target.textContent).toBe('false')

  await client.start()
  await nextTick()

  expect(target.textContent).toBe('true')
  expect(state.flagsReady?.value).toBe(true)
})

test('missing flags use the disabled fallback', async () => {
  const { config } = configuration()
  let state!: ReturnType<typeof observe>
  const Consumer = defineComponent({
    setup() {
      state = observe('missing')
      return () => h('p', `${state.enabled.value}:${state.variant.value?.name}`)
    }
  })

  const target = mount({
    render: () => h(FlagProvider, { config }, { default: () => h(Consumer) })
  })
  await vi.waitFor(() => expect(state.flagsReady?.value).toBe(true))

  expect(target.textContent).toBe('false:disabled')
})

test('removed consumers stop following client updates', async () => {
  const { config } = configuration()
  const visible = ref(true)
  const observations: ReturnType<typeof observe>[] = []
  const Consumer = defineComponent({
    setup() {
      const state = observe()
      observations.push(state)
      return () => h('p', `${state.enabled.value}:${state.variant.value?.name}`)
    }
  })
  const target = mount({
    render: () =>
      h(
        FlagProvider,
        { config },
        { default: () => (visible.value ? h(Consumer) : null) }
      )
  })
  await vi.waitFor(() => expect(target.textContent).toBe('true:express'))

  visible.value = false
  await nextTick()
  await observations[0].updateContext!({ userId: 'bob' })

  expect(observations[0].enabled.value).toBe(true)
  expect(observations[0].variant.value?.name).toBe('express')

  visible.value = true
  await nextTick()

  expect(target.textContent).toBe('false:disabled')
})
