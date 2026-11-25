// POST /api/letters/handover/move — a batch of letter keys the child's
// browser wrapped again to the child's own key. They wait, read by nothing,
// until the last step files them all at once.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { handoverMoveSchema, stageHandoverKeys } from '../../../utils/handover-letters'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, handoverMoveSchema.parse)
  if ((await stageHandoverKeys(db, user.id, body, await postNow())) !== 'moved') {
    throw createError({ statusCode: 409, message: 'This mantel is not ready to be yours yet.' })
  }
  return { ok: true }
})
