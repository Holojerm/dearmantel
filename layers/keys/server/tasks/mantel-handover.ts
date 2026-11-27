// Daily: child's mantels whose handover day has come. The address a keeper
// gave is invited, and the keepers are told the day has come, once each.
//
// Wired like every scheduled task: `SCHEDULED_TASKS` in nuxt.config.ts, on a
// cron already in `[triggers] crons` in wrangler.toml.
//
// Hand-run in dev: curl https://dearmantel.localhost/_nitro/tasks/mantel-handover

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'
import { logEvent } from '#server/utils/log'
import { recordOpsEvent } from '#server/utils/ops'

import { dueHandovers, markHandoverSent } from '../utils/handover-due'
import { mailHandoverDue, mailHandoverInvite } from '../utils/handover-mail'

export default defineTask({
  meta: {
    name: 'mantel-handover',
    description: "Invite each child whose mantel's handover day has come, and tell its keepers",
  },
  async run() {
    const now = await postNow()
    let invited = 0
    let failed = 0
    for (const due of await dueHandovers(db, now)) {
      // Marked only once sent, so a failed send is tried again tomorrow.
      try {
        if (due.invite) {
          await mailHandoverInvite(due.invite, due.name)
          await markHandoverSent(db, due.mantelId, { invited: due.invite }, now)
          invited += 1
        }
        if (due.tellKeepers) {
          await mailHandoverDue(db, {
            keeperIds: due.keeperIds,
            mantelId: due.mantelId,
            mantelName: due.name,
          })
          await markHandoverSent(db, due.mantelId, { keepersTold: true }, now)
        }
      } catch (error) {
        failed += 1
        logEvent('error', 'mantel_handover_failed', { error: String(error) })
      }
    }
    if (failed > 0) {
      await recordOpsEvent(db, { kind: 'mantel_handover_failed', detail: `${failed} failed` })
    }
    logEvent('info', 'mantel_handover', { invited, failed })
    return { result: { invited, failed } }
  },
})
