<script setup lang="ts">
// A new printed recovery code for a mantel, when the old one is lost or was
// seen. The key stays the same, so it is said before the button what that
// does and what it cannot do: the old code dies for every keeper, and a key
// that already got out is not taken back by a new code.
import type { KeptMantel } from '../composables/useMantelKeys'

const props = defineProps<{
  mantel: KeptMantel & {
    name: string
    publicKey: string
    keyVersion: number
    recoveryProofHash: string | null
  }
  otherKeepers: number
}>()
const emit = defineEmits<{ done: [] }>()

const { makeNew, unconfirmedCode, confirmCode } = useMantelRecoveryCode()
const asking = ref(false)
const working = ref(false)
const failure = ref<string | null>(null)
const code = ref<string | null>(null)

// A code made on this device and never confirmed: the reply was lost, or the
// page was left before the box was ticked.
onMounted(async () => {
  code.value = await unconfirmedCode(props.mantel)
})

function kept() {
  confirmCode(props.mantel.id)
  code.value = null
  asking.value = false
  emit('done')
}

const FAILURES = {
  'cannot-open':
    'This device cannot open the mantel, so it cannot make a new code. Open this page where you hold the key.',
  'rekey-due':
    'Someone has stopped keeping this mantel since the page opened. Reload it and change the key instead: that makes a new code too.',
  changed: 'The mantel changed while the code was being made. Reload the page and try again.',
  failed: 'The code may not have been replaced. Reload this page to see, then try again.',
} as const

async function replace() {
  working.value = true
  failure.value = null
  try {
    const outcome = await makeNew(props.mantel)
    if (outcome.status === 'made') code.value = outcome.code
    else failure.value = FAILURES[outcome.status]
  } catch {
    failure.value = FAILURES.failed
  } finally {
    working.value = false
  }
}
</script>

<template>
  <section aria-labelledby="recovery-code-heading" class="flex flex-col gap-4">
    <template v-if="code">
      <h2 id="recovery-code-heading" class="text-xl text-highlighted">
        The mantel's new recovery code
      </h2>
      <p class="text-muted">
        This code replaces the one printed before, which no longer opens anything. The key is the
        same, so every letter, the write link and printed cards work as they did. Print it and keep
        it where the old one was.
        <template v-if="otherKeepers > 0">
          The other keepers are told the old code no longer works when they next open this mantel.
          Give them the new one.
        </template>
      </p>
      <RecoveryCodeCard :code="code" @confirmed="kept" />
    </template>

    <template v-else>
      <h2 id="recovery-code-heading" class="text-xl text-highlighted">The recovery code</h2>
      <p class="text-muted">
        The code printed for {{ mantel.name }}'s mantel opens its key without any keeper. If it is
        lost, or someone may have seen it, make a new one.
      </p>
      <UButton
        v-if="!asking"
        class="self-start"
        color="neutral"
        variant="outline"
        @click="asking = true"
      >
        Make a new recovery code
      </UButton>

      <UCard v-else>
        <div class="flex flex-col gap-4">
          <ul class="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
            <li>The code printed before stops working at once, for every keeper.</li>
            <li>You are shown the new one once. Print it or write it down.</li>
            <li>The key stays the same. Letters, the write link and printed cards keep working.</li>
            <li v-if="otherKeepers > 0">
              The other keepers are told the old code no longer works. They need do nothing else.
            </li>
          </ul>
          <p class="text-sm text-muted">
            A new code does not change the key. If someone may already have used the old code, or
            may have the key itself, from a lost device that was signed in for instance, they can
            still open what is kept here. Only changing the key stops that, and today a mantel's key
            is changed only after someone stops keeping it.
          </p>
          <UAlert
            v-if="failure"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="failure"
          />
          <div class="flex flex-wrap gap-3">
            <UButton :loading="working" @click="replace">Replace the recovery code</UButton>
            <UButton color="neutral" variant="ghost" :disabled="working" @click="asking = false">
              Keep the old code
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </section>
</template>
