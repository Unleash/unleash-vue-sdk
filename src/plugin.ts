import type { App, Plugin } from 'vue'
import { ContextStateSymbol, ContextUpdateSymbol } from './context'
import useUnleashProvide, { type IProvideOptions } from './useUnleashProvide'

const plugin: Plugin = {
  install(app: App, options: IProvideOptions) {
    const { context, update, start, dispose } = useUnleashProvide(options)

    app.provide(ContextStateSymbol, context)
    app.provide(ContextUpdateSymbol, update)
    app.onUnmount(dispose)

    start()
  }
}

export default plugin
