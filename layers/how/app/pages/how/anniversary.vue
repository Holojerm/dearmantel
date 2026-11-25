<script setup lang="ts">
// How anniversary letters work: a couple's mantel, a printed write link, a
// guest who writes without an account, and the day the letters open. The cap
// named below is GUEST_LETTERS_MAX in layers/letters/shared/utils/guest.ts.
definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.8',
    title: 'Anniversary letters',
    summary:
      'How wedding guests write to a couple from a printed card without an account, how the card checks the couple’s key, and how every letter stays sealed until the first anniversary.',
  },
})

const limits = [
  {
    title: 'It closes',
    description:
      'The couple sets the last day guests can write: a month from the day the link is made, unless they choose another.',
  },
  {
    title: 'It has a cap',
    description:
      'One link takes up to 300 letters, because a printed card can be photographed by anyone.',
  },
  {
    title: 'It can be replaced',
    description:
      'The couple can make a new link at any time. The old one then takes no more letters.',
  },
  {
    title: 'A guest cannot change a letter',
    description:
      'No account is made, so there is nothing to sign in to. The guest can save a copy to their own device as they finish, and that is the only chance.',
  },
]

useSeo({
  title: 'Anniversary letters',
  description:
    'Wedding guests write to a couple from a card on the table, with no account. Every letter stays sealed until the first anniversary.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'Anniversary letters', path: '/how/anniversary' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">Anniversary letters</h1>
      <p class="font-serif text-lg text-toned">
        Guests write to a couple on the wedding day, from a card on the table. Nobody reads a word
        until the first anniversary.
      </p>
      <WhoReads encrypted>
        Only the couple can read a guest’s letter, and not before the day it opens.
      </WhoReads>
    </template>

    <HowScene title="A card on the table">
      <template #figure>
        <HowRoute from="At the wedding" to="Maya and Theo’s mantel">
          <template #from><ArtCard class="h-20" /></template>
          <ArtEnvelope />
          <template #to>
            <HowShelf><ArtCandle class="h-14" /><ArtPlant class="h-14" /></HowShelf>
          </template>
        </HowRoute>
      </template>
      <p>
        A couple opens an anniversary mantel and chooses two days: the last day guests can write,
        and the day the letters open. They get one link to print, as an address or as a square code
        on a card.
      </p>
      <p>The mantel has a key of its own, made in the couple’s browser. We never hold it.</p>
    </HowScene>

    <HowScene title="A guest writes, with no account">
      <template #figure>
        <div class="grid grid-cols-3 gap-3">
          <HowZone label="The guest’s phone">
            <ArtSheet class="h-16" />
            <template #note>Written and locked here.</template>
          </HowZone>
          <HowZone label="Our server">
            <ArtSheet kind="scrambled" class="play-appear h-16" :style="along(24, 38)" />
            <template #note>Kept, unreadable.</template>
          </HowZone>
          <HowZone label="The couple">
            <ArtSheet class="play-appear h-16" :style="along(38, 52)" />
            <template #note>Read on the day.</template>
          </HowZone>
        </div>
      </template>
      <p>
        The guest scans the card, writes their name and a letter, and adds one photo if they like.
        Their phone encrypts all of it to the couple’s key before it is sent.
      </p>
      <p>
        The guest’s name is inside the letter, so we do not learn it. We learn when a letter was
        sent and how large it is.
      </p>
    </HowScene>

    <HowScene title="The card checks the key">
      <template #figure>
        <div class="grid grid-cols-2 gap-3">
          <HowZone label="Printed on the card">
            <ArtCard class="h-16" />
            <template #note>A fingerprint of the couple’s key, after the # sign.</template>
          </HowZone>
          <HowZone label="Handed over by our server">
            <ArtKey tone="kraft" class="play-appear w-16" :style="along(28, 46)" />
            <template #note>It has to match, or the page stops.</template>
          </HowZone>
        </div>
      </template>
      <p>
        The link carries a fingerprint of the couple’s key after the # sign. Browsers never send
        that part of an address to a server, so we cannot change it.
      </p>
      <p>
        Before it shows anything to write on, the guest’s page checks the key we hand it against the
        fingerprint on the card. A key that does not match stops the page.
      </p>
    </HowScene>

    <HowScene title="Sealed until the anniversary">
      <template #figure>
        <div class="mx-auto grid max-w-md grid-cols-[2fr_1fr] items-end gap-6">
          <HowShelf label="Maya and Theo’s mantel">
            <ArtEnvelope class="play-appear w-14 -rotate-3" :style="along(22, 32)" />
            <ArtEnvelope class="play-appear -ml-4 w-14" :style="along(28, 38)" />
            <ArtEnvelope class="play-appear -ml-4 w-14 rotate-3" :style="along(34, 44)" />
          </HowShelf>
          <div class="flex flex-col items-center gap-2">
            <ArtLeaf day="14" month="JUN" year="2027" class="h-16" />
            <HowLabel>They open</HowLabel>
          </div>
        </div>
      </template>
      <p>
        A guest’s letter does not travel, because a guest has no city. It arrives on the couple’s
        mantel on their next mail day, sealed, and waits there with the others.
      </p>
      <p>
        Until the day they chose, we hand a letter to nobody, the couple included. From that day
        they can open the letters whenever they like, on a Sunday too: opening is not post.
      </p>
    </HowScene>

    <HowScene title="A link on a printed card">
      <dl class="flex flex-col gap-5">
        <div v-for="limit in limits" :key="limit.title" class="flex flex-col gap-1">
          <dt class="font-display text-xl text-highlighted">{{ limit.title }}</dt>
          <dd>{{ limit.description }}</dd>
        </div>
      </dl>
    </HowScene>
  </HowPage>
</template>
