<script setup lang="ts">
// A card on a wedding table, printed with the square code that leads to a
// couple's anniversary mantel.
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
    <rect x="2" y="2" width="52" height="68" rx="2" fill="var(--art-cream)" />
    <path d="M16 12h24" fill="none" />
    <rect x="12" y="22" width="32" height="32" fill="var(--art-paper)" />
    <g fill="var(--line)" stroke="none">
      <rect x="15" y="25" width="9" height="9" />
      <rect x="32" y="25" width="9" height="9" />
      <rect x="15" y="42" width="9" height="9" />
      <rect x="27" y="29" width="3" height="3" />
      <rect x="27" y="37" width="3" height="3" />
      <rect x="32" y="37" width="3" height="3" />
      <rect x="38" y="41" width="3" height="3" />
      <rect x="32" y="46" width="3" height="5" />
      <rect x="38" y="48" width="3" height="3" />
      <rect x="18" y="37" width="6" height="3" />
    </g>
    <g fill="var(--art-paper)" stroke="none">
      <rect x="18" y="28" width="3" height="3" />
      <rect x="35" y="28" width="3" height="3" />
      <rect x="18" y="45" width="3" height="3" />
    </g>
    <path d="M20 62h16" fill="none" stroke="var(--art-clay)" />
  </svg>
</template>
