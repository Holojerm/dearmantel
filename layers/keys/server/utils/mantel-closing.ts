// What other layers do when the keepers close a mantel. Keys knows nothing of
// letters, so the letters plugin registers here what ends writing to it
// (layers/letters/server/utils/mantel-closed.ts).

import type { BatchItem } from 'drizzle-orm/batch'

import { createRegistry } from '#server/utils/registry'

import type { KeysDb } from './keys'

export interface MantelClosure {
  mantelId: string
  mantelName: string
  kind: string
  /** The keeper whose vote carried it, or who proposed it alone. */
  closedBy: string
  /** Who keeps it, closedBy included. They still do. */
  keeperIds: string[]
  now: Date
}

export interface MantelClosedHandler {
  key: string
  /** Run in the same D1 batch as the closing: all of it lands, or none. */
  statements: (db: KeysDb, closure: MantelClosure) => BatchItem<'sqlite'>[]
  /** Run once, after that batch landed: what cannot go in a batch, such as mail. */
  after?: (db: KeysDb, closure: MantelClosure) => Promise<void>
}

const handlers = createRegistry<MantelClosedHandler>()

export const onMantelClosed = (handler: MantelClosedHandler): void =>
  handlers.set(handler.key, handler)

export const mantelClosedStatements = (db: KeysDb, closure: MantelClosure) =>
  handlers.values().flatMap((handler) => handler.statements(db, closure))

export async function afterMantelClosed(db: KeysDb, closure: MantelClosure): Promise<void> {
  for (const handler of handlers.values()) await handler.after?.(db, closure)
}
