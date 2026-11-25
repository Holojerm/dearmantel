<script setup lang="ts">
// A short length of mantel with something standing on it. In these diagrams a
// person is drawn as their mantel, never as a figure (DESIGN.md › Play).
defineProps<{ label?: string }>()
</script>

<template>
  <div class="flex min-w-0 flex-col items-center gap-2">
    <div class="w-full min-w-16">
      <div class="flex h-16 items-end justify-center gap-1 px-1">
        <slot />
      </div>
      <div class="h-1.5 rounded-full bg-inverted" />
    </div>
    <HowLabel v-if="label">{{ label }}</HowLabel>
  </div>
</template>
