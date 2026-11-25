<script setup lang="ts">
// Opening a mantel for a child or a couple. Its keys are made on this device,
// and its recovery code is shown once, before anything else can happen.
import {
  isHandoverDay,
  MANTEL_KINDS,
  mantelNameSchema,
  type MantelKind,
} from '../../../shared/utils/mantel-format'

definePageMeta({ middleware: ['auth', 'keys'] })

const mantelKeys = useMantelKeys()
const kind = ref<MantelKind>('child')
const name = ref('')
const pending = ref(false)
const failure = ref<string | null>(null)
const made = ref<{ id: string; code: string } | null>(null)

// A child's mantel becomes theirs on a day set now. Eighteen years from today
// is only where the field starts.
const today = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
const handoverOn = ref(`${Number(today.slice(0, 4)) + 18}${today.slice(4)}`)

const KINDS = MANTEL_KINDS.map((value) => ({
  value,
  label: value === 'child' ? "A child's mantel" : 'Anniversary letters for a couple',
}))
const valid = computed(
  () =>
    mantelNameSchema.safeParse(name.value).success &&
    (kind.value !== 'child' || isHandoverDay(handoverOn.value, today)),
)

async function create() {
  pending.value = true
  failure.value = null
  try {
    made.value = await mantelKeys.create({
      kind: kind.value,
      name: name.value.trim(),
      ...(kind.value === 'child' ? { handoverOn: handoverOn.value } : {}),
    })
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ??
      'The mantel could not be opened. Try again.'
  } finally {
    pending.value = false
  }
}

useSeo({
  title: 'Open a mantel',
  description: 'Open a mantel for a child or a couple.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8 sm:py-12">
    <div>
      <h1 class="text-3xl text-highlighted">
        {{ made ? "The mantel's recovery code" : 'Open a mantel' }}
      </h1>
      <p v-if="made" class="mt-2 text-muted">
        Print this and keep it with the papers that matter: a birth certificate, a will. If every
        keeper loses their own key, this code is the only thing that opens the letters. We do not
        have a copy and cannot make one.
      </p>
      <p v-else class="mt-2 text-muted">
        For someone who cannot keep their own yet. You will be its first keeper, and you can ask
        someone else to keep it with you.
      </p>
    </div>

    <RecoveryCodeCard
      v-if="made"
      :code="made.code"
      @confirmed="navigateTo(`/mantels/${made.id}`)"
    />

    <template v-else>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />
      <UCard>
        <form class="flex flex-col gap-6" @submit.prevent="create">
          <UFormField label="What is it for?" name="kind">
            <URadioGroup v-model="kind" :items="KINDS" />
          </UFormField>
          <UFormField
            label="Whose mantel is it?"
            name="name"
            :help="
              kind === 'child'
                ? 'The child\'s name, as you would say it: Leo.'
                : 'The couple\'s names: Maya and Theo.'
            "
          >
            <UInput v-model="name" maxlength="60" size="lg" class="w-full" autocomplete="off" />
          </UFormField>
          <UFormField
            v-if="kind === 'child'"
            label="When does it become theirs?"
            name="handover-day"
            help="Such as their 18th birthday. On that day they are invited to take the mantel with an account of their own, and no keeper can hold it back. Moving the day later needs more than half of its keepers."
          >
            <UInput
              v-model="handoverOn"
              type="date"
              size="lg"
              :min="tomorrow"
              class="w-full"
              autocomplete="off"
            />
          </UFormField>
          <UButton type="submit" class="self-start" :loading="pending" :disabled="!valid">
            Open the mantel
          </UButton>
        </form>
      </UCard>
    </template>
  </div>
</template>
