// GET /api/letters/photo/<letter> — the sealed photo of a letter the caller
// wrote or has received. With `?mantel=<id>` it is a letter on a mantel the
// caller keeps, and a letter sealed until a day gives up no photo before it;
// or, for a child's mantel, one the mantel wrote.
// Fetching a photo does not mark the letter as read.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { readKeptPhoto } from '../../../utils/kept-mantel'
import { writingAs } from '../../../utils/mantel-author'
import { photoStore } from '../../../utils/photo-store'
import { ownPhoto, readPhoto } from '../../../utils/photos'

const querySchema = z.object({ mantel: z.string().uuid().optional() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = letterIdSchema.safeParse(getRouterParam(event, 'id'))
  const query = querySchema.safeParse(getQuery(event))
  let sealed: ArrayBuffer | null = null
  if (id.success && query.success) {
    const mantel = query.data.mantel
    const now = await postNow()
    if (!mantel) sealed = await readPhoto(db, photoStore, user.id, id.data, now)
    else {
      sealed = await readKeptPhoto(db, photoStore, user.id, mantel, id.data, now)
      // Never readPhoto as the mantel: that would pass over the seal on what it received.
      if (!sealed && (await writingAs(db, user.id, mantel)) === mantel) {
        sealed = await ownPhoto(db, photoStore, mantel, id.data)
      }
    }
  }
  if (!sealed) throw createError({ statusCode: 404, message: 'There is no photo here for you.' })
  setHeader(event, 'cache-control', 'private, no-store')
  return send(event, new Uint8Array(sealed), 'application/octet-stream')
})
