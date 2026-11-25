<script setup lang="ts">
// An anniversary mantel's write link: the address printed on a card so guests
// can write without an account. The part after the # never reaches us with
// the page: a fingerprint of the mantel's key, which the guest's browser
// checks, and a secret worked out here from the mantel's key, without which
// the address is no use. So the address can only be shown where the mantel
// opens.
import { guestLinkFragment } from '../../../shared/utils/guest'
import { guestLinkSecret, guestLinkSecretHash, newGuestLinkId } from '../../utils/guest-link-secret'

const props = defineProps<{ mantelId: string; publicKey: string; wrappedKey: string | null }>()
const mantelKeys = useMantelKeys()

interface GuestLink {
  id: string
  opensOn: string
  closesOn: string
  letters: number
  maxLetters: number
}

const link = ref<GuestLink | null>(null)
const hasPost = ref(false)
const address = ref<string | null>(null)
const opensOn = ref('')
const closesOn = ref('')
const busy = ref(false)
const failure = ref<string | null>(null)
// False when this device cannot open the mantel, and so cannot work out the address.
const opens = ref(true)

const mantelKey = () =>
  mantelKeys.open({ id: props.mantelId, wrappedKey: props.wrappedKey, publicKey: props.publicKey })

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

async function load() {
  const view = await $fetch<{ post: unknown; guestLink: GuestLink | null }>(
    '/api/letters/kept/list',
    { method: 'POST', body: { mantelId: props.mantelId } },
  )
  hasPost.value = Boolean(view.post)
  link.value = view.guestLink
  const key = await mantelKey()
  opens.value = Boolean(key)
  const print = await keyFingerprintToken(props.publicKey)
  address.value =
    view.guestLink && key && print
      ? `${window.location.origin}/w/${view.guestLink.id}#${guestLinkFragment(
          print,
          await guestLinkSecret(key, view.guestLink.id),
        )}`
      : null
}
onMounted(() => {
  closesOn.value = inDays(30)
  opensOn.value = inDays(365)
  void load().catch(() => {
    failure.value = 'Could not load the write link.'
  })
})

async function create() {
  busy.value = true
  failure.value = null
  try {
    const key = await mantelKey()
    if (!key) {
      opens.value = false
      return
    }
    const id = newGuestLinkId()
    await $fetch('/api/letters/kept/guest-link', {
      method: 'POST',
      body: {
        mantelId: props.mantelId,
        id,
        secretHash: await guestLinkSecretHash(await guestLinkSecret(key, id)),
        publicKey: props.publicKey,
        opensOn: opensOn.value,
        closesOn: closesOn.value,
      },
    })
    await load()
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="guest-link-heading" class="flex flex-col gap-4">
    <h2 id="guest-link-heading" class="text-xl text-highlighted">Letters from guests</h2>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <p v-if="!opens" class="text-muted">
      This device cannot open the mantel, so it cannot show or make the write link. Open this page
      where you hold the mantel's key.
    </p>
    <template v-if="link && address">
      <p class="text-sm text-muted">
        Print this address on a card, or as a QR code. Anyone who has it can write one letter after
        another without an account, until {{ yearDay(link.closesOn) }}. Every letter stays sealed
        until {{ yearDay(link.opensOn) }}. Print all of it: the part after the # sign is what lets a
        guest write.
      </p>
      <p class="break-all font-mono text-sm text-highlighted" data-testid="guest-link">
        {{ address }}
      </p>
      <p class="text-sm text-muted">
        {{ link.letters }} of {{ link.maxLetters }} letters received through this link.
      </p>
    </template>
    <p v-else-if="!hasPost" class="text-muted">
      Choose the mantel's city first. Then you can make the link guests write from.
    </p>

    <form v-if="hasPost && opens" class="flex flex-col gap-4" @submit.prevent="create">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Guests can write until" name="closes-on">
          <UInput v-model="closesOn" type="date" class="w-full" />
        </UFormField>
        <UFormField label="The letters open on" name="opens-on" help="Your first anniversary, say.">
          <UInput v-model="opensOn" type="date" class="w-full" />
        </UFormField>
      </div>
      <UButton
        type="submit"
        class="self-start"
        :variant="link ? 'outline' : 'solid'"
        :color="link ? 'neutral' : 'primary'"
        :loading="busy"
      >
        {{ link ? 'Replace the link' : 'Make the write link' }}
      </UButton>
      <p v-if="link" class="text-sm text-muted">
        Replacing it stops the old address working. Letters already sent stay.
      </p>
    </form>
  </section>
</template>
