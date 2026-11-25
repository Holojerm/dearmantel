// POST /api/letters/handover/close — the last step of a handover, which
// cannot be undone: every letter becomes the child's, and the mantel's key
// and its keepers go, in one batch. Refused while any letter key the mantel
// holds has no copy for the child waiting.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { closeHandover } from '../../../utils/handover-letters'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantel-handover-close',
    limit: 30,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const result = await closeHandover(db, user.id, mantelId, await postNow())
  if (result === 'handed-over') return { status: result }
  throw createError({
    statusCode: 409,
    message:
      result === 'letters-left'
        ? 'A letter arrived while this was working. Try again.'
        : 'This mantel is not ready to be yours yet.',
    data: { reason: result },
  })
})
