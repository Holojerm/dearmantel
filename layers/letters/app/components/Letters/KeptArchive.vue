<script setup lang="ts">
// A keeper's copy of a kept mantel's opened letters, and of the letters a
// child's mantel wrote, made on this device with this keeper's copy of the
// mantel's key. Sealed and unopened letters are left out: making a copy opens
// nothing.
import type { KeptMantel } from '#layers/keys/app/composables/useMantelKeys'
import { saveFile } from '#layers/post/app/utils/save-file'

import { fileSafe, type ArchiveSealed, type KeptArchive } from '../../../shared/utils/archive'
import { buildArchive } from '../../utils/archive-build'
import { unwrapContentKey } from '../../utils/letter-crypto'

// `wrote`: a child's mantel that has written back, whose own letters go in too.
const props = defineProps<{ mantelId: string; name: string; wrote?: boolean }>()

const mantelKeys = useMantelKeys()
const site = useRuntimeConfig().public
const working = ref(false)
const progress = ref('')
const outcome = ref<{ text: string; failed: boolean } | null>(null)

const what = computed(() =>
  props.wrote
    ? `The letters that have been opened here and the letters ${props.name} wrote`
    : 'The letters that have been opened here',
)

const count = (n: number) => `${n} ${n === 1 ? 'letter' : 'letters'}`

function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function keep() {
  working.value = true
  outcome.value = null
  progress.value = 'Opening the letters…'
  try {
    const body = { mantelId: props.mantelId }
    const archive = await $fetch<KeptArchive>('/api/letters/kept/archive', { method: 'POST', body })
    const mantel = await $fetch<KeptMantel>('/api/mantels/view', {
      method: 'POST',
      body: { id: props.mantelId },
    })
    const mantelKey = await mantelKeys.open(mantel)
    const privateKey = mantelKey ? await importPrivateKey(mantelKey) : null
    if (!privateKey) {
      outcome.value = { text: "This device cannot open the mantel's key.", failed: true }
      return
    }
    const day = today()
    const built = await buildArchive(
      {
        correspondenceId: props.mantelId,
        name: props.name,
        kind: 'kept',
        entries: archive.entries,
        unopened: archive.unopened,
      },
      (wrapped, letterId) =>
        unwrapContentKey(privateKey, wrapped, { letterId, readerId: props.mantelId }),
      day,
      site,
      (done, total) => {
        progress.value = `Opening letter ${Math.min(done + 1, total)} of ${total}…`
      },
      {
        sealed: (letterId) =>
          $fetch<ArchiveSealed>('/api/letters/kept/archive-letter', {
            method: 'POST',
            body: { ...body, letterId },
          }),
        photo: (letterId) =>
          $fetch<ArrayBuffer>(`/api/letters/photo/${letterId}`, {
            responseType: 'arrayBuffer',
            query: { mantel: props.mantelId },
          }),
      },
    )
    if (built.letters === 0) {
      outcome.value = { text: 'No letter here has been opened yet.', failed: true }
      return
    }
    saveFile(built.blob, `${fileSafe(site.appName)} ${fileSafe(props.name)} ${day}.zip`)
    const left = [
      archive.unopened ? `${count(archive.unopened)} not yet opened` : '',
      archive.sealed ? `${count(archive.sealed)} still sealed` : '',
      built.skipped ? `${count(built.skipped)} this device could not open` : '',
    ].filter(Boolean)
    outcome.value = {
      text: left.length
        ? `Saved ${count(built.letters)}. Left out: ${left.join(', ')}.`
        : `Saved ${count(built.letters)}.`,
      failed: false,
    }
  } catch {
    outcome.value = {
      text: 'The copy could not be made. Check your connection and try again.',
      failed: true,
    }
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="mt-4 text-lg text-highlighted">Keep a copy</h3>
    <p class="text-sm text-muted">
      {{ what }}, as files you can read without {{ site.appName }}. The copy is made on this device.
      Letters nobody has opened yet, and letters still sealed, are left out.
    </p>
    <UButton
      class="self-start"
      color="neutral"
      variant="outline"
      icon="i-lucide-download"
      :loading="working"
      @click="keep"
    >
      Keep a copy of {{ name }}'s letters
    </UButton>
    <p
      v-if="outcome"
      class="text-sm"
      :class="outcome.failed ? 'text-error' : 'text-muted'"
      role="status"
    >
      {{ outcome.text }}
    </p>
    <p v-else-if="working" class="text-sm text-muted" role="status">{{ progress }}</p>
  </div>
</template>
