<script setup lang="ts">
// A place in a diagram, with its name over it: "Your browser", "Our server".
// What is inside the dashed line is there and nowhere else.
defineProps<{ label: string }>()
</script>

<template>
  <div
    class="flex min-w-0 flex-col items-center gap-3 rounded-md border border-dashed border-accented px-2 py-4"
  >
    <HowLabel>{{ label }}</HowLabel>
    <div class="flex flex-1 flex-wrap items-center justify-center gap-2">
      <slot />
    </div>
    <p v-if="$slots.note" class="text-center text-xs text-muted">
      <slot name="note" />
    </p>
  </div>
</template>
