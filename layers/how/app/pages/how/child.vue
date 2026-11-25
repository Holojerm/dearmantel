<script setup lang="ts">
// How a child's mantel works: who keeps it, sealed letters, the key and its
// copies, the vote, the recovery code, news of the child, and the handover.
// The wait named below is RECOVERY_WAIT_DAYS in
// layers/keys/shared/utils/mantel-format.ts.
definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.8',
    title: 'A child’s mantel',
    summary:
      'How letters are kept for a child who cannot read yet: two keepers, letters sealed until a day, a key we never hold, a printed recovery code, news of the child, and the handover.',
  },
})

const lost = [
  {
    title: 'A keeper forgets a password or loses a phone',
    description:
      'Their own passkey or recovery code opens their account again. Nothing changes for the mantel.',
  },
  {
    title: 'A keeper cannot be reached',
    description:
      'Whoever holds the mantel’s printed code can ask to become a keeper. Every keeper is emailed, and it takes effect after 30 days unless one of them cancels.',
  },
  {
    title: 'A keeper leaves',
    description:
      'We delete their copy of the key. They were given the key and may have kept it, so the keepers who remain are asked to change it, which one of them does in their browser.',
  },
  {
    title: 'Every keeper and the code are lost',
    description:
      'The letters are lost. Nobody can open them, us included: we do not have a copy of the code and cannot make one.',
  },
]

