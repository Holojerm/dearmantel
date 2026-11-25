// A keeper removed by the others' vote stops writing to the mantel through
// the correspondence they had as a keeper (pentest DP-16). A writer the
// keepers invited is untouched, and so is what the removed keeper posted.

import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '~~/server/db/schema'

import { proposeRemoval, voteForProposal } from '#layers/keys/server/utils/custody'

import { openMantelCorrespondence } from '../server/utils/correspondences'
import { saveDraft } from '../server/utils/drafts'
import { listWriters } from '../server/utils/kept-mantel'
import { registerLettersExtensions } from '../server/utils/letters-extensions'
import { planSeal, sealLetter } from '../server/utils/posting'

const db = drizzle(env.DB, { schema })
const {
  users,
  userKeys,
  postalProfiles,
  mantels,
  mantelKeepers,
  mantelKeyWraps,
  mantelProposals,
  mantelVotes,
  correspondences,
  correspondenceMembers,
  letters,
  letterKeys,
  deliveries,
} = schema

const LEO = 'aaaaaaaa-0000-4000-8000-000000000011'
const MONDAY = new Date('2026-11-16T20:00:00Z')
const CIPHERTEXT = `v1.${'A'.repeat(16)}.${'B'.repeat(40)}`
const CHICAGO = {
  cityName: 'Chicago',
  country: 'US',
  lat: 41.85,
  lng: -87.65,
  timeZone: 'America/Chicago',
}
const letterId = (n: number) => `5c1f6c1e-0d3a-4c1f-9e57-${String(n).padStart(12, '0')}`

let calToLeo = ''
let eveToLeo = ''

async function seal(author: string, id: string, correspondenceId: string) {
  await saveDraft(
    db,
    author,
    { id, correspondenceId, ciphertext: CIPHERTEXT, wrappedKey: `key-for-${author}` },
    MONDAY,
  )
  return sealLetter(db, author, id, 'key-for-leo', MONDAY, null, false, { [LEO]: 'leo-key' })
}

/** Ann proposes that Cal stop keeping Leo's mantel, and Bob agrees. */
async function calRemoved() {
  const removal = await proposeRemoval(db, 'ann', { mantelId: LEO, keeperId: 'cal' }, MONDAY)
  if (removal.result !== 'proposed') throw new Error(removal.result)
  expect(await voteForProposal(db, 'bob', removal.proposalId, MONDAY)).toBe('voted')
}

beforeAll(() => registerLettersExtensions())

beforeEach(async () => {
  for (const table of [
    deliveries,
    letterKeys,
    letters,
    correspondenceMembers,
    correspondences,
    mantelVotes,
    mantelProposals,
    mantelKeyWraps,
    mantelKeepers,
    mantels,
    postalProfiles,
    userKeys,
  ]) {
    await db.delete(table)
  }
  await db.delete(users)
  for (const id of ['ann', 'bob', 'cal', 'eve']) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id })
    await db.insert(userKeys).values({ userId: id, publicKey: `public-key-of-${id}` })
    await db.insert(postalProfiles).values({ userId: id, ...CHICAGO })
  }
  await db.insert(mantels).values({ id: LEO, kind: 'child', name: 'Leo', publicKey: 'leo-key' })
  await db.insert(postalProfiles).values({ userId: LEO, ...CHICAGO })
  await db
    .insert(mantelKeepers)
    .values(
      ['ann', 'bob', 'cal'].map((userId) => ({ mantelId: LEO, userId, role: 'guardian' as const })),
    )
  calToLeo = (await openMantelCorrespondence(db, 'cal', LEO, MONDAY))!
  // Granny Eve, a writer the keepers invited.
  eveToLeo = crypto.randomUUID()
  await db.insert(correspondences).values({ id: eveToLeo, mantelId: LEO })
  await db.insert(correspondenceMembers).values([
    { correspondenceId: eveToLeo, userId: 'eve' },
    { correspondenceId: eveToLeo, userId: LEO },
  ])
})

describe('a keeper removed by the others', () => {
  it('can no longer write to the mantel', async () => {
    expect(await planSeal(db, 'cal', calToLeo, MONDAY)).toMatchObject({ recipientId: LEO })
    await calRemoved()
    expect(await planSeal(db, 'cal', calToLeo, MONDAY)).toBe('closed')
    expect((await seal('cal', letterId(1), calToLeo)).status).not.toBe('sealed')
    // Nor by opening a new correspondence: that takes a keeper's seat.
    expect(await openMantelCorrespondence(db, 'cal', LEO, MONDAY)).toBeNull()
  })

  it('is no longer listed among who writes, and the invited writer still is', async () => {
    await calRemoved()
    const view = await listWriters(db, 'ann', LEO, MONDAY)
    const ids = view?.writers.map((writer) => writer.userId) ?? []
    expect(ids).toContain('eve')
    expect(ids).not.toContain('cal')
    expect((await seal('eve', letterId(2), eveToLeo)).status).toBe('sealed')
  })

  it('leaves what they posted as a keeper on its way', async () => {
    expect((await seal('cal', letterId(3), calToLeo)).status).toBe('sealed')
    await calRemoved()
    const [delivery] = await db.select().from(deliveries)
    expect(delivery).toMatchObject({ letterId: letterId(3), state: 'in_transit' })
  })
})
