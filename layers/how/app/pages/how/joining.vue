<script setup lang="ts">
// What someone who has been invited does, start to finish. The four steps
// are the ones the layout counts (the LettersSignUpSteps component).
definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.7',
    title: 'Joining from an invitation',
    summary:
      'What to do when someone invites you to Dear Mantel: the email, four short sign-up steps including a recovery code to keep, and your first letter.',
  },
})

const steps = [
  { n: 1, label: 'Your email', note: 'Type it, and we send a link.' },
  { n: 2, label: 'A way in', note: 'Open the link. Choose Face ID or a password.' },
  { n: 3, label: 'Your code', note: 'Print it or write it down.' },
  { n: 4, label: 'Name and city', note: 'What to call you, and where post goes.' },
]

const LINK = 'text-primary underline underline-offset-2'

useSeo({
  title: 'Joining from an invitation',
  description:
    'Someone invited you to write letters. Here is what the email is, the four steps to an account, and how to send your first letter.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'Joining from an invitation', path: '/how/joining' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">Joining from an invitation</h1>
      <p class="font-serif text-lg text-toned">
        Someone you know would like to write to you. It takes a few minutes to say yes, and after
        that nothing here is in a hurry.
      </p>
    </template>

    <HowScene title="An email from someone you know">
      <template #figure>
        <HowRoute from="Ann" to="You">
          <template #from>
            <HowShelf><ArtPlant class="h-14" /></HowShelf>
          </template>
          <ArtSheet class="w-9" />
          <template #to>
            <HowShelf><ArtClock class="h-14" /></HowShelf>
          </template>
        </HowRoute>
      </template>
      <p>
        The invitation is one email from us with fixed wording. It names the person who invited you,
        and it carries no letter and no note. Its link is good for 30 days.
      </p>
      <p>
        The link opens a page that says what you are being invited to: to write with one person, to
        join a family, to write to a child’s mantel, or to get news of a child. Accepting is your
        yes. Nothing happens unless you press it.
      </p>
    </HowScene>

    <HowScene title="Four short steps">
      <template #figure>
        <ol class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <li
            v-for="step in steps"
            :key="step.n"
            class="play-ink flex flex-col items-center gap-2 rounded-md border border-(--line) bg-(--art-paper) px-2 py-4 text-center"
            :style="along(16 + step.n * 7, 23 + step.n * 7)"
          >
            <span class="font-display text-3xl text-primary">{{ step.n }}</span>
            <HowLabel>{{ step.label }}</HowLabel>
            <span class="text-xs text-muted">{{ step.note }}</span>
          </li>
        </ol>
      </template>
      <p>
        You need an account, because a letter is locked to its reader’s own key. There are four
        pages, and each says which step it is.
      </p>
      <p>
        The third is the one to take care over. It shows your recovery code once: the spare key to
        your letters. Print it or write it down before you go on.
        <ULink to="/how/keys" :class="LINK">Keys and the recovery code</ULink>
        says why it matters.
      </p>
      <p>
        Your city is how the post knows how far a letter has to travel. Mail comes every day but
        Sunday, at ten in the morning, unless you change it.
      </p>
    </HowScene>

    <HowScene title="Your first letter">
      <template #figure>
        <HowRoute from="Your desk" to="Collected at 5 pm">
          <template #from><ArtSheet class="h-16" /></template>
          <ArtEnvelope />
          <template #to><ArtPostbox class="h-20" /></template>
        </HowRoute>
      </template>
      <p>
        When you have finished, the invitation is accepted and you are given a sheet of paper for
        the person who invited you. Write as much or as little as you like, then seal it.
      </p>
      <p>
        It is collected at five in the afternoon and takes a few days to arrive. You can take it
        back until it is collected.
      </p>
    </HowScene>

    <HowScene title="After that, it is slow">
      <template #figure>
        <div class="mx-auto max-w-xs">
          <HowShelf label="Your mantel, on a day with no post">
            <ArtClock class="h-14" />
            <ArtCat class="h-10" />
            <ArtPlant class="h-14" />
          </HowShelf>
        </div>
      </template>
      <p>
        There is nothing to keep up with. On a day a letter arrives you get one email that says so,
        and on other days you hear nothing. Nobody can see whether you have opened a letter, or
        when.
      </p>
      <p>
        If you lose the email, make an account with the address it was sent to. Invitations to that
        address are listed for you under People.
      </p>
    </HowScene>
  </HowPage>
</template>
