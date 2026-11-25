// GET /api/mantels — the mantels the caller keeps, seats offered to them,
// their own uses of a recovery code that are still waiting, and a child's
// mantel being handed over to them.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { offersFor } from '../../utils/custody'
import { handoversFor } from '../../utils/handover'
import { listMantels } from '../../utils/mantels'
import { myRecoveries, unkeptClaims } from '../../utils/recovery'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const now = await postNow()
  const recoveries = await myRecoveries(db, user.id, now)
  const unkept = await unkeptClaims(
    db,
    recoveries.map((claim) => claim.id),
  )
  return {
    mantels: await listMantels(db, user.id),
    offers: await offersFor(db, user.id, now),
    recoveries: recoveries.map((claim) => ({ ...claim, unkept: unkept.has(claim.id) })),
    handovers: await handoversFor(db, user.id),
  }
})
