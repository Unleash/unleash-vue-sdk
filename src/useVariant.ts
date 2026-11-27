import type { IVariant, UnleashClient } from 'unleash-proxy-client'
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

type TVariantContext = Partial<{
  getVariant: Ref<(name: string) => IVariant | undefined>
  client: Ref<UnleashClient>
}>

const variantHasChanged = (
  oldVariant?: IVariant,
  newVariant?: IVariant
): boolean => {
  const variantsAreEqual =
    oldVariant?.name === newVariant?.name &&
    oldVariant?.enabled === newVariant?.enabled &&
    oldVariant?.feature_enabled === newVariant?.feature_enabled &&
    oldVariant?.payload?.type === newVariant?.payload?.type &&
    oldVariant?.payload?.value === newVariant?.payload?.value

  return !variantsAreEqual
}

const useVariant = (name: MaybeRefOrGetter<string>) => {
  const { getVariant, client } = inject<TVariantContext>(ContextStateSymbol, {})
  const variant = ref(getVariant?.value(toValue(name)))

  function onUpdate() {
    const newVariant = getVariant?.value(toValue(name))
    if (variantHasChanged(variant?.value, newVariant)) {
      variant.value = newVariant
    }
  }

  function onReady() {
    variant.value = getVariant?.value(toValue(name))
  }

  client?.value.on('ready', onReady)
  client?.value.on('update', onUpdate)
  watch(() => toValue(name), onUpdate)

  onUnmounted(() => {
    client?.value.off('ready', onReady)
    client?.value.off('update', onUpdate)
  })

  return variant || {}
}

export default useVariant
