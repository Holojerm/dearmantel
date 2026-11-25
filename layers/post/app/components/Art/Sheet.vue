<script setup lang="ts">
// A sheet of paper, three ways: `written` is a letter someone can read,
// `scrambled` is the same letter as the server holds it, and `code` is a
// printed recovery code.
withDefaults(defineProps<{ kind?: 'written' | 'scrambled' | 'code' }>(), { kind: 'written' })
</script>

<template>
  <svg
    viewBox="0 0 56 72"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <template v-if="kind === 'written'">
      <rect x="2" y="2" width="52" height="68" rx="2" fill="var(--art-paper)" />
      <path d="M10 14h18M10 26h36M10 34h36M10 42h28M30 58h16" fill="none" />
    </template>
    <template v-else-if="kind === 'scrambled'">
      <rect x="2" y="2" width="52" height="68" rx="2" fill="var(--art-kraft)" />
      <path
        d="M10 14h36M10 24h36M10 34h36M10 44h36M10 54h36"
        fill="none"
        stroke-width="5"
        stroke-linecap="butt"
        stroke-dasharray="3 3"
      />
    </template>
    <template v-else>
      <rect x="2" y="2" width="52" height="68" rx="2" fill="var(--art-cream)" />
      <path d="M10 14h22" fill="none" />
      <path
        d="M10 30h36M10 42h36M10 54h36"
        fill="none"
        stroke="var(--art-clay)"
        stroke-width="5"
        stroke-linecap="butt"
        stroke-dasharray="7 3"
      />
    </template>
  </svg>
</template>
