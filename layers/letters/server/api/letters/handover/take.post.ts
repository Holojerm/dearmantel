// POST /api/letters/handover/take — for the child's browser: the mantel's
// public key, the child's copy of its private key, and the next letter keys
// to wrap again to the child's own key, with how many are left after them.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { handoverToTake } from '#layers/keys/server/utils/handover'

import { handoverPlan } from '../../../utils/handover-letters'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const mantel = await handoverToTake(db, user.id, mantelId)
  const plan = mantel && (await handoverPlan(db, user.id, mantelId))
  if (!mantel || !plan) {
    throw createError({ statusCode: 409, message: 'This mantel is not ready to be yours yet.' })
  }
  return { ...mantel, ...plan }
})
