<script setup lang="ts">
// A leaf from a tear-off calendar, showing one day: the day a sealed letter
// opens. The words beside it always say the same date.
defineProps<{ day: string; month: string; year: string }>()
</script>

<template>
  <svg
    viewBox="0 0 56 68"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <rect x="2" y="6" width="52" height="60" rx="2" fill="var(--art-paper)" />
    <path d="M2 8a2 2 0 0 1 2-2h48a2 2 0 0 1 2 2v12H2z" fill="var(--art-clay)" />
    <path d="M16 2v8M40 2v8" fill="none" />
    <g class="leaf-words" stroke="none" fill="var(--line)" text-anchor="middle">
      <text x="28" y="45" font-size="22">{{ day }}</text>
      <text x="28" y="59" font-size="9">{{ month }} {{ year }}</text>
    </g>
  </svg>
</template>

<style scoped>
.leaf-words {
  font-family: var(--font-mono);
}
</style>
