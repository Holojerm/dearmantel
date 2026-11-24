<script setup lang="ts">
// One kept mantel: who keeps it, and the proposals that would change that.
// Seating a new keeper happens here, in a keeper's browser, after the two
// people have compared the new keeper's key by voice.
import { KEEPER_ROLES, type KeeperRole } from '../../../shared/utils/mantel-format'

definePageMeta({ middleware: ['auth', 'keys'] })

interface Keeper {
  userId: string
  role: KeeperRole
  name: string | null
}
interface Proposal {
  id: string
  kind: 'add_keeper' | 'remove_keeper'
  email: string | null
  subjectId: string | null
  name: string | null
  mine: boolean
  voted: boolean
  votes: number
  keepers: number
  carried: boolean
  accepted: boolean
}
interface MantelView {
  id: string
  kind: 'child' | 'anniversary'
  name: string
  me: string
  publicKey: string
  keyVersion: number
  rekeyDue: boolean
  recoveryProofHash: string | null
  /** Another keeper replaced the recovery code since this keeper last looked. */
  recoveryCodeReplacedAt: string | null
  wrappedKey: string | null
  handover: { previous: string; wrapped: string } | null
  keepers: Keeper[]
  proposals: Proposal[]
  recoveries: { id: string; name: string | null; readyAt: string }[]
}
interface Seat {
  subjectId: string
  publicKey: string
  fingerprint: string | null
}

const route = useRoute()
const { appName } = useRuntimeConfig().public
const mantelKeys = useMantelKeys()
const mantel = ref<MantelView | null>(null)
const loading = ref(true)
const failure = ref<string | null>(null)
const canOpen = ref<boolean | null>(null)
// Another keeper changed the key and this visit took the new one.
const keyChanged = ref(false)
// The server tells of a replaced code once; later reloads here keep it shown.
const codeReplacedAt = ref<string | null>(null)
const email = ref('')
const role = ref<KeeperRole>('guardian')
const busy = ref(false)
const seats = reactive<Record<string, Seat>>({})

