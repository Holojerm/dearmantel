<script setup lang="ts">
// The letters side of a mantel someone keeps: where its post arrives, how
// letters to it open, writing to it and, for a child's mantel, from it, and
// what has arrived. A letter sealed until a day shows that day and nothing else.
// Once its keepers close it, only what has arrived is shown.
import { ALL_MAIL_DAYS } from '#layers/post/shared/utils/mail-days'

import type { KeptItem, KeptPost } from '../../../shared/utils/kept'
import type { OpeningsView } from '../../../shared/utils/openings'

const props = defineProps<{
  mantelId: string
  name: string
  kind: 'child' | 'anniversary'
  closed?: boolean
}>()

interface City {
  id: number
  name: string
  region: string | null
  country: string
}

const post = ref<KeptPost | null>(null)
const letters = ref<KeptItem[]>([])
const sent = ref(0)
const openings = ref<OpeningsView | null>(null)
const writers = ref<{ userId: string; name: string; keeper: boolean }[]>([])
const invited = ref<{ id: string; email: string }[]>([])
const writerEmail = ref('')
const inviteLink = ref<string | null>(null)
const loaded = ref(false)
const failure = ref<string | null>(null)
const busy = ref(false)
const query = ref('')
const options = ref<City[]>([])

const message = (error: unknown) =>
  (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'

async function load() {
  try {
    const view = await $fetch<{
      post: typeof post.value
      letters: KeptItem[]
      sent: number
      writers: typeof writers.value
      invited: typeof invited.value
      openings: OpeningsView
    }>('/api/letters/kept/list', { method: 'POST', body: { mantelId: props.mantelId } })
    openings.value = view.openings
    post.value = view.post
    letters.value = view.letters
    sent.value = view.sent
    writers.value = view.writers
    invited.value = view.invited
  } catch (error) {
    failure.value = message(error)
  } finally {
    loaded.value = true
  }
}
onMounted(load)

let latest = 0
watch(query, async (text) => {
  const request = (latest += 1)
  if (text.trim().length < 2) {
    options.value = []
    return
  }
  const found = await $fetch<{ cities: City[] }>('/api/post/cities', { query: { q: text } })
  if (request === latest) options.value = found.cities
})
const place = (city: City) => [city.name, city.region, city.country].filter(Boolean).join(', ')

async function choose(city: City) {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/kept/post', {
      method: 'PUT',
      body: {
        mantelId: props.mantelId,
        cityId: city.id,
        mailDays: ALL_MAIL_DAYS,
        deliveryHour: 10,
      },
    })
    query.value = ''
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

async function write() {
  busy.value = true
  failure.value = null
  try {
    const made = await $fetch<{ correspondenceId: string }>('/api/letters/kept/write', {
      method: 'POST',
      body: { mantelId: props.mantelId },
    })
    await navigateTo({ path: '/write', query: { to: made.correspondenceId } })
  } catch (error) {
    failure.value = message(error)
    busy.value = false
  }
}

