import type { UnleashClient } from 'unleash-proxy-client'
import {
  ref,
  inject,
  onUnmounted,
  watch,
  toValue,
  type Ref,
  type MaybeRefOrGetter
} from 'vue'
import { ContextStateSymbol } from './context'

type TFlagContext = Partial<{
  isEnabled: Ref<(name: string) => boolean | undefined>
  client: Ref<UnleashClient>
}>

const useFlag = (name: MaybeRefOrGetter<string>) => {
  const { isEnabled, client } = inject<TFlagContext>(ContextStateSymbol, {})
  const flag = ref(Boolean(isEnabled?.value(toValue(name))))

  function onUpdate() {
    const enabled = isEnabled?.value(toValue(name))
    if (enabled !== flag.value) {
      flag.value = !!enabled
    }
  }

  function onReady() {
    flag.value = Boolean(isEnabled?.value(toValue(name)))
  }

  client?.value.on('ready', onReady)
  client?.value.on('update', onUpdate)
  watch(() => toValue(name), onUpdate)

  onUnmounted(() => {
    client?.value.off('ready', onReady)
    client?.value.off('update', onUpdate)
  })

  return flag
}

export default useFlag
