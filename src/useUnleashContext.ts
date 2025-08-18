import { IMutableContext } from 'unleash-proxy-client'
import { inject, Ref } from 'vue'
import { ContextStateSymbol } from './context'

type TUnleashContext = Partial<{
  updateContext: Ref<(context: IMutableContext) => Promise<void>>
}>

const useUnleashContext = () => {
  const { updateContext } = inject<TUnleashContext>(ContextStateSymbol, {})

  return updateContext?.value
}

export default useUnleashContext
