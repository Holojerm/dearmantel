// POST /api/mantels/handover/name — a keeper gives the address the child
// will take their mantel with. Any one keeper can, so every other keeper is
// told. On or after the handover day it is invited at once; before, the
// daily task invites it on the day.

import { db } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'
import { normalizeEmail } from '#server/utils/users'

import { nameChild } from '../../../utils/handover'
import { markHandoverSent } from '../../../utils/handover-due'
import { mailHandoverInvite, mailHandoverNamed } from '../../../utils/handover-mail'
import { getMantel } from '../../../utils/mantels'

const bodySchema = z.object({
  mantelId: z.string().uuid(),
  email: z.string().trim().email().max(254),
})

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  'not-child': [409, "Only a child's mantel with a handover day is handed over."],
  'key-given': [409, 'The key has been handed over, so the address no longer changes.'],
  'is-keeper': [409, 'That address keeps this mantel. Give the address of the child.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantels-handover-name',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, bodySchema.parse)
  const now = await postNow()
  const outcome = await nameChild(db, user.id, body, now)
  if (outcome.result !== 'named') {
    const [statusCode, message] = REFUSALS[outcome.result]
    throw createError({ statusCode, message, data: { reason: outcome.result } })
  }

  const email = normalizeEmail(body.email)
  const mantel = await getMantel(db, user.id, body.mantelId)
  const { users, people } = tables
  const [me] = await db
    .select({ account: users.name, chosen: people.displayName })
    .from(users)
    .leftJoin(people, eq(people.userId, users.id))
    .where(eq(users.id, user.id))
    .limit(1)
  if (mantel?.handoverOn) {
    await mailHandoverNamed(db, {
      keeperIds: outcome.others,
      keeperName: me?.chosen ?? me?.account ?? 'A keeper',
      mantelId: mantel.id,
      mantelName: mantel.name,
      email,
      handoverOn: mantel.handoverOn,
    })
    if (outcome.due) {
      await mailHandoverInvite(email, mantel.name)
      await markHandoverSent(db, mantel.id, { invited: email }, now)
    }
  }
  return { invited: outcome.due }
})
