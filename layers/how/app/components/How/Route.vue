<script setup lang="ts">
// A journey between two ends. Whatever is in the default slot travels the
// dashed road from `#from` to `#to` as the scene scrolls by, and rests at the
// far end: arrived.
withDefaults(defineProps<{ from?: string; to?: string; start?: number; end?: number }>(), {
  from: '',
  to: '',
  start: 18,
  end: 48,
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="grid grid-cols-[auto_1fr_auto] items-end gap-x-3">
      <div class="flex h-20 min-w-16 items-end justify-center">
        <slot name="from" />
      </div>
      <!-- The road is the container, so the traveller's start is one road's
           length back from where it rests. -->
      <div class="@container relative h-16">
        <div class="absolute inset-x-0 bottom-0 border-t-2 border-dashed border-accented" />
        <div
          class="play-travel absolute right-0 bottom-2 w-14 sm:w-16"
          :style="along(start, end, { '--dx': 'calc(100% - 100cqw)', '--turn': '-6deg' })"
        >
          <slot />
        </div>
      </div>
      <div class="flex h-20 min-w-16 items-end justify-center">
        <slot name="to" />
      </div>
    </div>
    <!-- Their own row, so a long label never squeezes the road. -->
    <div class="flex justify-between gap-6">
      <HowLabel align="left">{{ from }}</HowLabel>
      <HowLabel align="right">{{ to }}</HowLabel>
    </div>
  </div>
</template>
