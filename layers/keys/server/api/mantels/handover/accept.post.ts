// POST /api/mantels/handover/accept — the child accepts their mantel, from
// the account with the address they were invited at. A keeper then checks
// the key's fingerprint with them and hands it over.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { acceptHandover } from '../../../utils/handover'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const result = await acceptHandover(db, user.id, mantelId, await postNow())
  if (result === 'no-keys') {
    throw createError({ statusCode: 409, message: 'Set up your own keys first.' })
  }
  if (result === 'gone') {
    throw createError({ statusCode: 404, message: 'That mantel is not waiting for you.' })
  }
  return { ok: true }
})
