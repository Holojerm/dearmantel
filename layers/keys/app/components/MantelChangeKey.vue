<script setup lang="ts">
// Asking to change a mantel's key when nobody has left: for a key that may
// have got out. Like any custody change it needs more than half of the
// keepers, so with others it is a proposal they agree to on this page; a
// mantel's only keeper starts it at once. The change itself is then
// `LettersMantelRekey`, at the top of the page.
const props = defineProps<{
  mantel: { id: string; name: string }
  keepers: number
}>()
const emit = defineEmits<{ done: [due: boolean] }>()

const confirming = ref(false)
const busy = ref(false)
const failure = ref<string | null>(null)
const alone = computed(() => props.keepers <= 1)

async function propose() {
  busy.value = true
  failure.value = null
  try {
    const { rekeyDue } = await $fetch<{ rekeyDue: boolean }>('/api/mantels/proposals', {
      method: 'POST',
      body: { kind: 'rekey', mantelId: props.mantel.id },
    })
    confirming.value = false
    emit('done', rekeyDue)
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="change-key-heading" class="flex flex-col gap-3">
    <h2 id="change-key-heading" class="text-xl text-highlighted">If the key got out</h2>
    <p class="text-sm text-muted">
      Change the key if someone who should not have it may have {{ mantel.name }}'s key: a lost or
      stolen device that was signed in, for instance, or a recovery code someone used before it was
      replaced. A new recovery code does not help then; a new key does. Afterwards the old key opens
      nothing kept here.
    </p>
    <p class="text-sm text-muted">
      {{
        alone
          ? 'You are its only keeper, so you can change it now.'
          : 'Changing it needs more than half of its keepers to agree. With two keepers, that is both. Then any one of you changes it, on this page.'
      }}
    </p>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />
    <UButton class="self-start" color="neutral" variant="outline" @click="confirming = true">
      {{ alone ? "Change the mantel's key" : "Propose changing the mantel's key" }}
    </UButton>
    <UModal
      v-model:open="confirming"
      :title="`Change ${mantel.name}'s key?`"
      :description="
        alone
          ? 'The recovery code printed before stops working, and you are shown a new one once.'
          : 'It is changed once more than half of its keepers agree. The recovery code printed before then stops working.'
      "
    >
      <template #footer>
        <UButton variant="ghost" color="neutral" @click="confirming = false">Keep the key</UButton>
        <UButton :loading="busy" @click="propose">
          {{ alone ? 'Go on to change it' : 'Propose changing it' }}
        </UButton>
      </template>
    </UModal>
  </section>
</template>