useSeo({
  title: 'A child’s mantel',
  description:
    'Letters kept for a child who cannot read yet: two keepers, letters sealed until a day, a key we never hold, and a handover.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'A child’s mantel', path: '/how/child' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">A child’s mantel</h1>
      <p class="font-serif text-lg text-toned">
        A mantel for someone who cannot read yet. The people who love them write now. Some letters
        are read aloud this week, and some wait for a birthday years away.
      </p>
      <WhoReads encrypted>
        Only a mantel’s keepers can open its letters, and a sealed letter opens for nobody before
        its day.
      </WhoReads>
    </template>

    <HowScene title="Kept by two people, written to by many">
      <template #figure>
        <HowRoute from="People the keepers invite" to="Leo’s mantel">
          <template #from>
            <div class="flex items-end">
              <ArtEnvelope class="w-12 -rotate-6" />
              <ArtEnvelope class="-ml-6 w-12 rotate-3" />
            </div>
          </template>
          <ArtEnvelope />
          <template #to>
            <HowShelf><ArtCandle class="h-14" /></HowShelf>
          </template>
        </HowRoute>
      </template>
      <p>
        The child has no account. Two people keep the mantel for them: its keepers, usually the
        parents. Keepers invite the people who may write to it, such as grandparents and godparents,
        and they write to it themselves.
      </p>
      <p>
        The mantel has a city and mail days of its own, so a letter to it travels and arrives like
        any other. A writer who is not a keeper reads nothing on the mantel, and no writer sees
        another’s letters. A keeper can also write back from the mantel, as the child.
      </p>
    </HowScene>

    <HowScene title="Read now, or sealed until a day">
      <template #figure>
        <div class="grid grid-cols-2 gap-3">
          <HowZone label="Open">
            <ArtSheet class="h-16" />
            <template #note>Read to Leo when it arrives.</template>
          </HowZone>
          <HowZone label="Sealed">
            <ArtEnvelope class="w-16" />
            <ArtLeaf
              day="14"
              month="JUN"
              year="2044"
              class="play-appear h-16"
              :style="along(25, 45)"
            />
            <template #note>Opens 14 June 2044.</template>
          </HowZone>
        </div>
      </template>
      <p>
        The keepers decide what the mantel takes: letters to read when they arrive, letters sealed
        until days the keepers set, such as an eighteenth birthday, or both. A writer picks among
        those. A writer cannot make up a day of their own.
      </p>
      <p>
        A sealed letter arrives like any other and stands on the mantel showing its postmark and the
        day it opens. Until that day we hand its text, its photo and its key to nobody, keepers
        included. The writer keeps their own copy.
      </p>
      <p>
        This is a promise kept by our servers together with a key we do not have. It is not a
        mathematical time lock: to read one early, both we and a keeper would have to break the
        rules.
      </p>
    </HowScene>

    <HowScene title="Who holds the key">
      <template #figure>
        <div class="flex flex-col items-center gap-5">
          <div class="flex flex-col items-center gap-2">
            <ArtKey tone="kraft" class="w-20" />
            <HowLabel>The mantel’s key, made in a keeper’s browser</HowLabel>
          </div>
          <div class="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            <HowZone label="Keeper one">
              <ArtKey tone="kraft" class="play-appear w-14" :style="along(22, 32)" />
            </HowZone>
            <HowZone label="Keeper two">
              <ArtKey tone="kraft" class="play-appear w-14" :style="along(29, 39)" />
            </HowZone>
            <HowZone label="Printed code">
              <ArtSheet kind="code" class="play-appear h-14" :style="along(36, 46)" />
            </HowZone>
            <HowZone label="Dear Mantel">
              <template #note>No copy we can open.</template>
            </HowZone>
          </div>
        </div>
      </template>
      <p>
        A child’s mantel has a key of its own, made in the browser of the keeper who opens it.
        Letters are locked to that key. The key exists only as copies: one for each keeper, locked
        to that keeper’s own key, and one locked under a recovery code.
      </p>
      <p>
        The recovery code is shown once, to print and keep with the child’s papers. We hold no copy
        of the key that we can open, and we never see the code.
      </p>
    </HowScene>

    <HowScene title="Two keepers, and both must agree">
      <template #figure>
        <div class="grid grid-cols-3 gap-3">
          <HowZone label="Keeper one agrees">
            <ArtKey tone="kraft" class="play-appear w-14" :style="along(22, 34)" />
          </HowZone>
          <HowZone label="Keeper two agrees">
            <ArtKey tone="kraft" class="play-appear w-14" :style="along(30, 42)" />
          </HowZone>
          <HowZone label="Then it changes">
            <ArtStamp seed="agreed" class="play-appear h-14" :style="along(40, 52)" />
          </HowZone>
        </div>
      </template>
      <p>
        Adding or removing a keeper, changing what is sealed, moving the handover day and closing
        the mantel each need more than half of the keepers to agree. With two keepers that means
        both, so neither can remove the other or bring in a third alone.
      </p>
      <p>
        A disagreement leaves everything as it is. No letter is lost or opened because two people
        could not agree.
      </p>
    </HowScene>

    <HowScene title="If something is lost">
      <template #figure>
        <div class="grid grid-cols-3 gap-3">
          <HowZone label="The printed code">
            <ArtSheet kind="code" class="h-14" />
          </HowZone>
          <HowZone label="Thirty days">
            <ArtClock class="h-14" />
            <template #note>Every keeper is emailed. Any of them can cancel.</template>
          </HowZone>
          <HowZone label="A new keeper">
            <ArtKey tone="kraft" class="play-appear w-14" :style="along(35, 50)" />
          </HowZone>
        </div>
      </template>
      <dl class="flex flex-col gap-5">
        <div v-for="item in lost" :key="item.title" class="flex flex-col gap-1">
          <dt class="font-display text-xl text-highlighted">{{ item.title }}</dt>
          <dd>{{ item.description }}</dd>
        </div>
      </dl>
    </HowScene>

    <HowScene title="News of Leo">
      <template #figure>
        <div class="flex flex-col items-center gap-6">
          <div class="flex flex-col items-center gap-2">
            <ArtSheet class="h-16" />
            <HowLabel>A letter of news, from a keeper</HowLabel>
          </div>
          <div class="grid w-full grid-cols-3 gap-3">
            <HowShelf label="Grandma">
              <ArtEnvelope class="play-appear w-16" :style="along(22, 34)" />
            </HowShelf>
            <HowShelf label="Uncle Sam">
              <ArtEnvelope class="play-appear w-16" :style="along(30, 42)" />
            </HowShelf>
            <HowShelf label="Leo, if the writer says so">
              <ArtEnvelope class="play-appear w-16 opacity-50" :style="along(38, 50)" />
            </HowShelf>
          </div>
        </div>
      </template>
      <p>
        Keepers can write news of the child to people they invite, one invitation each. It is a
        letter like any other: encrypted, a copy for each reader, each on their own post.
      </p>
      <p>
        A reader cannot write in it or reply to it, and nobody who gets the news is told who else
        does. A copy goes to the child’s own mantel only when the letter’s writer says so.
      </p>
    </HowScene>

    <HowScene title="The day it becomes theirs">
      <template #figure>
        <div class="grid grid-cols-3 gap-3">
          <HowZone label="The day, set at the start">
            <ArtLeaf day="14" month="JUN" year="2044" class="h-16" />
          </HowZone>
          <HowZone label="The keepers’ copies">
            <ArtKey tone="kraft" class="play-leave w-12 opacity-20" :style="along(38, 52)" />
            <ArtKey tone="kraft" class="play-leave w-12 opacity-20" :style="along(38, 52)" />
            <template #note>Deleted.</template>
          </HowZone>
          <HowZone label="Leo’s own key">
            <ArtKey class="play-appear w-14" :style="along(24, 38)" />
            <template #note>Every letter, locked to it.</template>
          </HowZone>
        </div>
      </template>
      <p>
        A child’s mantel becomes the child’s on a day its keepers set when they opened it. From that
        day we email the address a keeper gave for the child, and the child makes an account of
        their own.
      </p>
      <p>
        A keeper’s browser then locks the mantel’s key to the child’s key, after the two of them
        compare a short code so that we cannot slip in a key of our own. The child’s browser locks
        every letter again to the child’s key. Then we delete the mantel’s key, every keeper’s copy
        and the recovery code’s copy.
      </p>
      <p>
        After that the letters are the child’s, on their own mantel. A letter sealed until a later
        day stays sealed until that day.
      </p>
    </HowScene>
  </HowPage>
</template>
