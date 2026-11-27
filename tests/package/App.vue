<script setup lang="ts">
import {
  FlagProvider,
  InMemoryStorageProvider
} from '@unleash/proxy-client-vue'
import type { IConfig } from '@unleash/proxy-client-vue'
import Consumer from './Consumer.vue'

const config: IConfig = {
  url: 'https://example.com/api/frontend',
  clientKey: 'test',
  appName: 'package-consumer',
  disableMetrics: true,
  disableRefresh: true,
  storageProvider: new InMemoryStorageProvider()
}
</script>

<template>
  <FlagProvider :config="config">
    <Consumer />
  </FlagProvider>
</template>
