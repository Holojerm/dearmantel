<script setup lang="ts">
// A door key: what opens letters. `tone` tells one key from another in the
// same diagram (a person's own key, and a mantel's).
withDefaults(defineProps<{ tone?: 'clay' | 'kraft' | 'paper' }>(), { tone: 'clay' })
</script>

<template>
  <svg
    viewBox="0 0 64 28"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <path d="M22 11h39v6h-3v6h-5v-6h-3v4h-5v-4H22z" :fill="`var(--art-${tone})`" />
    <circle cx="13" cy="14" r="11" :fill="`var(--art-${tone})`" />
    <circle cx="11" cy="14" r="4" fill="var(--ui-bg-elevated)" />
  </svg>
</template>
