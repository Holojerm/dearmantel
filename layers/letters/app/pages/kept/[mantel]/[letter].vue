<script setup lang="ts">
// A letter on a kept mantel, opened by one of its keepers: this keeper's copy
// of the mantel's key opens the letter's key, and the letter is decrypted
// here. The mantel's key is held in memory only for that.
import type { KeptMantel } from '#layers/keys/app/composables/useMantelKeys'
import type { KeptLetter } from '../../../../shared/utils/kept'
import { parseLetterDoc, type LetterDoc } from '../../../../shared/utils/letter-doc'
import { decryptLetter, unwrapContentKey } from '../../../utils/letter-crypto'

definePageMeta({ middleware: ['auth', 'keys'] })

const route = useRoute()
const mantelKeys = useMantelKeys()
const mantelId = String(route.params.mantel)
const letterId = String(route.params.letter)

const loading = ref(true)
const failure = ref<string | null>(null)
const mantelName = ref('')
const opened = ref<KeptLetter | null>(null)
const doc = ref<LetterDoc | null>(null)
const photoUrl = ref<string | null>(null)

onMounted(async () => {
  try {
    const mantel = await $fetch<KeptMantel & { name: string }>('/api/mantels/view', {
      method: 'POST',
      body: { id: mantelId },
    })
    mantelName.value = mantel.name
    const letter = await $fetch<KeptLetter>('/api/letters/kept/open', {
      method: 'POST',
      body: { mantelId, letterId },
    })
    opened.value = letter
    if (letter.sealed) return

    const mantelKey = await mantelKeys.open(mantel)
    const privateKey = mantelKey ? await importPrivateKey(mantelKey) : null
    const key = privateKey
      ? await unwrapContentKey(privateKey, letter.wrappedKey, { letterId, readerId: mantelId })
      : null
    const text = key ? await decryptLetter(key, letterId, letter.ciphertext) : null
    doc.value = text ? parseLetterDoc(text) : null
    if (!key || !doc.value) {
      failure.value = 'This letter could not be opened on this device.'
      return
    }
    if (doc.value.photo) {
      photoUrl.value = await loadLetterPhoto(key, letterId, doc.value.photo, mantelId)
    }
  } catch {
    failure.value = 'That letter is not on this mantel.'
  } finally {
    loading.value = false
  }
})

// A guest's letter has nobody to answer for it, so a keeper may remove one.
const canRemove = computed(() =>
  Boolean(opened.value && !opened.value.sealed && opened.value.guest),
)
// A child's mantel writes back in the writer's own correspondence with it.
const answerIn = computed(() =>
  opened.value && !opened.value.sealed && doc.value ? opened.value.answerIn : null,
)
const confirming = ref(false)
const removing = ref(false)

async function remove() {
  removing.value = true
  try {
    await $fetch('/api/letters/kept/remove', { method: 'POST', body: { mantelId, letterId } })
    await navigateTo(`/mantels/${mantelId}`)
  } catch {
    failure.value = 'The letter was not removed. Try again.'
    confirming.value = false
  } finally {
    removing.value = false
  }
}

const returned = computed(() =>
  Boolean(opened.value && !opened.value.sealed && opened.value.kind === 'return'),
)

const heading = computed(() => {
  const letter = opened.value
  if (letter && !letter.sealed && letter.kind === 'return') {
    const to = letter.name ? ` to ${letter.name}` : ''
    return `Returned: ${mantelName.value}'s letter${to}`
  }
  if (letter && !letter.sealed && letter.name) return `To ${mantelName.value}, from ${letter.name}`
  return mantelName.value ? `A letter to ${mantelName.value}` : 'A letter'
})

useSeo({ title: 'A letter', description: 'A letter on a mantel you keep.', noindex: true })
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6 py-8 sm:py-12">
    <p v-if="loading" class="text-muted" role="status">Opening…</p>

    <template v-else>
      <div>
        <h1 class="text-3xl text-highlighted">{{ heading }}</h1>
        <p v-if="opened?.postmark" class="mt-1 text-sm text-muted">
          Postmarked {{ longDay(opened.postmark) }}
        </p>
      </div>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />
      <UAlert
        v-if="opened?.sealed"
        color="info"
        variant="subtle"
        icon="i-lucide-lock"
        :title="`Sealed until ${yearDay(opened.opensOn)}`"
        description="Nobody can open this letter before that day, its keepers included."
      />
      <UAlert
        v-if="returned"
        color="info"
        variant="subtle"
        icon="i-lucide-undo-2"
        title="Returned to sender"
        :description="`This letter could not be delivered, so it has come back to ${mantelName}'s mantel.`"
      />
      <LetterPaper v-if="doc" :doc="doc" :photo-url="photoUrl" />
      <div class="flex flex-wrap items-center justify-between gap-4">
        <UButton variant="ghost" color="neutral" :to="`/mantels/${mantelId}`">
          Back to the mantel
        </UButton>
        <UButton
          v-if="answerIn"
          :to="{ path: '/write', query: { as: mantelId, to: answerIn, reply: letterId } }"
        >
          Write back as {{ mantelName }}
        </UButton>
        <UButton v-if="canRemove" variant="ghost" color="error" @click="confirming = true">
          Remove this letter
        </UButton>
      </div>

      <UModal
        v-model:open="confirming"
        title="Remove this letter?"
        description="It is deleted for every keeper of this mantel, with its photo, and cannot be brought back. The guest who wrote it is not told."
      >
        <template #footer>
          <UButton variant="ghost" color="neutral" @click="confirming = false">Keep it</UButton>
          <UButton color="error" :loading="removing" @click="remove">Remove for good</UButton>
        </template>
      </UModal>
    </template>
  </div>
</template>
