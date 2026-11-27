<script setup lang="ts">
import { onMounted, onUnmounted, provide } from 'vue'
import type { UnleashClient, IConfig } from 'unleash-proxy-client'

import { ContextStateSymbol, ContextUpdateSymbol } from './context'
import useUnleashProvide from './useUnleashProvide'

const {
  config,
  unleashClient,
  startClient = true,
  stopClient = false
} = defineProps<{
  config?: IConfig
  unleashClient?: UnleashClient
  startClient?: boolean
  stopClient?: boolean
}>()

const { context, start, update, dispose } = useUnleashProvide({
  config,
  unleashClient,
  startClient,
  stopClient
})

provide(ContextStateSymbol, context)
provide(ContextUpdateSymbol, update)

onMounted(start)
onUnmounted(dispose)
</script>

<template>
  <slot></slot>
</template>
