<script setup lang="ts">
// Shown to a mantel's keepers after one of them has left, or once they have
// agreed that its key got out (`MantelChangeKey`). Whoever left, or whoever
// has the key, may still hold it, so a keeper changes it here.
// Everything that follows from that is said before the button, because the
// old recovery code and any printed write link stop working for good.
import type { KeptMantel } from '#layers/keys/app/composables/useMantelKeys'

const props = defineProps<{
  mantel: KeptMantel & {
    kind: 'child' | 'anniversary'
    name: string
    publicKey: string
    rekeyDue: boolean
    rekeyAsked: boolean
  }
  otherKeepers: number
}>()
const emit = defineEmits<{ done: [] }>()

const { rekey, unconfirmedCode, confirmCode } = useMantelRekey()
const working = ref(false)
const failure = ref<string | null>(null)
const code = ref<string | null>(null)

// A code made on this device and never confirmed: the reply was lost, or the
// page was left before the box was ticked.
onMounted(() => {
  code.value = unconfirmedCode(props.mantel)
})

function kept() {
  confirmCode(props.mantel.id)
  code.value = null
  emit('done')
}

const FAILURES = {
  'cannot-open':
    'This device cannot open the mantel, so it cannot change its key. Open this page where you hold the key.',
  busy: 'Letters kept arriving while the key was being changed. Try again in a moment.',
  failed: 'The key may not have been changed. Reload this page to see, then try again.',
} as const

async function change() {
  working.value = true
  failure.value = null
  try {
    const outcome = await rekey(props.mantel)
    if (outcome.status === 'rekeyed') code.value = outcome.code
    else failure.value = FAILURES[outcome.status]
  } catch {
    failure.value = FAILURES.failed
  } finally {
    working.value = false
  }
}
</script>

<template>
  <section
    v-if="code || mantel.rekeyDue"
    aria-labelledby="rekey-heading"
    class="flex flex-col gap-4"
  >
    <template v-if="code">
      <h2 id="rekey-heading" class="text-xl text-highlighted">The mantel's new recovery code</h2>
      <p class="text-muted">
        The key has been changed. This code replaces the one printed before, which no longer opens
        anything. Print it and keep it where the old one was.
        <template v-if="otherKeepers > 0">
          The other keepers get the new key when they next open this mantel. Tell them the code has
          changed.
        </template>
      </p>
      <RecoveryCodeCard :code="code" @confirmed="kept" />
    </template>

    <UCard v-else>
      <div class="flex flex-col gap-4">
        <h2 id="rekey-heading" class="text-xl text-highlighted" tabindex="-1">
          Change this mantel's key
        </h2>
        <p v-if="mantel.rekeyAsked" class="text-muted">
          {{
            otherKeepers > 0
              ? `${mantel.name}'s keepers agreed to change its key, in case someone who should not have it has a copy.`
              : `You asked to change ${mantel.name}'s key, in case someone who should not have it has a copy.`
          }}
          Changing it means that copy opens nothing kept here.
        </p>
        <p v-else class="text-muted">
          Someone who kept {{ mantel.name }}'s mantel no longer does. They were given its key, and
          may still have a copy. Changing the key means that copy opens nothing kept here.
        </p>
        <ul class="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
          <li>Every letter stays, and its keepers can still read what they could before.</li>
          <li>
            The recovery code printed for this mantel stops working. You are shown a new one once.
          </li>
          <li v-if="otherKeepers > 0">
            The other keepers get the new key when they next open this mantel. They need do nothing.
          </li>
          <li v-if="mantel.kind === 'anniversary'">
            The write link stops working, and so do cards printed with it. You can make a new link
            afterwards.
          </li>
        </ul>
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="failure"
        />
        <UButton class="self-start" :loading="working" @click="change">Change the key</UButton>
      </div>
    </UCard>
  </section>
</template>
