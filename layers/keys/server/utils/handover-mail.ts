// The emails of a child's handover (emails/templates/mantel-handover*.vue).
// Fixed wording: the mantel's name, a day, and a link that needs a session.

import { inArray } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import { mailableMantelName } from '#layers/letters/shared/utils/invites'
import { sendEmail } from '#server/utils/email'
import { composeEmail, emailBranding } from '#server/utils/email-templates'

import type { KeysDb } from './keys'

const longDay = (on: string) =>
  new Date(`${on}T12:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

async function addressesOf(db: KeysDb, userIds: string[]) {
  if (userIds.length === 0) return []
  const rows = await db
    .select({ email: tables.users.email })
    .from(tables.users)
    .where(inArray(tables.users.id, userIds))
  return rows.map((row) => row.email)
}

/** To the address a keeper gave for the child, on or after the handover day. */
export async function mailHandoverInvite(to: string, mantelName: string) {
  const brand = emailBranding()
  await sendEmail({
    to,
    ...composeEmail('mantel-handover', 'Letters have been kept for you', brand, {
      mantelName: mailableMantelName(mantelName),
      url: `${brand.appUrl}/mantels`,
    }),
  })
}

/** To every other keeper, when one of them gives the child's address. */
export async function mailHandoverNamed(
  db: KeysDb,
  input: {
    keeperIds: string[]
    keeperName: string
    mantelId: string
    mantelName: string
    email: string
    handoverOn: string
  },
) {
  const brand = emailBranding()
  const mantelName = mailableMantelName(input.mantelName)
  for (const to of await addressesOf(db, input.keeperIds)) {
    await sendEmail({
      to,
      ...composeEmail('mantel-handover-named', `An address was given for ${mantelName}`, brand, {
        mantelName,
        keeperName: input.keeperName,
        email: input.email,
        handoverDate: longDay(input.handoverOn),
        url: `${brand.appUrl}/mantels/${input.mantelId}`,
      }),
    })
  }
}

/** To every keeper, once, when the handover day comes. */
export async function mailHandoverDue(
  db: KeysDb,
  input: { keeperIds: string[]; mantelId: string; mantelName: string },
) {
  const brand = emailBranding()
  const mantelName = mailableMantelName(input.mantelName)
  for (const to of await addressesOf(db, input.keeperIds)) {
    await sendEmail({
      to,
      ...composeEmail('mantel-handover-due', `${mantelName}'s handover day has come`, brand, {
        mantelName,
        url: `${brand.appUrl}/mantels/${input.mantelId}`,
      }),
    })
  }
}
