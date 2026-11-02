<script setup lang="ts">
import type { DeliveryBlock } from '@moteurio/client';
import type { Component } from 'vue';

defineProps<{
  blocks: DeliveryBlock[];
  locale: string;
  components: Record<string, Component>;
}>();
</script>

<template>
  <template v-for="(block, i) in blocks" :key="`${block.type}-${i}`">
    <component
      v-if="components[block.type]"
      :is="components[block.type]"
      :data="block.data"
      :locale="locale"
    />
  </template>
</template>
