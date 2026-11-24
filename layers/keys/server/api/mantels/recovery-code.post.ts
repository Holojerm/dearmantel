// POST /api/mantels/recovery-code — a keeper's browser has made a new
// recovery code for the mantel's key, which stays the same, and hands in the
// key locked under it and the hash of the proof it derives. The code itself
// never leaves the browser.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { newRecoveryCodeSchema, replaceMantelRecoveryCode } from '../../utils/recovery-code'

const REFUSALS = {
  'not-keeper': [404, 'You do not keep that mantel.'],
  'rekey-due': [
    409,
    'Someone has stopped keeping this mantel. Change its key instead: that makes a new recovery code too.',
  ],
  changed: [409, 'The mantel changed while this was being done. Reload the page and try again.'],
} as const

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await rateLimit(event, {
    name: 'mantel-recovery-code',
    limit: 10,
    windowSeconds: 3600,
    identifier: user.id,
  })
  const body = await readValidatedBody(event, newRecoveryCodeSchema.parse)
  const result = await replaceMantelRecoveryCode(db, user.id, body, await postNow())
  if (result === 'replaced') return { ok: true }
  const [statusCode, message] = REFUSALS[result]
  throw createError({ statusCode, message, data: { reason: result } })
})
