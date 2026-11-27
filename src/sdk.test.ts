import { afterEach, expect, test, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { App, Component, MaybeRefOrGetter } from 'vue'
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
  vi.useRealTimers()
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

function observe(name: MaybeRefOrGetter<string> = 'checkout') {
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

function mountProvider(
  integration: 'component' | 'plugin',
  options: IProvideOptions,
  name: MaybeRefOrGetter<string> = 'checkout'
) {
  let state!: ReturnType<typeof observe>
  const Consumer = defineComponent({
    setup() {
      state = observe(name)
      return () => h('p', String(state.enabled.value))
    }
  })
  if (integration === 'component') {
    mount({
      render: () => h(FlagProvider, options, { default: () => h(Consumer) })
    })
  } else {
    mount(Consumer, options)
  }
  return state
}

for (const integration of ['component', 'plugin'] as const) {
  test(`${integration} preserves automatic startup for configured clients`, async () => {
    vi.useFakeTimers()
    const { config, requests } = configuration()
    const state = mountProvider(integration, { config, startClient: false })
    await vi.advanceTimersByTimeAsync(0)

    expect(requests).toHaveLength(1)
    expect(state.enabled.value).toBe(true)
    expect(state.flagsReady?.value).toBe(true)
  })

  test(`${integration} status stops following a client after unmount`, () => {
    const { config } = configuration()
    const client = new UnleashClient(config)
    clients.add(client)
    const state = mountProvider(integration, {
      unleashClient: client,
      startClient: false
    })
    const error = new Error('Offline')
    client.emit('error', error)
    apps.pop()!.unmount()

    client.emit('recovered')
    client.emit('ready')
    client.emit('error', new Error('Still offline'))

    expect(state.flagsError?.value).toBe(error)
    expect(state.flagsReady?.value).toBe(false)
  })

  for (const [supplied, stopClient, shouldStop] of [
    [false, undefined, false],
    [false, true, true],
    [true, undefined, false],
    [true, true, true]
  ] as const) {
    test(`${integration} ${supplied ? 'supplied' : 'configured'} clients ${shouldStop ? 'stop polling on unmount when opted in' : 'keep polling after unmount by default'}`, async () => {
      vi.useFakeTimers()
      const { config, requests } = configuration()
      config.disableRefresh = false
      config.refreshInterval = 1
      const client = supplied ? new UnleashClient(config) : undefined
      if (client) clients.add(client)
      mountProvider(integration, { config, unleashClient: client, stopClient })
      await vi.advanceTimersByTimeAsync(0)
      expect(requests).toHaveLength(1)

      apps.pop()!.unmount()
      await vi.advanceTimersByTimeAsync(2000)

      expect(requests).toHaveLength(shouldStop ? 1 : 3)
    })
  }
}

test('recognizes a supplied ready client without restarting it', async () => {
  vi.useFakeTimers()
  const { config, requests } = configuration()
  const client = new UnleashClient(config)
  clients.add(client)
  await client.start()

  const state = mountProvider('component', {
    unleashClient: client,
    startClient: false
  })
  await vi.advanceTimersByTimeAsync(0)

  expect(state.flagsReady?.value).toBe(true)
  expect(requests).toHaveLength(1)
})

test('empty bootstrap data does not imply readiness', () => {
  const { config } = configuration()
  config.bootstrap = []

  const state = mountProvider('component', { config, startClient: false })

  expect(state.flagsReady?.value).toBe(false)
})

test('config bootstrap cannot make a supplied client ready', () => {
  const { config } = configuration()
  const client = new UnleashClient(config)
  clients.add(client)
  config.bootstrap = [{
    name: 'checkout',
    enabled: true,
    variant: { name: 'control', enabled: true },
    impressionData: false
  }]

  const state = mountProvider('component', {
    config,
    unleashClient: client,
    startClient: false
  })

  expect(state.flagsReady?.value).toBe(false)
  expect(state.enabled.value).toBe(false)
})

for (const bootstrapOverride of [true, false]) {
  test(`bootstrap readiness respects bootstrapOverride=${bootstrapOverride}`, () => {
    const { config } = configuration()
    config.bootstrap = [{
      name: 'checkout',
      enabled: true,
      variant: { name: 'control', enabled: true },
      impressionData: false
    }]
    config.bootstrapOverride = bootstrapOverride

    const state = mountProvider('component', { config, startClient: false })

    expect(state.enabled.value).toBe(true)
    expect(state.flagsReady?.value).toBe(bootstrapOverride)
  })
}

test('recognizes existing errors and follows recovery', async () => {
  const { config } = configuration()
  const error = new Error('Offline')
  const fetch = config.fetch
  let online = false
  config.fetch = async (input: Parameters<typeof fetch>[0]) => {
    if (!online) throw error
    return fetch(input)
  }
  const client = new UnleashClient(config)
  clients.add(client)
  await client.start()

  const state = mountProvider('component', {
    unleashClient: client,
    startClient: false
  })
  expect(state.flagsError?.value).toBe(error)

  await client.start()
  expect(state.flagsError?.value).toMatchObject({ type: 'fetch-toggles', error })

  online = true
  await client.start()
  expect(state.flagsError?.value).toBe(null)
  expect(state.flagsReady?.value).toBe(true)
  expect(state.enabled.value).toBe(true)
})

test('stopClient also stops polling when removed during startup', async () => {
  vi.useFakeTimers()
  const { config, requests } = configuration()
  config.disableRefresh = false
  config.refreshInterval = 1
  let release!: () => void
  const storageReady = new Promise<void>(resolve => {
    release = resolve
  })
  config.storageProvider = {
    get: async () => {
      await storageReady
      return undefined
    },
    save: async () => {}
  }
  mountProvider('component', { config, stopClient: true })

  apps.pop()!.unmount()
  release()
  await vi.advanceTimersByTimeAsync(0)
  const initialRequests = requests.length
  await vi.advanceTimersByTimeAsync(3000)

  expect(requests).toHaveLength(initialRequests)
})

for (const input of ['ref', 'computed', 'getter']) {
  test(`follows ${input} flag names and cleans up on unmount`, async () => {
    const { config } = configuration()
    const name = ref('checkout')
    const flagName = input === 'ref'
      ? name
      : input === 'computed'
        ? computed(() => name.value)
        : () => name.value
    const state = mountProvider('component', { config }, flagName)
    await vi.waitFor(() => expect(state.flagsReady?.value).toBe(true))
    expect([state.enabled.value, state.variant.value?.name]).toEqual([true, 'express'])

    name.value = 'missing'
    await nextTick()
    expect([state.enabled.value, state.variant.value?.name]).toEqual([false, 'disabled'])

    await state.updateContext!({ userId: 'bob' })
    name.value = 'checkout'
    await nextTick()
    expect([state.enabled.value, state.variant.value?.name]).toEqual([false, 'disabled'])

    await state.updateContext!({ userId: 'alice' })
    expect([state.enabled.value, state.variant.value?.name]).toEqual([true, 'express'])

    apps.pop()!.unmount()
    name.value = 'missing'
    await nextTick()
    expect([state.enabled.value, state.variant.value?.name]).toEqual([true, 'express'])
  })
}
