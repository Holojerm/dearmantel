<script setup lang="ts">
// Shown in the delete-account dialog to a mantel's only keeper. The mantel
// stays when they go, and only its printed recovery code opens it after
// that, so what happens is said in full before anything is asked, and each
// code is checked on this device before the delete button can be pressed.
import { checkMantelCode } from '../utils/mantel-code-check'
import { RECOVERY_WAIT_DAYS } from '../../shared/utils/mantel-format'

const props = defineProps<{
  mantels: { id: string; name: string; kind: string }[]
}>()
/** The proof for every mantel, once each code opened and the keeper said they understand. */
const proofs = defineModel<Record<string, string> | null>('proofs', { required: true })

const codes = reactive<Record<string, string>>({})
const proved = reactive<Record<string, string>>({})
const problems = reactive<Record<string, string>>({})
const checking = ref<string | null>(null)
const understood = ref(false)

const names = computed(() => props.mantels.map((mantel) => `${mantel.name}'s mantel`).join(' and '))
const hasAnniversary = computed(() => props.mantels.some((m) => m.kind === 'anniversary'))
const one = computed(() => props.mantels.length === 1)

watchEffect(() => {
  const ready = understood.value && props.mantels.every((mantel) => proved[mantel.id])
  proofs.value = ready ? Object.fromEntries(props.mantels.map((m) => [m.id, proved[m.id]!])) : null
})

// A code changed after it was checked has to be checked again.
function edited(id: string) {
  delete proved[id]
  delete problems[id]
}

async function check(id: string) {
  checking.value = id
  delete problems[id]
  delete proved[id]
  try {
    const result = await checkMantelCode(codes[id] ?? '', id)
    if (result.status === 'opens') proved[id] = result.proof
    else if (result.status === 'bad-code') {
      problems[id] = 'That does not look like a recovery code. It is eight groups of four.'
    } else problems[id] = 'That code does not open this mantel.'
  } catch {
    problems[id] = 'That did not work. Try again.'
  } finally {
    checking.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-highlighted">You are the only keeper of {{ names }}.</p>
    <p class="text-muted">
      Your account can go, but {{ one ? 'the mantel stays' : 'the mantels stay' }}: a mantel belongs
      to the person it is kept for. This is what happens after you delete your account:
    </p>
    <ul class="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
      <li>Every letter stays, sealed ones too. Nobody can read them, and we cannot either.</li>
      <li>
        Only the printed recovery code opens {{ one ? 'it' : 'them' }} again. Whoever has the code
        can sign in, use it, and becomes the keeper {{ RECOVERY_WAIT_DAYS }} days later. With no
        keeper left, nobody is told and nobody can stop it.
      </li>
      <li>
        If the code is lost, the letters are lost for good. We do not have a copy and cannot open
        them for anyone.
      </li>
      <li>
        Until someone uses the code, nobody is told when letters arrive. People who write to
        {{ one ? 'it' : 'them' }} can still write.
        <template v-if="hasAnniversary">The write link and printed cards still work.</template>
      </li>
    </ul>
    <p class="text-sm text-muted">
      The other way is to ask someone to keep {{ one ? 'it' : 'them' }} with you first, on the
      mantel's page. Then nothing waits on the code.
    </p>

    <p class="text-sm text-muted">
      Type each code to show you have it. It is checked on this device and not sent to us.
    </p>
    <div v-for="mantel in mantels" :key="mantel.id" class="flex flex-col gap-2">
      <UFormField
        :label="`${mantel.name}'s recovery code`"
        :name="`code-${mantel.id}`"
        :error="problems[mantel.id]"
      >
        <UInput
          v-model="codes[mantel.id]"
          class="w-full font-mono"
          autocomplete="off"
          spellcheck="false"
          @update:model-value="edited(mantel.id)"
        />
      </UFormField>
      <p v-if="proved[mantel.id]" class="text-sm text-muted" role="status">
        This code opens {{ mantel.name }}'s mantel.
      </p>
      <UButton
        v-else
        class="self-start"
        size="sm"
        color="neutral"
        variant="outline"
        :loading="checking === mantel.id"
        :disabled="!codes[mantel.id]?.trim()"
        @click="check(mantel.id)"
      >
        Check the code
      </UButton>
    </div>

    <UCheckbox
      v-model="understood"
      :label="`I understand that only this code will open ${names} once my account is gone`"
    />
  </div>
</template>
