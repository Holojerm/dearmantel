// POST /api/mantels/handover/seat — hand the mantel's key to the child.
// Without `wrapped` it returns the child's public key, for the fingerprint
// check and the wrap. With it, it stores the copy of the mantel's key the
// caller's browser wrapped to them.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { KEEPER_WRAP_PATTERN } from '../../../../shared/utils/mantel-format'
import { giveHandoverKey, handoverSeat } from '../../../utils/handover'

const bodySchema = z
  .object({
    mantelId: z.string().uuid(),
    childId: z.string().min(1).max(64).optional(),
    wrapped: z.string().regex(KEEPER_WRAP_PATTERN).optional(),
    /** With `wrapped`: the version of the mantel's key the caller's browser opened. */
    keyVersion: z.number().int().min(1).optional(),
  })
  .refine((body) => !body.wrapped || (body.keyVersion !== undefined && body.childId))

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId, childId, wrapped, keyVersion } = await readValidatedBody(
    event,
    bodySchema.parse,
  )
  const now = await postNow()
  const notReady = () =>
    createError({ statusCode: 409, message: 'The key cannot be handed over yet.' })

  if (!wrapped || keyVersion === undefined || !childId) {
    const seat = await handoverSeat(db, user.id, mantelId, now)
    if (!seat) throw notReady()
    return seat
  }
  const given = await giveHandoverKey(db, user.id, { mantelId, childId, wrapped, keyVersion }, now)
  if (given !== 'given') throw notReady()
  return { ok: true }
})
