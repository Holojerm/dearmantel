<script setup lang="ts">
// How a person's key is kept: made on their device, held by the server only
// as locked copies, and what opens it again when something is lost. The
// unlock paths are layers/keys/app/utils/key-unlock.ts.
definePageMeta({
  publicPage: {
    changefreq: 'monthly',
    priority: '0.7',
    title: 'Keys and the recovery code',
    summary:
      'How the key that opens your letters is made on your device, kept as copies locked under your password, passkeys and recovery code, and what happens when one of those is lost.',
  },
})

const losses = [
  {
    lost: 'Your phone',
    then: 'Sign in on another device with your password, a passkey that is on it, or your recovery code. Your letters open there.',
  },
  {
    lost: 'Your password',
    then: 'A passkey or your recovery code opens your letters, and you can set a new password.',
  },
  {
    lost: 'Your recovery code',
    then: 'While you can still open your letters, make a new code. The old one stops working.',
  },
  {
    lost: 'All of them',
    then: 'We can let you back into your account by email. Nobody can open the letters again, us included.',
  },
]

const LINK = 'text-primary underline underline-offset-2'

useSeo({
  title: 'Keys and the recovery code',
  description:
    'The key that opens your letters is made on your device. We hold only locked copies, and your recovery code is the spare.',
  breadcrumb: [
    { name: 'How it works', path: '/how' },
    { name: 'Keys and the recovery code', path: '/how/keys' },
  ],
})
</script>

<template>
  <HowPage>
    <template #head>
      <h1 class="text-4xl text-highlighted sm:text-5xl">Keys and the recovery code</h1>
      <p class="font-serif text-lg text-toned">
        Your letters are locked with a key only you hold. That is why we cannot read them, and why
        there is one piece of paper worth keeping.
      </p>
    </template>

    <HowScene title="A key made on your device">
      <template #figure>
        <div class="grid grid-cols-2 gap-3">
          <HowZone label="Your device">
            <ArtKey class="w-16" />
            <template #note>The half that opens letters. It stays with you.</template>
          </HowZone>
          <HowZone label="Our server">
            <ArtKey tone="paper" class="play-appear w-16" :style="along(26, 44)" />
            <template #note>The half that lets people write to you.</template>
          </HowZone>
        </div>
      </template>
      <p>
        When you make an account, your browser makes a key in two halves. One half is public: we
        keep it so that other people’s browsers can lock letters to you. The other half opens those
        letters, and we never have it in a form we can use.
      </p>
    </HowScene>

    <HowScene title="Three locked copies">
      <template #figure>
        <div class="grid grid-cols-3 gap-3">
          <HowZone label="Your password">
            <ArtKey class="play-appear w-14" :style="along(22, 34)" />
          </HowZone>
          <HowZone label="Face ID or a passkey">
            <ArtKey class="play-appear w-14" :style="along(30, 42)" />
          </HowZone>
          <HowZone label="Your recovery code">
            <ArtSheet kind="code" class="play-appear h-14" :style="along(38, 50)" />
          </HowZone>
        </div>
      </template>
      <p>
        So that you can open your letters on another device, we keep copies of your key, each one
        locked. One is locked under your password, one under each passkey such as Face ID, and one
        under your recovery code. We have none of those three things, so we cannot open any of the
        copies.
      </p>
      <p>
        Signing in and opening letters are two steps. Most of the time one password or one glance
        does both. Some passkeys can only sign you in, and then you are asked for your password to
        open your letters.
      </p>
    </HowScene>

    <HowScene title="The recovery code">
      <template #figure>
        <div class="flex flex-col items-center gap-3">
          <ArtSheet kind="code" class="h-24" />
          <HowLabel>Shown once. Print it or write it down.</HowLabel>
        </div>
      </template>
      <p>
        The recovery code is shown once, when you make your account, and we do not keep a copy.
        Print it or write it down, and keep it where you keep a passport.
      </p>
      <p>
        If you lose your phone or forget your password, we can let you back into your account by
        email, but only this code can open your letters again.
      </p>
    </HowScene>

    <HowScene title="If you lose something">
      <div class="relative overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            What happens when something is lost
          </caption>
          <thead>
            <tr class="border-b border-default text-muted">
              <th scope="col" class="py-2 pr-3 font-normal">You lose</th>
              <th scope="col" class="py-2 font-normal">What happens</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="loss in losses"
              :key="loss.lost"
              class="border-b border-default align-top last:border-b-0"
            >
              <th scope="row" class="py-3 pr-3 font-normal whitespace-nowrap text-highlighted">
                {{ loss.lost }}
              </th>
              <td class="py-3">{{ loss.then }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        A letter you sent is not lost with your key. It belongs to the person who received it, and
        it is locked to their key too.
      </p>
    </HowScene>

    <HowScene title="On this device">
      <p>
        Once your letters are open on a device, it keeps the key until you sign out. On a new
        device, or after signing out, you are asked for your password, a passkey or your recovery
        code before any letter opens.
      </p>
      <p>
        A mantel kept for a child or a couple has a key and a printed code of its own.
        <ULink to="/how/child" :class="LINK">A child’s mantel</ULink>
        says who holds them.
      </p>
    </HowScene>
  </HowPage>
</template>
