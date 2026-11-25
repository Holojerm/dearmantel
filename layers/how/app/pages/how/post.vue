<script setup lang="ts">
// How the post keeps time: collection, transit by distance, Sundays, mail
// days and the notice. The table is the plan's transit table, which
// layers/post/shared implements; change one and change the other.
import type { HowDay } from '../../components/How/Week.vue'

definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.7',
    title: 'How the post keeps time',
    summary:
      'The postal calendar: collection at 5 pm, two to nine postal days in transit by distance, no Sundays, arrival on the reader’s own mail days, and one notice with no names in it.',
  },
})

const sunday: HowDay = { day: 'Sun', kind: 'off' }
const before: HowDay[] = [
  { day: 'Mon', kind: 'post', note: '5 pm' },
  { day: 'Tue' },
  { day: 'Wed' },
  { day: 'Thu' },
  { day: 'Fri' },
  { day: 'Sat' },
  sunday,
]
const after: HowDay[] = [
  { day: 'Mon', note: '6 pm' },
  { day: 'Tue', kind: 'post', note: '5 pm' },
  { day: 'Wed' },
  { day: 'Thu' },
  { day: 'Fri' },
  { day: 'Sat' },
  sunday,
]
const weekend: HowDay[] = [
  { day: 'Fri', kind: 'post', note: '5 pm' },
  { day: 'Sat', kind: 'transit' },
  sunday,
  { day: 'Mon', kind: 'transit' },
  { day: 'Tue', kind: 'arrive' },
  { day: 'Wed' },
  { day: 'Thu' },
]
const mailDays: HowDay[] = [
  { day: 'Mon', kind: 'closed' },
  { day: 'Tue', note: 'mail' },
  { day: 'Wed', kind: 'wait', note: 'ready' },
  { day: 'Thu', kind: 'wait' },
  { day: 'Fri', kind: 'arrive', note: '10 am' },
  { day: 'Sat', kind: 'closed' },
  sunday,
]

const distances = [
  { how: 'Under 100 km', days: 2 },
  { how: '100 to 1,000 km, same country', days: 3 },
  { how: 'Over 1,000 km, same country', days: 4 },
  { how: 'Another country, under 2,500 km', days: 5 },
  { how: 'Another country, 2,500 to 8,000 km', days: 7 },
  { how: 'Another country, over 8,000 km', days: 9 },
]

useSeo({
  title: 'How the post keeps time',
  description:
    'Collected at five, two to nine postal days by distance, never on a Sunday, and delivered on the days and at the hour you chose.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'How the post keeps time', path: '/how/post' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">How the post keeps time</h1>
      <p class="font-serif text-lg text-toned">
        Every letter on every mantel keeps the same calendar. It is fixed and plain: no express, no
        weather, nothing left to chance.
      </p>
    </template>

    <HowScene title="Collected at five">
      <template #figure>
        <div class="flex flex-col gap-5">
          <HowWeek label="Sealed Monday at 3 pm" :days="before" />
          <HowWeek label="Sealed Monday at 6 pm" :days="after" :start="34" :end="50" />
        </div>
      </template>
      <p>
        The post is collected at 5 pm where the writer lives, Monday to Saturday. A letter sealed
        before five is postmarked that day. One sealed after five waits for the next collection.
      </p>
      <p>
        Until it is collected, its writer can take it back. After that it is final, and the day it
        is due is fixed.
      </p>
    </HowScene>

    <HowScene title="Distance decides the days">
      <template #figure>
        <ul class="flex flex-col gap-2">
          <li
            v-for="(distance, row) in distances"
            :key="distance.how"
            class="flex items-center gap-1"
          >
            <span
              v-for="n in distance.days"
              :key="n"
              class="play-ink size-4 rounded-sm border border-(--line) sm:size-5"
              :class="n === distance.days ? 'bg-(--art-blush)' : 'bg-(--art-kraft)'"
              :style="along(18 + row * 2 + n * 3, 21 + row * 2 + n * 3)"
            />
            <span class="ml-2 font-mono text-xs text-muted">{{ distance.days }}</span>
          </li>
        </ul>
      </template>
      <p>
        A letter’s days in transit come from how far apart the two cities are, and from nothing
        else.
      </p>
      <div class="relative overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            Postal days in transit, by distance
          </caption>
          <thead>
            <tr class="border-b border-default text-muted">
              <th scope="col" class="py-2 font-normal">Between the two cities</th>
              <th scope="col" class="py-2 text-right font-normal">Postal days</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="distance in distances"
              :key="distance.how"
              class="border-b border-default last:border-b-0"
            >
              <th scope="row" class="py-2 font-normal">{{ distance.how }}</th>
              <td class="py-2 text-right font-mono">{{ distance.days }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </HowScene>

    <HowScene title="Never on a Sunday">
      <template #figure>
        <HowWeek label="Three postal days, posted on a Friday" :days="weekend" />
      </template>
      <p>
        Postal days are Monday to Saturday. Sunday never counts and is not a setting: nothing is
        collected, nothing travels and nothing arrives. There are no other holidays.
      </p>
      <p>
        A sealed letter that has already arrived can be opened on its day whatever day of the week
        that is. Opening is not post.
      </p>
    </HowScene>

    <HowScene title="It arrives on your mail days">
      <template #figure>
        <HowWeek label="Mail on Tuesdays and Fridays, at 10 am" :days="mailDays" />
      </template>
      <p>
        You choose the days you get mail, any of Monday to Saturday, down to one day a week, and the
        hour it comes. Everything that is ready arrives together on your next mail day, once.
      </p>
      <p>
        A change to your days or your hour starts tomorrow. A change of city applies at once. You
        never get mail twice in one day.
      </p>
    </HowScene>

    <HowScene title="One quiet notice">
      <template #figure>
        <div class="grid grid-cols-2 gap-3">
          <HowZone label="What the email says">
            <ArtSheet class="play-appear h-16" :style="along(25, 42)" />
            <template #note>“Something arrived on your mantel.”</template>
          </HowZone>
          <HowZone label="What it leaves out">
            <ul class="flex flex-col gap-1 font-mono text-xs text-toned uppercase">
              <li>Who wrote</li>
              <li>How many</li>
              <li>Any of the words</li>
            </ul>
          </HowZone>
        </div>
      </template>
      <p>
        On a day something arrives you get one email. It says only that something arrived. Its link
        opens your mantel and works only once you have signed in.
      </p>
      <p>
        A day with nothing sends nothing. There are no reminders, and nothing tells you to write.
      </p>
    </HowScene>
  </HowPage>
</template>
