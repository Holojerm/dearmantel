<script setup lang="ts">
// A diagram's label, set like a postmark (DESIGN.md › The objects).
withDefaults(defineProps<{ align?: 'left' | 'center' | 'right' }>(), { align: 'center' })
</script>

<template>
  <span
    class="font-mono text-xs tracking-wide text-muted uppercase"
    :class="{
      'text-left': align === 'left',
      'text-center': align === 'center',
      'text-right': align === 'right',
    }"
  >
    <slot />
  </span>
</template>