async function invite() {
  busy.value = true
  failure.value = null
  inviteLink.value = null
  try {
    const sent = await $fetch<{ link: string }>('/api/letters/invites', {
      method: 'POST',
      body: { email: writerEmail.value, mantelId: props.mantelId },
    })
    inviteLink.value = sent.link
    writerEmail.value = ''
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

async function writerAction(body: Record<string, string>) {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/kept/writers', {
      method: 'POST',
      body: { ...body, mantelId: props.mantelId },
    })
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

// A return is the mantel's own letter that could not be delivered.
function title(letter: KeptItem): string {
  if (letter.kind === 'return') {
    return letter.name
      ? `Returned: ${props.name}'s letter to ${letter.name}`
      : `Returned: ${props.name}'s letter`
  }
  return letter.name ? `From ${letter.name}` : letter.guest ? 'A guest letter' : 'A letter'
}

function readLabel(letter: KeptItem): string {
  if (letter.kind === 'return') {
    return `Read the returned letter${letter.name ? ` to ${letter.name}` : ''}`
  }
  return `Read the letter${letter.name ? ` from ${letter.name}` : ''}`
}

const canCopy = computed(
  () => sent.value > 0 || letters.value.some((letter) => letter.opened && !letter.sealed),
)

function describe(letter: KeptItem): string {
  if (letter.sealed && letter.opensOn) return `Sealed. Opens ${yearDay(letter.opensOn)}.`
  const postmark = letter.postmark ? `Postmarked ${longDay(letter.postmark)}.` : ''
  return letter.opened ? postmark : `Unopened. ${postmark}`.trim()
}
</script>

<template>
  <section aria-labelledby="kept-letters-heading" class="flex flex-col gap-4">
    <h2 id="kept-letters-heading" class="text-xl text-highlighted">Letters</h2>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <template v-if="loaded && !post && !closed">
      <p class="text-muted">
        Before anyone can write to {{ name }}, choose the city this mantel's post arrives in.
        Letters travel to it as they would to a person there.
      </p>
      <UFormField label="The mantel's city" name="mantel-city" help="Start typing and pick it.">
        <UInput v-model="query" autocomplete="off" size="lg" class="w-full" />
        <ul v-if="options.length" class="mt-2 flex flex-col divide-y divide-default">
          <li v-for="city in options" :key="city.id">
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-start"
              :loading="busy"
              @click="choose(city)"
            >
              {{ place(city) }}
            </UButton>
          </li>
        </ul>
      </UFormField>
    </template>

    <template v-else-if="post || closed">
      <LettersKeptPost v-if="post && !closed" :mantel-id="mantelId" :post="post" @changed="load" />
      <LettersMantelOpenings
        v-if="openings && !closed"
        :mantel-id="mantelId"
        :name="name"
        :openings="openings"
        @changed="load"
      />
      <UButton v-if="!closed" class="self-start" :loading="busy" @click="write">
        Write to {{ name }}
      </UButton>

      <p v-if="letters.length === 0" class="text-muted">Nothing has arrived yet.</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li
          v-for="letter in letters"
          :key="letter.letterId"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-highlighted">{{ title(letter) }}</p>
            <p class="text-sm text-muted">{{ describe(letter) }}</p>
          </div>
          <UButton
            v-if="!letter.sealed"
            size="sm"
            variant="outline"
            color="neutral"
            :to="`/kept/${mantelId}/${letter.letterId}`"
            :aria-label="readLabel(letter)"
          >
            Read
          </UButton>
          <UIcon v-else name="i-lucide-lock" class="size-5 text-dimmed" aria-hidden="true" />
        </li>
      </ul>

      <LettersKeptArchive v-if="canCopy" :mantel-id="mantelId" :name="name" :wrote="sent > 0" />

      <LettersMantelWrites v-if="kind === 'child' && !closed" :mantel-id="mantelId" :name="name" />

      <template v-if="!closed">
        <h3 class="mt-4 text-lg text-highlighted">Who writes to {{ name }}</h3>
        <p class="text-sm text-muted">
          Its keepers can write from here. Ask grandparents, godparents or friends to write too:
          each gets their own invitation, and none of them can read what the others wrote. If you
          stop someone, their letters still on the way go back to them, and what has arrived stays.
        </p>
        <ul v-if="writers.length || invited.length" class="flex flex-col divide-y divide-default">
          <li
            v-for="writer in writers"
            :key="writer.userId"
            class="flex items-center justify-between gap-4 py-2"
          >
            <span class="text-highlighted">{{ writer.name }}</span>
            <UButton
              v-if="!writer.keeper"
              size="sm"
              variant="ghost"
              color="neutral"
              :disabled="busy"
              :aria-label="`Stop ${writer.name} writing to ${name}`"
              @click="writerAction({ action: 'stop', writerId: writer.userId })"
            >
              Stop
            </UButton>
            <span v-else class="text-sm text-muted">Keeper</span>
          </li>
          <li
            v-for="waiting in invited"
            :key="waiting.id"
            class="flex items-center justify-between gap-4 py-2"
          >
            <span class="text-muted">{{ waiting.email }} · invited</span>
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              :disabled="busy"
              :aria-label="`Withdraw the invitation to ${waiting.email}`"
              @click="writerAction({ action: 'withdraw', inviteId: waiting.id })"
            >
              Withdraw
            </UButton>
          </li>
        </ul>
        <form class="flex flex-col gap-3" @submit.prevent="invite">
          <UFormField label="Invite a writer by email" name="writer-email">
            <UInput
              v-model="writerEmail"
              type="email"
              size="lg"
              class="w-full"
              autocomplete="off"
            />
          </UFormField>
          <UButton type="submit" class="self-start" :loading="busy" :disabled="!writerEmail.trim()">
            Send invitation
          </UButton>
        </form>
        <p v-if="inviteLink" class="text-sm text-muted">
          Sent. You can also pass this link on yourself:
          <span class="break-all text-default" data-testid="writer-invite-link">{{
            inviteLink
          }}</span>
        </p>
      </template>
    </template>
  </section>
</template>
