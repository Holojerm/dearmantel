// POST /api/mantels/proposals — propose adding a keeper (by address),
// removing one, or closing the mantel. The caller's vote is cast with it.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { KEEPER_ROLES } from '../../../../shared/utils/mantel-format'
import { proposeClose } from '../../../utils/close-mantel'
import { proposeKeeper, proposeRemoval } from '../../../utils/custody'

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
])

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  closed: [409, 'That mantel is closed.'],
  'already-keeper': [409, 'They already keep this mantel.'],
  'not-a-keeper': [409, 'They do not keep this mantel.'],
  'already-proposed': [409, 'Closing this mantel is already waiting to be settled.'],
} as const

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
  const outcome =
    body.kind === 'add_keeper'
      ? await proposeKeeper(db, user.id, body, now)
      : body.kind === 'remove_keeper'
        ? await proposeRemoval(db, user.id, body, now)
        : await proposeClose(db, user.id, body.mantelId, now)
  if (outcome.result !== 'proposed') {
    const [statusCode, message] = REFUSALS[outcome.result]
    throw createError({ statusCode, message, data: { reason: outcome.result } })
  }
  return { id: outcome.proposalId, closed: 'closed' in outcome && outcome.closed }
})
