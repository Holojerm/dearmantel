<script setup lang="ts">
// One step of an explanation: a heading, a diagram and the words. The scene
// is the diagram's stretch of scrolling (`play-scene`), so what is drawn in
// `#figure` moves as the scene crosses the window. The figure is hidden from
// assistive technology: the words below it say everything it shows.
defineProps<{ title: string }>()
</script>

<template>
  <section class="play-scene flex flex-col gap-5">
    <h2 class="text-2xl text-highlighted sm:text-3xl">{{ title }}</h2>
    <div
      v-if="$slots.figure"
      aria-hidden="true"
      class="overflow-hidden rounded-md border border-default bg-elevated px-4 py-8 sm:px-8"
    >
      <slot name="figure" />
    </div>
    <div class="flex flex-col gap-3 text-default">
      <slot />
    </div>
  </section>
</template>
