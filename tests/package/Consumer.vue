<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  useFlag,
  useVariant,
  useFlagsStatus,
  useUnleashClient,
  useUnleashContext
} from '@unleash/proxy-client-vue'

const name = ref('checkout')
const enabled = useFlag(name)
const variant = useVariant(() => name.value)
const computedFlag = useFlag(computed(() => name.value))
const { flagsReady, flagsError } = useFlagsStatus()
const client = useUnleashClient()
const updateContext = useUnleashContext()
</script>

<template>
  <p>
    {{ enabled }}:{{ variant?.name }}:{{ computedFlag }}:{{ flagsReady }}:{{ flagsError }}:{{
      Boolean(client)
    }}:{{ typeof updateContext }}
  </p>
</template>
