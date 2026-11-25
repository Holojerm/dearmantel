<script setup lang="ts">
// How letters between two people work, from the invitation to the reply.
// Every claim here is a product rule (AGENTS.md › Rules the code must never
// break): change the rule and this page changes with it.
import type { HowDay } from '../../components/How/Week.vue'

definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.8',
    title: 'Letters between two people',
    summary:
      'How a letter travels between two people: the invitation, sealing, the days in the post, the morning it arrives, and what the writer is never told.',
  },
})

const week: HowDay[] = [
  { day: 'Mon', kind: 'post', note: '5 pm' },
  { day: 'Tue', kind: 'transit' },
  { day: 'Wed', kind: 'transit' },
  { day: 'Thu', kind: 'arrive', note: '10 am' },
  { day: 'Fri' },
  { day: 'Sat' },
  { day: 'Sun', kind: 'off' },
]

const changes = [
  {
    title: 'You change your mind',
    description:
      'Until the post is collected at five, you can take a letter back, change it, or throw it away.',
  },
  {
    title: 'It cannot be delivered',
    description:
      'If their email address stops working, or they stop writing with you, the letter comes back to you on your next mail day.',
  },
  {
    title: 'One of you stops',
    description:
      'Either of you can stop at any time. Letters on their way to the person who stopped go back to their writers. Letters that person already posted still arrive.',
  },
  {
    title: 'Someone leaves for good',
    description:
      'A letter belongs to the person who received it. It stays with them after its writer has deleted their account.',
  },
]

useSeo({
  title: 'Letters between two people',
  description:
    'How a letter travels on Dear Mantel: an invitation, a seal, days in the post, a morning arrival, and no read receipts.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'Letters between two people', path: '/how/letters' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">Letters between two people</h1>
      <p class="font-serif text-lg text-toned">
        You invite one person. After that the two of you write to each other, and every letter takes
        days to arrive. Scroll, and the days go by.
      </p>
      <WhoReads encrypted>Only you and the person you write to can read a letter.</WhoReads>
    </template>

    <HowScene title="Invite someone you know">
      <template #figure>
        <HowRoute from="You" to="Ann">
          <template #from>
            <HowShelf><ArtClock class="h-14" /></HowShelf>
          </template>
          <ArtSheet class="w-9" />
          <template #to>
            <HowShelf><ArtPlant class="h-14" /></HowShelf>
          </template>
        </HowRoute>
      </template>
      <p>
        By email. We send one message with fixed wording. It names you, and it carries no letter and
        no note. The link in it works once and lasts 30 days.
      </p>
      <p>
        When they accept, the two of you can write to each other. There is no feed and no search:
        nobody finds you unless you invited them or they invited you.
      </p>
    </HowScene>

    <HowScene title="Write, then seal">
      <template #figure>
        <HowRoute from="Your desk" to="Collected at 5 pm">
          <template #from><ArtSheet class="h-16" /></template>
          <ArtEnvelope />
          <template #to><ArtPostbox class="h-20" /></template>
        </HowRoute>
      </template>
      <p>
        A letter is a page on paper you choose, in your choice of type and ink, with one photo if
        you like. Sealing it puts it in the postbox.
      </p>
      <p>
        The post is collected at five in the afternoon where you live. Until then you can take the
        letter back and change it. After that it is final, and that day is its postmark.
      </p>
    </HowScene>

    <HowScene title="It travels for days">
      <template #figure>
        <div class="flex flex-col gap-8">
          <HowRoute from="New York" to="Boston" :start="22" :end="52">
            <template #from>
              <HowShelf><ArtClock class="h-14" /></HowShelf>
            </template>
            <ArtEnvelope />
            <template #to>
              <HowShelf><ArtPlant class="h-14" /></HowShelf>
            </template>
          </HowRoute>
          <HowWeek :days="week" :start="22" :end="52" />
        </div>
      </template>
      <p>
        How long depends on how far apart you live: two postal days across town, nine across the
        world. Sunday is never a postal day.
      </p>
      <p>
        You are told the day it is due and nothing more: “In transit, arrives Thursday.” The wait is
        the point. It is what makes a slow reply polite.
      </p>
    </HowScene>

    <HowScene title="It arrives in the morning">
      <template #figure>
        <div class="mx-auto grid max-w-md grid-cols-[2fr_1fr] items-end gap-6">
          <HowShelf label="Ann’s mantel, Thursday">
            <ArtPlant class="h-14" />
            <ArtEnvelope class="play-appear w-20" :style="along(25, 45)" />
            <ArtCandle class="h-12" />
          </HowShelf>
          <div class="flex flex-col items-center gap-2">
            <ArtSheet class="play-appear h-16" :style="along(35, 55)" />
            <HowLabel>One email</HowLabel>
          </div>
        </div>
      </template>
      <p>
        A letter arrives on one of the days its reader chose to get mail, at the hour they chose:
        ten in the morning unless they change it. Before that they see nothing of it at all.
      </p>
      <p>
        On a day something arrives they get one email. It says “Something arrived on your mantel.”
        It does not say who wrote or how many letters there are, and there is no second email to
        remind them.
      </p>
    </HowScene>

    <HowScene title="What you are never told">
      <template #figure>
        <div class="grid grid-cols-2 gap-3">
          <HowZone label="What you see">
            <ArtEnvelope class="w-20" />
            <template #note>Postmarked Monday. Nothing after that.</template>
          </HowZone>
          <HowZone label="What Ann sees">
            <ArtSheet class="play-appear h-16" :style="along(30, 50)" />
            <template #note>Your letter, whenever she opens it.</template>
          </HowZone>
        </div>
      </template>
      <p>
        Once the day it was due has come, you see the letter’s postmark and nothing else. You are
        not told that it arrived, or that it was opened, or when. Nobody is told that about you
        either.
      </p>
      <p>
        A reply is a new letter. It is written on a sheet below the one it answers, and it takes its
        own days to reach you.
      </p>
    </HowScene>

    <HowScene title="When plans change">
      <dl class="flex flex-col gap-5">
        <div v-for="change in changes" :key="change.title" class="flex flex-col gap-1">
          <dt class="font-display text-xl text-highlighted">{{ change.title }}</dt>
          <dd>{{ change.description }}</dd>
        </div>
      </dl>
    </HowScene>
  </HowPage>
</template>