const ROLE: Record<KeeperRole, string> = {
  guardian: 'Guardian',
  partner: 'Partner',
  successor: 'Successor',
}
const ROLES = KEEPER_ROLES.map((value) => ({ value, label: ROLE[value] }))
const message = (error: unknown) =>
  (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'

const fetchView = () =>
  $fetch<MantelView>('/api/mantels/view', {
    method: 'POST',
    body: { id: String(route.params.id) },
  })

async function load() {
  try {
    let view = await fetchView()
    // After another keeper's re-key, opening the mantel stores this keeper's
    // copy of the new key. Everything below is shown from the view after that.
    if (view.handover && !view.wrappedKey && (await mantelKeys.open(view))) {
      keyChanged.value = true
      view = await fetchView()
    }
    codeReplacedAt.value ??= view.recoveryCodeReplacedAt
    mantel.value = view
    role.value = view.kind === 'child' ? 'guardian' : 'partner'
    canOpen.value = Boolean(await mantelKeys.open(view))
    for (const proposal of view.proposals) {
      if (proposal.kind === 'add_keeper' && proposal.carried && proposal.accepted) {
        seats[proposal.id] = await mantelKeys.seatToFill(proposal.id)
      }
    }
  } catch {
    failure.value = 'You do not keep that mantel.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function run(work: () => Promise<unknown>) {
  busy.value = true
  failure.value = null
  try {
    await work()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
    await load()
  }
}

const propose = () =>
  run(async () => {
    await $fetch('/api/mantels/proposals', {
      method: 'POST',
      body: {
        kind: 'add_keeper',
        mantelId: mantel.value!.id,
        email: email.value,
        role: role.value,
      },
    })
    email.value = ''
  })
const proposeRemoval = (keeperId: string) =>
  run(async () => {
    await $fetch('/api/mantels/proposals', {
      method: 'POST',
      body: { kind: 'remove_keeper', mantelId: mantel.value!.id, keeperId },
    })
  })
const act = (id: string, action: 'vote' | 'withdraw') =>
  run(async () => {
    await $fetch('/api/mantels/proposals/act', { method: 'POST', body: { id, action } })
  })
const cancelRecovery = (id: string) =>
  run(async () => {
    await $fetch('/api/mantels/recover/act', { method: 'POST', body: { id, action: 'cancel' } })
  })
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
const grant = (id: string) =>
  run(async () => {
    const seat = seats[id]
    if (!seat || !(await mantelKeys.grant(id, mantel.value!, seat))) {
      throw new Error('This device could not open the mantel to share its key.')
    }
  })

const subject = (proposal: Proposal) => proposal.name ?? proposal.email ?? 'someone'

useSeo({ title: 'A mantel you keep', description: 'Who keeps this mantel.', noindex: true })
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-8 sm:py-12">
    <h1 class="text-3xl text-highlighted">{{ mantel ? mantel.name : 'A mantel you keep' }}</h1>

    <p v-if="loading" class="text-muted" role="status">Opening…</p>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <template v-if="mantel">
      <UAlert
        v-if="canOpen === false"
        color="warning"
        variant="subtle"
        icon="i-lucide-key-round"
        title="This device cannot open this mantel"
        description="Your copy of its key did not open here. Another keeper can give you a new copy, or you can use the mantel's printed recovery code."
        :actions="[{ label: 'Use the recovery code', to: '/mantels/recover' }]"
      />
      <UAlert
        v-else-if="mantel.keepers.length === 1"
        color="info"
        variant="subtle"
        icon="i-lucide-user-plus"
        title="This mantel has one keeper"
        description="If you lose your own key, only the printed recovery code can open its letters. Ask someone to keep it with you."
      />

      <UAlert
        v-if="keyChanged"
        color="info"
        variant="subtle"
        icon="i-lucide-key-round"
        title="This mantel's key was changed"
        description="Another keeper changed it after someone stopped keeping this mantel. You now hold the new key and need do nothing. The recovery code printed before no longer works: ask them for the new one."
      />
      <UAlert
        v-if="codeReplacedAt && !keyChanged"
        color="info"
        variant="subtle"
        icon="i-lucide-key-round"
        title="This mantel's recovery code was replaced"
        :description="`Another keeper made a new recovery code on ${day(codeReplacedAt)}. The code printed before no longer works: ask them for the new one. The key is the same, and you need do nothing else.`"
      />
      <LettersMantelRekey
        v-if="canOpen"
        :mantel="mantel"
        :other-keepers="mantel.keepers.length - 1"
        @done="load"
      />

      <UAlert
        v-for="claim in mantel.recoveries"
        :key="claim.id"
        color="warning"
        variant="subtle"
        icon="i-lucide-key-round"
        title="This mantel's recovery code was used"
        :description="`${claim.name ?? 'Someone'} used the printed code and will become a keeper on ${day(claim.readyAt)} unless a keeper cancels it. If you did not expect this, cancel it.`"
        :actions="[{ label: 'Cancel it', onClick: () => cancelRecovery(claim.id) }]"
      />

      <LettersKeptMantel :mantel-id="mantel.id" :name="mantel.name" :kind="mantel.kind" />
      <LettersMantelNews
        v-if="mantel.kind === 'child'"
        :mantel-id="mantel.id"
        :name="mantel.name"
      />
      <LettersGuestLink
        v-if="mantel.kind === 'anniversary'"
        :mantel-id="mantel.id"
        :public-key="mantel.publicKey"
        :wrapped-key="mantel.wrappedKey"
      />

      <section aria-labelledby="keepers-heading" class="flex flex-col gap-3">
        <h2 id="keepers-heading" class="text-xl text-highlighted">Keepers</h2>
        <ul class="flex flex-col divide-y divide-default">
          <li
            v-for="keeper in mantel.keepers"
            :key="keeper.userId"
            class="flex items-center justify-between gap-4 py-3"
          >
            <div>
              <p class="text-highlighted">
                {{ keeper.name ?? 'A keeper' }}{{ keeper.userId === mantel.me ? ' (you)' : '' }}
              </p>
              <p class="text-sm text-muted">{{ ROLE[keeper.role] }}</p>
            </div>
            <UButton
              v-if="mantel.keepers.length > 1"
              size="sm"
              variant="ghost"
              color="neutral"
              :disabled="busy"
              :aria-label="`Propose that ${keeper.name ?? 'this keeper'} stops keeping this mantel`"
              @click="proposeRemoval(keeper.userId)"
            >
              Propose removal
            </UButton>
          </li>
        </ul>
        <p class="text-sm text-muted">
          Changes to who keeps a mantel need more than half of its keepers to agree. With two
          keepers, that is both.
        </p>
      </section>

      <!-- While a re-key is due, changing the key makes the new code. -->
      <MantelRecoveryCode
        v-if="canOpen && !mantel.rekeyDue"
        :mantel="mantel"
        :other-keepers="mantel.keepers.length - 1"
        @done="load"
      />

      <section
        v-if="mantel.proposals.length"
        aria-labelledby="proposals-heading"
        class="flex flex-col gap-3"
      >
        <h2 id="proposals-heading" class="text-xl text-highlighted">Waiting to be settled</h2>
        <UCard v-for="proposal in mantel.proposals" :key="proposal.id">
          <div class="flex flex-col gap-3">
            <p class="text-highlighted">
              {{
                proposal.kind === 'add_keeper'
                  ? `Add ${subject(proposal)} as a keeper`
                  : `${subject(proposal)} stops keeping this mantel`
              }}
            </p>
            <p class="text-sm text-muted">
              {{ proposal.votes }} of {{ proposal.keepers }} keepers agree.
              <template v-if="proposal.kind === 'add_keeper' && !proposal.accepted">
                They have not accepted yet. They will see the request when they sign in.
              </template>
            </p>

            <template v-if="seats[proposal.id]">
              <p class="text-sm text-muted">
                Ask them to read you the six groups on their screen. Give them the key only if every
                group matches these:
              </p>
              <p class="font-mono text-lg text-highlighted" data-testid="their-fingerprint">
                {{ seats[proposal.id]?.fingerprint }}
              </p>
              <UButton class="self-start" :loading="busy" @click="grant(proposal.id)">
                They match. Give them the key
              </UButton>
            </template>

            <div class="flex gap-3">
              <UButton
                v-if="!proposal.voted"
                size="sm"
                :disabled="busy"
                @click="act(proposal.id, 'vote')"
              >
                Agree
              </UButton>
              <UButton
                v-if="proposal.mine"
                size="sm"
                variant="ghost"
                color="neutral"
                :disabled="busy"
                @click="act(proposal.id, 'withdraw')"
              >
                Withdraw
              </UButton>
            </div>
          </div>
        </UCard>
      </section>

      <section aria-labelledby="add-heading" class="flex flex-col gap-3">
        <h2 id="add-heading" class="text-xl text-highlighted">Ask someone to keep it with you</h2>
        <UCard>
          <form class="flex flex-col gap-4" @submit.prevent="propose">
            <UFormField
              label="Their email"
              name="email"
              :help="`The address they sign in to ${appName} with. They need an account first.`"
            >
              <UInput v-model="email" type="email" size="lg" class="w-full" autocomplete="off" />
            </UFormField>
            <UFormField label="As" name="role">
              <USelect v-model="role" :items="ROLES" class="w-full" />
            </UFormField>
            <UButton type="submit" class="self-start" :loading="busy" :disabled="!email.trim()">
              Ask them
            </UButton>
          </form>
        </UCard>
      </section>
    </template>
  </div>
</template>
