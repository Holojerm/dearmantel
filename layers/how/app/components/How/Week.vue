<script setup lang="ts">
// A run of days, each inked in its turn as the scene scrolls by: the days a
// letter spends in the post.
//
//   post     the day it is collected and postmarked
//   transit  a postal day on the way
//   wait     ready, and waiting for a mail day
//   arrive   the day it is on the mantel
//   closed   not one of this person's mail days
//   off      Sunday: never a postal day
export type HowDay = {
  day: string
  kind?: 'post' | 'transit' | 'wait' | 'arrive' | 'closed' | 'off'
  note?: string
}

const props = withDefaults(
  defineProps<{ days: HowDay[]; label?: string; start?: number; end?: number }>(),
  { label: '', start: 18, end: 50 },
)

const TONE: Record<NonNullable<HowDay['kind']>, string> = {
  post: 'border-(--line) bg-(--art-kraft) text-highlighted',
  transit: 'border-(--line) text-default',
  wait: 'border-dashed border-(--line) text-default',
  arrive: 'border-(--line) bg-(--art-blush) text-highlighted',
  closed: 'border-dashed border-default text-muted',
  off: 'border-dashed border-default text-muted line-through',
}
const STILL = new Set<HowDay['kind']>([undefined, 'closed', 'off'])

// The days that move share the scene's stretch between them, in order.
const cells = computed(() => {
  const moving = props.days.filter((day) => !STILL.has(day.kind)).length
  const step = (props.end - props.start) / Math.max(moving, 1)
  let turn = 0
  return props.days.map((day) => {
    if (STILL.has(day.kind)) return { ...day, moves: false, range: undefined }
    const from = props.start + step * turn++
    return { ...day, moves: true, range: along(from, from + step) }
  })
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <HowLabel v-if="label" class="self-start">{{ label }}</HowLabel>
    <ol class="grid auto-cols-fr grid-flow-col gap-1 sm:gap-2">
      <li v-for="cell in cells" :key="cell.day" class="flex min-w-0 flex-col items-center gap-1">
        <span
          class="w-full rounded-sm border py-1.5 text-center font-mono text-xs uppercase"
          :class="[
            cell.kind ? TONE[cell.kind] : 'border-default text-muted',
            { 'play-ink': cell.moves },
          ]"
          :style="cell.range"
        >
          {{ cell.day }}
        </span>
        <span class="min-h-4 font-mono text-xs whitespace-nowrap text-muted">{{ cell.note }}</span>
      </li>
    </ol>
  </div>
</template>
