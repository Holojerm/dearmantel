<script setup lang="ts">
// The mantel: what has arrived. Unopened letters stand on the shelf as
// envelopes; opened ones are filed below it. A letter appears here on the mail
// day it is delivered, never before. DESIGN.md › Component behavior › The objects.
import type { MantelItem } from '../../shared/utils/mantel'

const NuxtLink = resolveComponent('NuxtLink')

definePageMeta({ middleware: ['auth', 'keys'] })

interface Kept {
  id: string
  kind: 'child' | 'anniversary'
  name: string
}
const KIND = { child: "A child's mantel", anniversary: 'Anniversary letters' } as const

const [{ data }, { data: keeping }] = await Promise.all([
  useFetch<{ items: MantelItem[] }>('/api/letters/mantel'),
  useFetch<{ mantels: Kept[]; offers: unknown[]; handovers: unknown[] }>('/api/mantels'),
])
const items = computed(() => data.value?.items ?? [])
const waiting = computed(() => items.value.filter((item) => !item.opened))
const opened = computed(() => items.value.filter((item) => item.opened))
const kept = computed(() => keeping.value?.mantels ?? [])
const asked = computed(() => (keeping.value?.offers ?? []).length > 0)
// A child's mantel waiting to be handed over to this person.
const keptForMe = computed(() => (keeping.value?.handovers ?? []).length > 0)
const yearDay = (on: string) =>
  new Date(`${on}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

function title(item: MantelItem): string {
  if (item.news) {
    return item.kind === 'return' ? `Returned: your news of ${item.news}` : `News of ${item.news}`
  }
  if (item.kind === 'return') {
    return item.name ? `Returned: your letter to ${item.name}` : 'Returned: your letter'
  }
  return item.name ? `From ${item.name}` : 'A letter'
}

useSeo({
  title: 'Your mantel',
  description: 'The letters that have arrived for you.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-10 py-8 sm:py-12">
    <h1 class="text-3xl text-highlighted">Your mantel</h1>
    <WelcomeNote />
    <PeopleInvitedBy />
    <ClientOnly><SecondWayIn /></ClientOnly>

    <section aria-labelledby="shelf-heading" class="flex flex-col gap-4">
      <h2 id="shelf-heading" class="font-sans text-sm tracking-normal text-muted">
        {{ waiting.length ? 'Unopened' : 'On the shelf' }}
      </h2>
      <!-- The mantel: a clock that tells the real time, whatever has arrived,
           and the cat when nothing has. DESIGN.md › Play › The mantel. -->
      <div>
        <div class="flex items-end gap-3 px-2">
          <!-- On a phone the letters need the shelf, so only the plant stays. -->
          <ArtClock class="h-16 shrink-0 sm:h-20" :class="{ 'hidden sm:block': waiting.length }" />
          <ul v-if="waiting.length" class="grid min-w-0 flex-1 grid-cols-2 items-end gap-3">
            <li
              v-for="(item, index) in waiting"
              :key="item.letterId"
              class="play-sway"
              :style="{ '--pace': `${6.4 + (index % 4) * 0.7}s` }"
            >
              <!-- The envelope. Its flap is the only "new" marker in the product.
                   One sealed until a day is not a link before that day. -->
              <component
                :is="item.sealedUntil ? 'div' : NuxtLink"
                :to="item.sealedUntil ? undefined : `/letter/${item.letterId}`"
                class="group relative flex aspect-4/3 flex-col justify-end gap-1 rounded-t-sm border border-b-0 border-(--line) bg-elevated p-3 transition-[translate] duration-200 ease-(--ease-spring) hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  class="absolute inset-x-0 top-0 h-1/3 w-full origin-top text-primary transition-[scale] duration-200 ease-(--ease-spring) group-hover:scale-y-75"
                >
                  <path
                    d="M0 0 L50 40 L100 0"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
                <ArtStamp :seed="item.letterId" class="absolute right-2 bottom-2 h-8" />
                <span class="pr-8 font-display text-lg/tight text-highlighted">{{
                  title(item)
                }}</span>
                <LetterPostmark v-if="item.postmark" :date="item.postmark" />
                <span v-if="item.sealedUntil" class="text-sm text-muted">
                  Sealed. Opens {{ yearDay(item.sealedUntil) }}.
                </span>
              </component>
            </li>
          </ul>
          <div v-else class="flex min-w-0 flex-1 justify-center">
            <ArtCat class="h-12 sm:h-14" />
          </div>
          <ArtCandle class="h-14 shrink-0 sm:h-16" :class="{ 'hidden sm:block': waiting.length }" />
          <ArtPlant class="h-14 shrink-0 sm:h-20" />
        </div>
        <div aria-hidden="true" class="h-1.5 rounded-full bg-inverted" />
      </div>

      <div v-if="items.length === 0" class="flex flex-col gap-3">
        <p class="font-serif text-lg text-toned">Nothing has arrived yet.</p>
        <p class="text-muted">
          Letters take a few days, and come in the morning on your mail days.
        </p>
        <LettersMantelBeginning />
      </div>
      <p v-else-if="waiting.length === 0" class="font-serif text-lg text-toned">
        Nothing is waiting to be opened.
      </p>
    </section>

    <section v-if="opened.length" aria-labelledby="opened-heading" class="flex flex-col gap-2">
      <h2 id="opened-heading" class="font-sans text-sm tracking-normal text-muted">Opened</h2>
      <ul class="flex flex-col divide-y divide-default">
        <li v-for="item in opened" :key="item.letterId">
          <NuxtLink
            :to="`/letter/${item.letterId}`"
            class="flex items-baseline justify-between gap-4 rounded-sm py-3 text-default hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span>{{ title(item) }}</span>
            <LetterPostmark v-if="item.postmark" :date="item.postmark" class="shrink-0" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <p v-if="keptForMe" class="font-serif text-lg text-toned">
      A mantel has been kept for you, and it is yours to take.
      <ULink to="/mantels" class="underline">Take it</ULink>.
    </p>

    <section v-if="kept.length || asked" aria-labelledby="kept-heading" class="flex flex-col gap-2">
      <h2 id="kept-heading" class="font-sans text-sm tracking-normal text-muted">
        Mantels you keep
      </h2>
      <p v-if="asked">
        You have been asked to keep a mantel.
        <ULink to="/mantels" class="underline">See who asked</ULink>.
      </p>
      <ul v-if="kept.length" class="flex flex-col divide-y divide-default">
        <li v-for="mantel in kept" :key="mantel.id">
          <NuxtLink
            :to="`/mantels/${mantel.id}`"
            class="flex items-baseline justify-between gap-4 rounded-sm py-3 text-default hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span>{{ mantel.name }}</span>
            <span class="shrink-0 text-sm text-muted">{{ KIND[mantel.kind] }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <div class="flex flex-col gap-2">
      <WhoReads encrypted> Letters are opened on your device. We cannot read them. </WhoReads>
      <p class="text-sm text-muted">
        <ULink to="/archive" class="underline">Keep a copy of your letters</ULink> on this device.
      </p>
    </div>
  </div>
</template>
