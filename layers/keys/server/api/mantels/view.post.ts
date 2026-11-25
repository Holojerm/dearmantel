// POST /api/mantels/view — one mantel as a keeper sees it: who keeps it, the
// caller's own wrapped copy of its key, and its open custody proposals.

import { db } from '@nuxthub/db'
import { eq, inArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { proposalsOf } from '../../utils/custody'
import { handoverForKeeper } from '../../utils/handover'
import { getMantel } from '../../utils/mantels'
import { recoveriesOf } from '../../utils/recovery'
import { takeRecoveryCodeNotice } from '../../utils/recovery-code'

const bodySchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { id } = await readValidatedBody(event, bodySchema.parse)
  const mantel = await getMantel(db, user.id, id)
  if (!mantel) throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })

  const { users, people } = tables
  const now = await postNow()
  const proposals = await proposalsOf(db, user.id, id, now)
  const childHandover = await handoverForKeeper(db, user.id, id, now)
  const ids = [
    ...(childHandover?.childId ? [childHandover.childId] : []),
    ...mantel.keepers.map((keeper) => keeper.userId),
    ...proposals.map((proposal) => proposal.subjectId).filter((who): who is string => Boolean(who)),
  ]
  const named = await db
    .select({ id: users.id, account: users.name, chosen: people.displayName })
    .from(users)
    .leftJoin(people, eq(people.userId, users.id))
    .where(inArray(users.id, ids))
  const nameOf = (who: string | null) => {
    const row = named.find((entry) => entry.id === who)
    return row ? (row.chosen ?? row.account) : null
  }

  return {
    ...mantel,
    me: user.id,
    keepers: mantel.keepers.map((keeper) => ({ ...keeper, name: nameOf(keeper.userId) })),
    proposals: proposals.map((proposal) => ({ ...proposal, name: nameOf(proposal.subjectId) })),
    recoveries: await recoveriesOf(db, user.id, id),
    childHandover: childHandover && {
      ...childHandover,
      childName: nameOf(childHandover.childId),
      namedBy: nameOf(childHandover.namedBy),
    },
    // `recoveryProofHash` (from getMantel) lets this keeper's browser tell
    // whether a code it made is the mantel's code. It is a hash of a value
    // derived from the code, and a keeper holds the key itself.
    recoveryCodeReplacedAt: (await takeRecoveryCodeNotice(db, user.id, id))?.toISOString() ?? null,
  }
})
