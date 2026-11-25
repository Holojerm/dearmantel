// What other layers do when the keepers vote someone off a mantel. Keys knows
// nothing of letters, so the letters plugin registers here what ends the
// removed keeper's other ways in (layers/letters/server/utils/letters-extensions.ts).

import type { BatchItem } from 'drizzle-orm/batch'

import { createRegistry } from '#server/utils/registry'

import type { KeysDb } from './keys'

export interface KeeperRemoval {
  mantelId: string
  userId: string
  now: Date
}

export interface KeeperRemovalHandler {
  key: string
  /** Run in the same D1 batch as the removal: all of it lands, or none. */
  statements: (db: KeysDb, removal: KeeperRemoval) => BatchItem<'sqlite'>[]
}

const handlers = createRegistry<KeeperRemovalHandler>()

export const onKeeperRemoved = (handler: KeeperRemovalHandler): void =>
  handlers.set(handler.key, handler)

export const keeperRemovalStatements = (db: KeysDb, removal: KeeperRemoval) =>
  handlers.values().flatMap((handler) => handler.statements(db, removal))
