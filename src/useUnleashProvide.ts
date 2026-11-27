import { ref, reactive, toRefs } from 'vue'
import {
  UnleashClient,
  type IConfig,
  type IMutableContext
} from 'unleash-proxy-client'

type eventArgs = [Function, any]

export interface IProvideOptions {
  config?: IConfig
  unleashClient?: UnleashClient
  startClient?: boolean
  stopClient?: boolean
}

function useUnleashProvide({
  config,
  unleashClient,
  startClient = true,
  stopClient = false
}: IProvideOptions) {
  const client = ref(
    unleashClient ?? (config ? new UnleashClient(config) : undefined)
  )
  const flagsReady = ref(
    Boolean(
      client.value?.isReady() ||
      (!unleashClient &&
        config?.bootstrap?.length &&
        config.bootstrapOverride !== false)
    )
  )
  const flagsError = ref<unknown>(client.value?.getError() ?? null)

  if (!config && !unleashClient) {
    console.warn(
      'You must provide either a config or an Unleash client to the flag provider.'
    )
  }

  const onReady = () => {
    flagsReady.value = true
  }
  const onError = (error: unknown) => {
    flagsError.value = error
  }
  const onRecovered = () => {
    flagsError.value = null
  }

  client.value?.on('ready', onReady)
  client.value?.on('error', onError)
  client.value?.on('recovered', onRecovered)

  const updateContext = async (context: IMutableContext): Promise<void> => {
    await client.value?.updateContext(context)
  }

  const isEnabled = (name: string) => client.value?.isEnabled(name)
  const getVariant = (name: string) => client.value?.getVariant(name)
  const on = (event: string, ...args: eventArgs) =>
    client.value?.on(event, ...args)

  const context = reactive({
    on,
    updateContext,
    isEnabled,
    getVariant,
    client,
    flagsReady,
    flagsError
  })

  const update = (property: string, value: any) => {
    context[property] = value
  }

  const start = () => {
    if (startClient || !unleashClient) {
      void client.value?.start()
    }
  }

  const dispose = () => {
    client.value?.off('ready', onReady)
    client.value?.off('error', onError)
    client.value?.off('recovered', onRecovered)
    if (stopClient) client.value?.stop()
  }

  return {
    context: toRefs(context),
    update,
    start,
    dispose
  }
}

export default useUnleashProvide
