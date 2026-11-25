<script setup lang="ts">
// A child's mantel being handed over, from the child's side: accept it, read
// the key's fingerprint to a keeper, then make the letters their own on this
// device. The last step cannot be undone, and it is safe to start again: a
// device that closes halfway picks up where it stopped.
const props = defineProps<{
  handover: { mantelId: string; name: string; accepted: boolean; keyGiven: boolean }
}>()
const emit = defineEmits<{ done: [] }>()

const mantelKeys = useMantelKeys()
const { takeMantel } = useHandover()
const busy = ref(false)
const failure = ref<string | null>(null)
const fingerprint = ref<string | null>(null)
const progress = ref<{ done: number; total: number } | null>(null)
const taken = ref(false)

onMounted(async () => {
  if (props.handover.accepted && !props.handover.keyGiven) {
    fingerprint.value = await mantelKeys.myFingerprint().catch(() => null)
  }
})

async function accept() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/mantels/handover/accept', {
      method: 'POST',
      body: { mantelId: props.handover.mantelId },
    })
    fingerprint.value = await mantelKeys.myFingerprint().catch(() => null)
    emit('done')
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    busy.value = false
  }
}

const OUTCOME = {
  'cannot-open':
    'This device could not open the key you were given. Ask a keeper to hand it over again.',
  busy: 'Letters kept arriving while this worked. Try again.',
  failed: 'That did not finish. Nothing is lost: try again and it carries on where it stopped.',
} as const

async function take() {
  busy.value = true
  failure.value = null
  progress.value = { done: 0, total: 0 }
  const outcome = await takeMantel(props.handover.mantelId, (done, total) => {
    progress.value = { done, total }
  })
  busy.value = false
  progress.value = null
  if (outcome === 'taken') taken.value = true
  else failure.value = OUTCOME[outcome]
}
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-3">
      <p class="text-highlighted">{{ handover.name }}</p>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />

      <template v-if="taken">
        <p>The letters are yours. They are on your mantel, and nobody else holds their key.</p>
        <UButton class="self-start" to="/mantel">Go to your mantel</UButton>
      </template>

      <template v-else-if="!handover.accepted">
        <p class="text-sm text-muted">
          People who know you have written letters to a mantel kept for you. Its keepers set a day
          for it to become yours, and that day has come.
        </p>
        <UButton class="self-start" :loading="busy" @click="accept">Accept the mantel</UButton>
      </template>

      <template v-else-if="!handover.keyGiven">
        <p class="text-sm text-muted">
          You accepted. Now read these to one of its keepers, by phone or in person. They see the
          same on their screen, and then hand you the key.
        </p>
        <p
          v-if="fingerprint"
          class="font-mono text-lg text-highlighted"
          data-testid="my-fingerprint"
        >
          {{ fingerprint }}
        </p>
      </template>

      <template v-else>
        <p class="text-sm text-muted">
          You hold the key. Making the letters yours wraps each one again to your own key, on this
          device. Then the mantel's own key and every keeper's copy are deleted, and its keepers can
          no longer read the letters. It cannot be undone. Letters sealed until a later day stay
          sealed until then.
        </p>
        <p v-if="progress" class="text-sm text-muted" role="status">
          {{
            progress.total
              ? `Wrapping letters: ${progress.done} of ${progress.total}.`
              : 'Wrapping letters…'
          }}
        </p>
        <UButton class="self-start" :loading="busy" @click="take">Make the letters mine</UButton>
      </template>
    </div>
  </UCard>
</template>
