// POST /api/mantels/proposals — propose adding a keeper (by address),
// removing one, closing the mantel or changing its key. The caller's vote is
// cast with it.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { KEEPER_ROLES } from '../../../../shared/utils/mantel-format'
import { proposeClose } from '../../../utils/close-mantel'
import { proposeKeeper, proposeRemoval } from '../../../utils/custody'
import { proposeRekey } from '../../../utils/rekey-vote'

const bodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add_keeper'),
    mantelId: z.string().uuid(),
    email: z.string().trim().email().max(254),
    role: z.enum(KEEPER_ROLES),
  }),
  z.object({
    kind: z.literal('remove_keeper'),
    mantelId: z.string().uuid(),
    keeperId: z.string().min(1).max(64),
  }),
  z.object({ kind: z.literal('close'), mantelId: z.string().uuid() }),
  z.object({ kind: z.literal('rekey'), mantelId: z.string().uuid() }),
])

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  closed: [409, 'That mantel is closed.'],
  'already-keeper': [409, 'They already keep this mantel.'],
  'not-a-keeper': [409, 'They do not keep this mantel.'],
  'already-proposed': [409, 'Closing this mantel is already waiting to be settled.'],
  'handed-over': [409, 'That mantel has been handed over.'],
  'already-due': [409, "This mantel's key is already waiting to be changed."],
} as const
const REKEY_WAITING = "Changing this mantel's key is already waiting to be settled."

function propose(userId: string, body: z.infer<typeof bodySchema>, now: Date) {
  if (body.kind === 'add_keeper') return proposeKeeper(db, userId, body, now)
  if (body.kind === 'remove_keeper') return proposeRemoval(db, userId, body, now)
  if (body.kind === 'close') return proposeClose(db, userId, body.mantelId, now)
  return proposeRekey(db, userId, body.mantelId, now)
}

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantels-propose',
    limit: 20,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, bodySchema.parse)
  const now = await postNow()
  const outcome = await propose(user.id, body, now)
  if (outcome.result !== 'proposed') {
    const [statusCode, said] = REFUSALS[outcome.result]
    const message =
      body.kind === 'rekey' && outcome.result === 'already-proposed' ? REKEY_WAITING : said
    throw createError({ statusCode, message, data: { reason: outcome.result } })
  }
  return {
    id: outcome.proposalId,
    closed: 'closed' in outcome && outcome.closed,
    rekeyDue: 'due' in outcome && outcome.due,
  }
})
