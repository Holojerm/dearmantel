<script setup lang="ts">
// Who can read what: the encryption drawn out, what the server stores, and
// where the product is not encrypted. It must agree with the privacy page's
// letters section (the LettersPrivacy component); change them together.
definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.7',
    title: 'Who can read what',
    summary:
      'What is end-to-end encrypted on Dear Mantel and what is not: letters are locked in the browser, the server stores who writes to whom and when, and the family room is not encrypted.',
  },
})

const things = [
  {
    what: 'A letter: its words, its paper and ink, its photo',
    who: 'You and the people it is written to',
    encrypted: true,
  },
  { what: 'A draft', who: 'Only you', encrypted: true },
  {
    what: 'A letter on a child’s mantel',
    who: 'Its keepers, and nobody before the day it is sealed until',
    encrypted: true,
  },
  {
    what: 'A guest’s letter to a couple',
    who: 'The couple, from the day it opens',
    encrypted: true,
  },
  { what: 'News of a child', who: 'The people its keepers invited', encrypted: true },
  {
    what: 'The family room: photos, where people are, the gazette',
    who: 'Everyone in the family, and we could',
    encrypted: false,
  },
  {
    what: 'Who writes to whom, and the days a letter is sealed and due',
    who: 'We can, because the post cannot run without them',
    encrypted: false,
  },
  {
    what: 'Your city, your mail days and your hour',
    who: 'We can. We store the city you chose, never your location',
    encrypted: false,
  },
]

const quiet = [
  {
    title: 'No receipts',
    description:
      'We record when a letter is delivered and first opened so your own mantel can show it. That is never shown to the person who wrote to you, or to anyone else.',
  },
  {
    title: 'Nothing early',
    description: 'A reader sees nothing about a letter before the morning it arrives.',
  },
  {
    title: 'No names in the notice',
    description: 'The email that says something arrived names nobody and counts nothing.',
  },
  {
    title: 'No view for us',
    description:
      'There is no screen on our side that shows letters, and nothing taken from a letter goes into our logs or error reports.',
  },
]

const LINK = 'text-primary underline underline-offset-2'

useSeo({
  title: 'Who can read what',
  description:
    'What Dear Mantel encrypts and what it does not: letters are locked in your browser, and the family room is shared and says so.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'Who can read what', path: '/how/who-reads' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">Who can read what</h1>
      <p class="font-serif text-lg text-toned">
        Letters are encrypted so that we cannot read them. The family room is not, and says so. This
        page draws the difference, and names what the encryption does not do.
      </p>
    </template>

    <HowScene title="Locked before it leaves">
      <template #figure>
        <div class="grid grid-cols-3 gap-3">
          <HowZone label="Your browser">
            <ArtSheet class="h-16" />
            <template #note>Written and locked here.</template>
          </HowZone>
          <HowZone label="Our server">
            <ArtSheet kind="scrambled" class="play-appear h-16" :style="along(24, 38)" />
            <template #note>Stored, unreadable.</template>
          </HowZone>
          <HowZone label="Ann’s browser">
            <ArtSheet class="play-appear h-16" :style="along(38, 52)" />
            <template #note>Opened with her key.</template>
          </HowZone>
        </div>
      </template>
      <p>
        A letter is encrypted in your browser before it is saved, under a key made for that one
        letter. Our servers store the result and hold nothing that opens it: not the words, not the
        paper and ink you chose, not the name you signed, not the photo.
      </p>
      <p>
        A photo is made smaller in your browser first, which also removes where and when it was
        taken.
      </p>
    </HowScene>

    <HowScene title="A key for each letter, a copy for each reader">
      <template #figure>
        <div class="flex flex-col items-center gap-5">
          <div class="flex flex-col items-center gap-2">
            <ArtKey tone="paper" class="w-16" />
            <HowLabel>This letter’s key</HowLabel>
          </div>
          <div class="grid w-full grid-cols-3 gap-3">
            <HowZone label="Locked to your key">
              <ArtKey class="play-appear w-14" :style="along(22, 34)" />
            </HowZone>
            <HowZone label="Locked to Ann’s key">
              <ArtKey class="play-appear w-14" :style="along(30, 42)" />
            </HowZone>
            <HowZone label="Dear Mantel">
              <template #note>No copy we can open.</template>
            </HowZone>
          </div>
        </div>
      </template>
      <p>
        The letter’s key is locked once for each reader, to that person’s own key, and to no one
        else’s. You are one of the readers, which is how you can open what you wrote. A letter to a
        family gets one locked copy for each person in it.
      </p>
      <p>
        Each person’s own key is made on their device.
        <ULink to="/how/keys" :class="LINK">Keys and the recovery code</ULink>
        says how it is kept.
      </p>
    </HowScene>

    <HowScene title="Encrypted, and not">
      <div class="relative overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            What is encrypted and who can read it
          </caption>
          <thead>
            <tr class="border-b border-default text-muted">
              <th scope="col" class="py-2 pr-3 font-normal">What</th>
              <th scope="col" class="py-2 pr-3 font-normal">Who can read it</th>
              <th scope="col" class="py-2 font-normal">Encrypted</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="thing in things"
              :key="thing.what"
              class="border-b border-default align-top last:border-b-0"
            >
              <th scope="row" class="py-3 pr-3 font-normal text-highlighted">{{ thing.what }}</th>
              <td class="py-3 pr-3">{{ thing.who }}</td>
              <td class="py-3 font-mono text-xs whitespace-nowrap text-toned uppercase">
                {{ thing.encrypted ? 'Encrypted' : 'Not encrypted' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We can also see roughly how long a letter is, whether it has a photo, and how large that
        file is.
      </p>
    </HowScene>

    <HowScene title="What this does not protect against">
      <p>
        Encryption protects your letters from a leak of our database, from our backups and from
        anyone browsing our tables. It does not protect you from us shipping altered code to your
        browser, and we do not yet offer a way to check that the key we hand you is really your
        correspondent’s.
      </p>
      <p>The source is public, so the first of those can be checked.</p>
      <p>
        A password can be guessed. Someone who stole our database could try passwords against the
        locked copy of your key, slowly, so a long password that you use nowhere else is what
        protects it.
      </p>
    </HowScene>

    <HowScene title="What nobody is told">
      <dl class="flex flex-col gap-5">
        <div v-for="item in quiet" :key="item.title" class="flex flex-col gap-1">
          <dt class="font-display text-xl text-highlighted">{{ item.title }}</dt>
          <dd>{{ item.description }}</dd>
        </div>
      </dl>
      <p>
        The
        <ULink to="/privacy" :class="LINK">privacy page</ULink>
        says all of this in full.
      </p>
    </HowScene>
  </HowPage>
</template>
