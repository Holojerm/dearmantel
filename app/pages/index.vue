<script setup lang="ts">
// The landing page: what Dear Mantel is, how a letter travels, and what the
// product leaves out on purpose.
//
// Public and indexable — the `publicPage` meta below is what puts it in
// sitemap.xml, and it carries the SoftwareApplication node that tells an answer
// engine what this product is.

definePageMeta({
  publicPage: {
    changefreq: 'weekly',
    priority: '1.0',
    title: 'Overview',
    summary:
      'Letters for family and friends that arrive on a postal rhythm: how a letter travels, what is encrypted, and what the product leaves out.',
  },
})

const config = useRuntimeConfig()
const { loggedIn } = useUserSession()
const site = useSiteContext()

const steps = [
  {
    title: 'Invite someone you know',
    description:
      'By email. Once they accept, the two of you can write to each other. There is no feed, and nobody to discover.',
  },
  {
    title: 'Write, then seal',
    description:
      'The post collects at five in the afternoon where you live. Until then you can take a letter back and change it.',
  },
  {
    title: 'It arrives days later',
    description:
      'Two days across town, nine across the world, never on a Sunday. It comes in the morning, on the days they chose, and waits on their mantel.',
  },
]

const promises = [
  {
    title: 'No read receipts',
    description:
      'You are told the day a letter is due to arrive, and nothing after that. Nobody knows when you opened theirs.',
  },
  {
    title: 'One quiet notice',
    description:
      'On a day something arrives you get one email. It does not say who it is from or how many there are.',
  },
  {
    title: 'Letters we cannot read',
    description:
      'Each letter is encrypted in your browser. We store who writes to whom and when, never what.',
  },
  {
    title: 'Yours to keep',
    description: 'A letter belongs to the person who received it, even after its writer has left.',
  },
]

const house = [
  {
    title: 'Your mantel',
    art: resolveComponent('ArtClock'),
    description:
      'Where letters arrive. Unopened ones stand on the shelf until you take them down, and nothing tells the writer when you did.',
  },
  {
    title: "A child's mantel",
    art: resolveComponent('ArtCandle'),
    description:
      'Letters written now and sealed for years. The people you choose keep its key until the day it opens.',
  },
  {
    title: 'The family room',
    art: resolveComponent('ArtPlant'),
    description:
      'A place for the family’s photos and where everyone is, with a gazette on the first of each month. It is shared and not encrypted, and it says so.',
  },
]

// The explainer pages (layers/how), listed under the house.
const howPages = useHowPages()

// The letter shown on this page is a real one, drawn by the same component
// that draws every letter (DESIGN.md › Imagery).
const specimen = {
  v: 2 as const,
  stationery: { paper: 'plain' as const, font: 'serif' as const, ink: 'black' as const },
  from: 'Ann',
  content: {
    type: 'doc' as const,
    content: [
      'Dear Bob,',
      'The plums are ripe and the wasps have found them. Come in August, and bring the dog.',
      'Mother asks after you every Sunday and I have run out of things to tell her, so write and give me some.',
      'We painted the back room at last. It is a colour the tin calls linen and I call beige.',
    ].map((text) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] })),
  },
}

// One source for the product's one-sentence claim — also used by /llms.txt and
// the SoftwareApplication node, so all three agree.
const description = config.public.appDescription

useSeo({
  // 'exact' because the brand should lead on the landing page — everywhere else
  // useSeo appends `· AppName` for you.
  titleMode: 'exact',
  title: `${config.public.appName} — letters for family and friends, slowly`,
  description,
  schema: [softwareApplicationSchema(site, { description, offers: [] })],
})
</script>

