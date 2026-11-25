// GET /api/letters/mantel — what has arrived for the signed-in person.

import { db } from '@nuxthub/db'

import { postNow } from '#layers/post/server/utils/clock'

import { listMantel } from '../../utils/mantel'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { items: await listMantel(db, user.id, await postNow()) }
})
