<script setup lang="ts">
// Handing a child's mantel over, from a keeper's side: the day it becomes the
// child's (moved only by a vote), the address they are invited at (any one
// keeper, the others told), and on the day the fingerprint check before this
// browser wraps the mantel's key to them. The letters then move in the
// child's own browser.
import type { KeptMantel } from '../composables/useMantelKeys'

interface ChildHandover {
  handoverOn: string | null
  due: boolean
  email: string | null
  namedBy: string | null
  invited: boolean
  childId: string | null
  childName: string | null
  keyGiven: boolean
}

const props = defineProps<{
  mantel: KeptMantel & { name: string; childHandover: ChildHandover; keepers: unknown[] }
  canOpen: boolean | null
}>()
const emit = defineEmits<{ done: [] }>()

const mantelKeys = useMantelKeys()
const busy = ref(false)
const failure = ref<string | null>(null)
const proposed = ref(false)
const email = ref('')
const day = ref('')
const seat = ref<{ childId: string; publicKey: string; fingerprint: string | null } | null>(null)

const state = computed(() => props.mantel.childHandover)
const name = computed(() => props.mantel.name)
const only = computed(() => props.mantel.keepers.length === 1)
const child = computed(() => state.value.childName ?? name.value)
const longDay = (on: string) =>
  new Date(`${on}T12:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
const tomorrow = computed(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))

const message = (error: unknown) =>
  (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'

async function run(work: () => Promise<unknown>) {
  busy.value = true
  failure.value = null
  try {
    await work()
    emit('done')
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

const proposeDay = () =>
  run(async () => {
    const result = await $fetch<{ carried: boolean }>('/api/mantels/handover/date', {
      method: 'POST',
      body: { mantelId: props.mantel.id, on: day.value },
    })
    proposed.value = !result.carried
    day.value = ''
  })
const giveAddress = () =>
  run(async () => {
    await $fetch('/api/mantels/handover/name', {
      method: 'POST',
      body: { mantelId: props.mantel.id, email: email.value },
    })
    email.value = ''
  })
const giveKey = () =>
  run(async () => {
    if (!seat.value || !(await mantelKeys.giveToChild(props.mantel, seat.value))) {
      throw new Error('This device could not open the mantel to hand over its key.')
    }
  })

const waitingForKey = computed(
  () => state.value.due && Boolean(state.value.childId) && !state.value.keyGiven,
)
watch(
  () => [waitingForKey.value, props.canOpen, state.value.childId],
  async () => {
    seat.value = null
    if (waitingForKey.value && props.canOpen) {
      seat.value = await mantelKeys.childToSeat(props.mantel.id).catch(() => null)
    }
  },
  { immediate: true },
)
</script>

<template>
  <section aria-labelledby="handover-heading" class="flex flex-col gap-3">
    <h2 id="handover-heading" class="text-xl text-highlighted">Handing it over</h2>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <UCard>
      <div class="flex flex-col gap-4">
        <template v-if="!state.handoverOn">
          <p>
            Choose the day this mantel becomes {{ name }}'s own, such as their 18th birthday. On
            that day they are invited to take it, and no keeper can hold it back.
          </p>
        </template>

        <template v-else-if="!state.due">
          <p>
            {{ name }}'s mantel becomes theirs on
            <span class="text-highlighted">{{ longDay(state.handoverOn) }}</span>. On that day they
            are invited at the address you give, and no keeper can hold it back.
          </p>
          <p v-if="state.email" class="text-sm text-muted" data-testid="handover-address">
            They will be invited at {{ state.email
            }}{{ state.namedBy ? `, given by ${state.namedBy}` : '' }}.
          </p>
        </template>

        <template v-else-if="!state.childId">
          <p v-if="state.invited && state.email" data-testid="handover-address">
            The handover day has come. {{ state.email }} was invited and has not accepted yet.
          </p>
          <p v-else>
            The handover day has come. Give the address {{ name }} will sign in with, and they are
            invited at once.
          </p>
        </template>

        <template v-else-if="!state.keyGiven">
          <p>{{ child }} accepted.</p>
          <template v-if="seat">
            <p class="text-sm text-muted">
              Ask them to read you the six groups on their screen. Hand over the key only if every
              group matches these:
            </p>
            <p class="font-mono text-lg text-highlighted" data-testid="child-fingerprint">
              {{ seat.fingerprint }}
            </p>
            <p class="text-sm text-muted">
              Once they have the key, {{ child }} moves the letters to their own mantel on their
              device. Then this mantel, its key and every keeper's copy are gone, and no keeper can
              read its letters again. It cannot be undone.
            </p>
            <UButton class="self-start" :loading="busy" @click="giveKey">
              They match. Hand over the key
            </UButton>
          </template>
          <p v-else-if="canOpen === false" class="text-sm text-muted">
            This device cannot open the mantel, so another keeper hands over the key.
          </p>
        </template>

        <p v-else>
          {{ child }} holds the key. When they open their mantel on their device, the letters become
          theirs and this mantel closes.
        </p>

        <form
          v-if="state.handoverOn && !state.keyGiven"
          class="flex flex-col gap-4"
          @submit.prevent="giveAddress"
        >
          <UFormField
            :label="state.email || state.childId ? 'A different address' : `${name}'s email`"
            name="handover-email"
            :help="`The address ${name} will sign in with. Any keeper can give or change it, and the other keepers are told.`"
          >
            <UInput v-model="email" type="email" size="lg" class="w-full" autocomplete="off" />
          </UFormField>
          <UButton
            type="submit"
            class="self-start"
            :variant="seat ? 'outline' : 'solid'"
            :color="seat ? 'neutral' : 'primary'"
            :loading="busy"
            :disabled="!email.trim()"
          >
            Give the address
          </UButton>
        </form>

        <form v-if="!state.due" class="flex flex-col gap-4" @submit.prevent="proposeDay">
          <UFormField
            :label="state.handoverOn ? 'Move the day' : 'Hand over on'"
            name="handover-day"
            :help="
              only
                ? 'You keep it alone, so the day is set at once.'
                : 'More than half of the keepers must agree. With two keepers, that is both.'
            "
          >
            <UInput v-model="day" type="date" size="lg" :min="tomorrow" class="w-full" />
          </UFormField>
          <UButton
            type="submit"
            class="self-start"
            :variant="state.handoverOn ? 'outline' : 'solid'"
            :color="state.handoverOn ? 'neutral' : 'primary'"
            :loading="busy"
            :disabled="!day"
          >
            {{ only ? 'Set the day' : 'Propose this day' }}
          </UButton>
          <p v-if="proposed" class="text-sm text-muted" role="status">
            Proposed. It is set once the other keepers agree.
          </p>
        </form>
      </div>
    </UCard>
  </section>
</template>