<template>
  <div class="flex flex-col gap-20 pt-12 sm:gap-28 sm:pt-16">
    <section class="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
      <h1 class="text-4xl text-highlighted sm:text-5xl">
        Letters for family and friends,
        <span class="relative inline-block">
          <em>slowly</em>
          <ArtSquiggle class="absolute inset-x-0 -bottom-2" />
        </span>
      </h1>
      <p class="max-w-2xl font-serif text-lg text-toned">
        {{ config.public.appName }} is for writing to the people you already know, at the pace of
        the post. A letter takes days to arrive, so nobody has to answer quickly.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <UButton :to="loggedIn ? '/mantel' : '/auth/sign-up'" size="lg">
          {{ loggedIn ? 'Open your mantel' : 'Start writing' }}
        </UButton>
        <UButton to="/how" size="lg" color="neutral" variant="outline">See how it works</UButton>
      </div>

      <!-- The mantel, with the post in. -->
      <div class="mt-4 w-full max-w-2xl" aria-hidden="true">
        <div class="relative flex items-end justify-between gap-2 px-3">
          <ArtClock class="h-24 sm:h-40" />
          <div class="flex items-end gap-2 pb-0.5">
            <ArtEnvelope class="play-sway w-20 -rotate-3 sm:w-36" />
            <ArtEnvelope class="play-sway -ml-6 w-20 sm:w-36" :style="{ '--pace': '8.5s' }" />
          </div>
          <ArtCat class="hidden h-16 sm:block" />
          <ArtCandle class="h-20 sm:h-32" />
          <ArtPlant class="h-24 sm:h-40" />
        </div>
        <div class="h-2 rounded-full bg-inverted" />
      </div>
    </section>

    <section aria-label="A letter" class="band bg-muted px-4 py-16 sm:py-24">
      <div class="play-rise mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div class="flex items-end justify-between gap-4">
          <p class="font-mono text-xs tracking-wide text-muted uppercase">
            Postmarked Monday · arrived Thursday
          </p>
          <ArtStamp seed="plums" class="h-14 shrink-0" />
        </div>
        <LetterPaper :doc="specimen" />
      </div>
    </section>

    <section class="mx-auto flex w-full max-w-2xl flex-col gap-10">
      <div class="play-rise">
        <h2 class="text-3xl text-highlighted sm:text-4xl">How a letter travels</h2>
        <p class="mt-3 font-serif text-lg text-toned">
          The wait is the point. It is what makes a slow reply polite.
        </p>
      </div>
      <!-- The envelope on the rail is only stuck to the middle of the window,
           so scrolling carries it from the desk to the mantel. No script. -->
      <div class="grid grid-cols-[4rem_1fr] gap-x-4 sm:grid-cols-[6rem_1fr] sm:gap-x-8">
        <div class="relative" aria-hidden="true">
          <div class="absolute inset-y-4 left-1/2 border-l-2 border-dashed border-accented" />
          <ArtEnvelope class="sticky top-1/2 z-10 w-full -rotate-6" />
        </div>
        <ol class="flex flex-col gap-10 sm:gap-16">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            class="play-rise flex flex-col gap-3 rounded-md border border-default bg-elevated p-6"
          >
            <div class="flex items-center justify-between gap-4">
              <span class="font-display text-4xl text-primary" aria-hidden="true">
                {{ index + 1 }}
              </span>
              <ArtPostbox v-if="index === 1" class="h-16" aria-hidden="true" />
              <ArtClock v-else-if="index === 2" class="h-16" aria-hidden="true" />
              <ArtStamp v-else seed="invite" class="h-14" />
            </div>
            <h3 class="text-xl text-highlighted">{{ step.title }}</h3>
            <p class="text-default">{{ step.description }}</p>
            <!-- The days going by between the postbox and the mantel. -->
            <ul
              v-if="index === 1"
              class="mt-2 flex flex-wrap gap-2"
              aria-label="The days it travels"
            >
              <li
                v-for="(day, n) in ['Mon', 'Tue', 'Wed', 'Thu']"
                :key="day"
                class="rounded-sm border px-2 py-1 font-mono text-xs uppercase"
                :class="
                  n === 3
                    ? 'border-(--line) bg-(--art-blush) text-highlighted'
                    : 'border-default text-muted'
                "
              >
                {{ day }}
              </li>
            </ul>
          </li>
        </ol>
      </div>
      <p class="play-rise">
        <ULink to="/how/letters" class="text-primary underline underline-offset-2">
          The whole journey, drawn out
        </ULink>
      </p>
    </section>

    <section class="band bg-muted px-4 py-16 sm:py-24">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <div class="play-rise">
          <h2 class="text-3xl text-highlighted sm:text-4xl">What it leaves out</h2>
          <p class="mt-3 font-serif text-lg text-default">
            No streaks, no nudges to write, nothing to keep up with.
          </p>
        </div>
        <dl class="grid gap-6 sm:grid-cols-2">
          <div
            v-for="promise in promises"
            :key="promise.title"
            class="play-rise flex flex-col gap-2 rounded-md border border-default bg-elevated p-6"
          >
            <dt class="font-display text-xl text-highlighted">{{ promise.title }}</dt>
            <dd class="text-default">{{ promise.description }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div class="play-rise">
        <h2 class="text-3xl text-highlighted sm:text-4xl">A house, not a feed</h2>
        <p class="mt-3 font-serif text-lg text-toned">
          Everything has a place, and each place says who can read what is in it.
        </p>
      </div>
      <dl class="grid gap-6 sm:grid-cols-3">
        <div
          v-for="place in house"
          :key="place.title"
          class="play-rise flex flex-col gap-3 rounded-md border border-default bg-elevated p-6"
        >
          <component :is="place.art" class="h-16 self-start" />
          <dt class="font-display text-xl text-highlighted">{{ place.title }}</dt>
          <dd class="text-default">{{ place.description }}</dd>
        </div>
      </dl>
      <!-- One page for each kind of mantel and each thing they share. -->
      <nav aria-label="How it works" class="play-rise flex flex-col gap-4">
        <h3 class="text-xl text-highlighted">How each part works</h3>
        <ul class="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <li v-for="page in howPages" :key="page.path">
            <ULink :to="page.path" class="text-primary underline underline-offset-2">
              {{ page.title }}
            </ULink>
          </li>
        </ul>
      </nav>
    </section>

    <section class="band bg-paper-cream px-4 py-16 sm:py-24">
      <div class="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <ArtPostbox class="play-rise h-28" />
        <h2 class="text-3xl text-highlighted sm:text-4xl">Write to someone</h2>
        <p class="font-serif text-lg text-default">
          Writing to friends is free. The code is public, so what we say about privacy can be
          checked.
        </p>
        <UButton :to="loggedIn ? '/mantel' : '/auth/sign-up'" size="lg">
          {{ loggedIn ? 'Open your mantel' : 'Start writing' }}
        </UButton>
      </div>
    </section>
  </div>
</template>
