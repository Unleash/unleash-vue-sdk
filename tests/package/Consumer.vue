<script setup lang="ts">
import {
  useFlag,
  useVariant,
  useFlagsStatus,
  useUnleashClient,
  useUnleashContext
} from '@unleash/proxy-client-vue'

const enabled = useFlag('checkout')
const variant = useVariant('checkout')
const { flagsReady, flagsError } = useFlagsStatus()
const client = useUnleashClient()
const updateContext = useUnleashContext()
</script>

<template>
  <p>
    {{ enabled }}:{{ variant?.name }}:{{ flagsReady }}:{{ flagsError }}:{{
      Boolean(client)
    }}:{{ typeof updateContext }}
  </p>
</template>
