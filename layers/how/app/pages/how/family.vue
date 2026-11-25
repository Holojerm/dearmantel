<script setup lang="ts">
// How a family mantel works, and the family room beside it. The room is not
// encrypted, and this page has to say so as plainly as the room itself does
// (AGENTS.md › Rules the code must never break).
import type { HowDay } from '../../components/How/Week.vue'

definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.8',
    title: 'A family mantel and its room',
    summary:
      'How one letter reaches every person in a family on their own post, who can join and leave, and what the family room holds: photos, a map of cities and a monthly gazette, not encrypted.',
  },
})

const rest: HowDay[] = [{ day: 'Sun', kind: 'off' }]
const posts: { label: string; days: HowDay[] }[] = [
  {
    label: 'Ann, across town',
    days: [
      { day: 'Mon', kind: 'post' },
      { day: 'Tue', kind: 'transit' },
      { day: 'Wed', kind: 'arrive' },
      { day: 'Thu' },
      { day: 'Fri' },
      { day: 'Sat' },
      ...rest,
    ],
  },
  {
    label: 'Bob, a long way off',
    days: [
      { day: 'Mon', kind: 'post' },
      { day: 'Tue', kind: 'transit' },
      { day: 'Wed', kind: 'transit' },
      { day: 'Thu', kind: 'transit' },
      { day: 'Fri', kind: 'arrive' },
      { day: 'Sat' },
      ...rest,
    ],
  },
  {
    label: 'Cy, who gets mail on Saturdays',
    days: [
      { day: 'Mon', kind: 'post' },
      { day: 'Tue', kind: 'transit' },
      { day: 'Wed', kind: 'transit' },
      { day: 'Thu', kind: 'wait' },
      { day: 'Fri', kind: 'wait' },
      { day: 'Sat', kind: 'arrive' },
      ...rest,
    ],
  },
]

const never = [
  {
    title: 'No reminders',
    description:
      'The room never asks where you are, and there is no way for one person to remind another.',
  },
  {
    title: 'Cities, not letters',
    description:
      'The map shows the city each person said. It never shows a letter, or anything on its way.',
  },
  {
    title: 'Taken back means gone',
    description:
      'The gazette is laid out when you read it. A photo you delete is in no issue, old or new.',
  },
  {
    title: 'Yours to keep',
    description:
      'Anyone in the family can save a copy of the room to their own device, built in their browser.',
  },
]

useSeo({
  title: 'A family mantel and its room',
  description:
    'One letter for a whole family, a copy for each person on their own post, and a shared room for photos and a monthly gazette.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'A family mantel and its room', path: '/how/family' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">A family mantel and its room</h1>
      <p class="font-serif text-lg text-toned">
        A family is a name and the people in it. You write one letter and each of them gets their
        own copy. A family can also have a room, for photos and where everyone is.
      </p>
      <WhoReads>
        Everyone in a family sees its room, and we could read it. Letters to the family stay
        encrypted: only the people in it can read them.
      </WhoReads>
    </template>

    <HowScene title="One letter, a copy for each person">
      <template #figure>
        <div class="flex flex-col items-center gap-6">
          <div class="flex flex-col items-center gap-2">
            <ArtSheet class="h-16" />
            <HowLabel>One letter to The Lees</HowLabel>
          </div>
          <div class="grid w-full grid-cols-3 gap-3">
            <HowShelf label="Ann">
              <ArtEnvelope class="play-appear w-16" :style="along(22, 34)" />
            </HowShelf>
            <HowShelf label="Bob">
              <ArtEnvelope class="play-appear w-16" :style="along(30, 42)" />
            </HowShelf>
            <HowShelf label="Cy">
              <ArtEnvelope class="play-appear w-16" :style="along(38, 50)" />
            </HowShelf>
          </div>
        </div>
      </template>
      <p>
        A letter to a family is an ordinary letter with several readers. Your browser encrypts it
        once and locks a copy of its key to each person’s own key. There is no family password to
        share or lose.
      </p>
      <p>Each person reads their copy on their own mantel.</p>
    </HowScene>

    <HowScene title="Each copy on its own post">
      <template #figure>
        <div class="flex flex-col gap-5">
          <HowWeek
            v-for="post in posts"
            :key="post.label"
            :label="post.label"
            :days="post.days"
            :start="20"
            :end="52"
          />
        </div>
      </template>
      <p>
        Every copy travels from your city to its reader’s, and arrives on a day that reader chose to
        get mail. So the same letter can reach one person on Wednesday and another on Saturday.
      </p>
      <p>
        Nobody is told when someone else’s copy arrived or was opened. Your desk shows one letter,
        in transit until the day the last copy is due.
      </p>
    </HowScene>

    <HowScene title="Joining and leaving">
      <template #figure>
        <div class="grid grid-cols-2 gap-3">
          <HowZone label="Sealed before Cy joined">
            <ArtEnvelope class="w-14 opacity-30" />
            <ArtEnvelope class="w-14 opacity-30" />
            <template #note>Never locked to Cy’s key.</template>
          </HowZone>
          <HowZone label="Sealed after">
            <ArtEnvelope class="play-appear w-14" :style="along(25, 40)" />
            <ArtEnvelope class="play-appear w-14" :style="along(35, 50)" />
            <template #note>A copy for Cy too.</template>
          </HowZone>
        </div>
      </template>
      <p>
        One person organises the family: they invite people and can remove them. Anyone may leave.
      </p>
      <p>
        Someone who joins reads what is sealed after they join. Earlier letters were never locked to
        their key, and nobody can change that for them, us included. Someone who leaves keeps every
        letter they received.
      </p>
    </HowScene>

    <HowScene title="The family room">
      <template #figure>
        <div class="grid grid-cols-3 gap-3">
          <HowZone label="Photos">
            <ArtPrint class="play-appear w-10 -rotate-6" :style="along(22, 34)" />
            <ArtPrint class="play-appear w-10 rotate-3" :style="along(28, 40)" />
          </HowZone>
          <HowZone label="Where everyone is">
            <ul class="flex flex-col gap-1 font-mono text-xs text-toned uppercase">
              <li>Boston</li>
              <li>Lyon</li>
              <li>Osaka</li>
            </ul>
          </HowZone>
          <HowZone label="The gazette">
            <ArtSheet class="play-appear h-14" :style="along(38, 50)" />
            <template #note>On the first of each month.</template>
          </HowZone>
        </div>
      </template>
      <p>
        The room is a family’s shared album, a map of the cities people say they are in, and a
        gazette: on the first of each month the past month is laid out to read, with an almanac for
        the year.
      </p>
      <p>
        The room is not encrypted. Everyone in the family sees all of it, and we could read it,
        because our server draws the map and lays out the gazette. Every page of the room says so.
        Room and letters are kept apart: nothing in the room refers to a letter.
      </p>
    </HowScene>

    <HowScene title="What the room never does">
      <dl class="flex flex-col gap-5">
        <div v-for="item in never" :key="item.title" class="flex flex-col gap-1">
          <dt class="font-display text-xl text-highlighted">{{ item.title }}</dt>
          <dd>{{ item.description }}</dd>
        </div>
      </dl>
    </HowScene>
  </HowPage>
</template>
