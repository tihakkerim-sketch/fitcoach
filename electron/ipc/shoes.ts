import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { deleteShoe, listShoes, saveShoe } from '../lib/shoes'

export function registerShoeHandlers() {
  handle(IPC.SHOES_LIST, () => listShoes(getDb()))
  handle(IPC.SHOES_SAVE, (payload) => saveShoe(getDb(), payload))
  handle(IPC.SHOES_DELETE, (id) => { deleteShoe(getDb(), id) })
}
