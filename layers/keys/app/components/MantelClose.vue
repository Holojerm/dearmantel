<script setup lang="ts">
// Closing a kept mantel, as one of its keepers proposes it. Like any custody
// change it needs more than half of the keepers, so with others it is a
// proposal they agree to on this page; a mantel's only keeper closes it at
// once. What closing does is said before the button, because it cannot be
// undone.
const props = defineProps<{
  mantel: { id: string; name: string; kind: 'child' | 'anniversary' }
  keepers: number
}>()
const emit = defineEmits<{ done: [] }>()

const confirming = ref(false)
const busy = ref(false)
const failure = ref<string | null>(null)
const alone = computed(() => props.keepers <= 1)

async function close() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/mantels/proposals', {
      method: 'POST',
      body: { kind: 'close', mantelId: props.mantel.id },
    })
    confirming.value = false
    emit('done')
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="close-mantel-heading" class="flex flex-col gap-3">
    <h2 id="close-mantel-heading" class="text-xl text-highlighted">Close the mantel</h2>
    <p class="text-sm text-muted">
      Nobody can write to {{ mantel.name }}'s mantel afterwards, its keepers included. Letters still
      on their way to it go back to whoever sent them, and everyone who writes to it is told. What
      has arrived stays here: its keepers can still read it and keep a copy.
      <template v-if="mantel.kind === 'child'">
        It is still handed over to {{ mantel.name }} on its handover day.
      </template>
    </p>
    <p class="text-sm text-muted">
      {{
        alone
          ? 'You are its only keeper, so it closes as soon as you confirm.'
          : 'Closing needs more than half of its keepers to agree. With two keepers, that is both.'
      }}
    </p>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />
    <UButton class="self-start" variant="outline" color="error" @click="confirming = true">
      {{ alone ? `Close ${mantel.name}'s mantel` : `Propose closing ${mantel.name}'s mantel` }}
    </UButton>
    <UModal
      v-model:open="confirming"
      :title="`Close ${mantel.name}'s mantel?`"
      :description="
        alone
          ? 'It closes now and cannot be opened again.'
          : 'It closes when more than half of its keepers agree, and cannot be opened again.'
      "
    >
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="confirming = false">Keep it open</UButton>
        <UButton color="error" :loading="busy" @click="close">
          {{ alone ? 'Close it' : 'Propose closing it' }}
        </UButton>
      </template>
    </UModal>
  </section>
</template>
