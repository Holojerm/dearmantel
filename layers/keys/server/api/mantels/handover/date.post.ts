// POST /api/mantels/handover/date — propose the day a child's mantel is
// handed over. The caller's vote is cast with it; it is set once more than
// half of the keepers agree, so a mantel's only keeper sets it at once.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { daySchema, HANDOVER_MAX_YEARS } from '../../../../shared/utils/mantel-format'
import { proposeHandoverDate } from '../../../utils/handover-date'

const bodySchema = z.object({ mantelId: z.string().uuid(), on: daySchema })

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  'not-child': [409, "Only a child's mantel is handed over."],
  passed: [409, 'The handover day has come, so it no longer moves.'],
  'bad-day': [400, `Choose a day after today and within ${HANDOVER_MAX_YEARS} years.`],
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
  const outcome = await proposeHandoverDate(db, user.id, body, await postNow())
  if (outcome.result !== 'proposed') {
    const [statusCode, message] = REFUSALS[outcome.result]
    throw createError({ statusCode, message, data: { reason: outcome.result } })
  }
  return { id: outcome.proposalId, carried: outcome.carried }
})
