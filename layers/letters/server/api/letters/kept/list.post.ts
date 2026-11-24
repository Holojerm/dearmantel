// POST /api/letters/kept/list — a kept mantel's post and what has arrived on
// it, for one of its keepers. A sealed letter is listed with its opening day
// and nothing else.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'
import { getProfile } from '#layers/post/server/utils/profile'

import { guestLinkFor } from '../../../utils/guest-letters'
import { listKeptMantel, listWriters } from '../../../utils/kept-mantel'
import { countSent } from '../../../utils/kept-sent'
import { openingsView } from '../../../utils/openings'

const bodySchema = z.object({ mantelId: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { mantelId } = await readValidatedBody(event, bodySchema.parse)
  const now = await postNow()
  const letters = await listKeptMantel(db, user.id, mantelId, now)
  const writing = await listWriters(db, user.id, mantelId, now)
  if (!letters || !writing)
    throw createError({ statusCode: 404, message: 'You do not keep that mantel.' })
  const profile = await getProfile(db, mantelId)
  return {
    post: profile
      ? {
          city: profile.cityName,
          country: profile.country,
          mailDays: profile.mailDays,
          deliveryHour: profile.deliveryHour,
          pendingMailDays: profile.pendingMailDays,
          pendingDeliveryHour: profile.pendingDeliveryHour,
          pendingFrom: profile.pendingFrom,
        }
      : null,
    letters,
    // Letters a child's mantel wrote, which a keeper's copy holds too.
    sent: await countSent(db, mantelId),
    ...writing,
    openings: await openingsView(db, user.id, mantelId),
    guestLink: await guestLinkFor(db, user.id, mantelId),
  }
})
