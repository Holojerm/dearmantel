// POST /api/mantels — open a mantel. Its keys were made in the caller's
// browser: the body carries the public key and two wrapped copies of the
// private key, which the server cannot open.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { HANDOVER_MAX_YEARS, newMantelSchema } from '../../../shared/utils/mantel-format'
import { createMantel } from '../../utils/mantels'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantels-create',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, newMantelSchema.parse)
  const result = await createMantel(db, user.id, body, await postNow())
  if (result === 'no-keys') {
    throw createError({ statusCode: 409, message: 'Set up your own keys first.' })
  }
  if (result === 'bad-day') {
    throw createError({
      statusCode: 400,
      message: `Choose a handover day after today and within ${HANDOVER_MAX_YEARS} years.`,
    })
  }
  if (result === 'exists') {
    throw createError({ statusCode: 409, message: 'That mantel already exists.' })
  }
  return { id: body.id }
})
