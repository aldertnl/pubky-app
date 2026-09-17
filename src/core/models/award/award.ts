import Dexie, { type Table } from 'dexie';
import { type AwardCommand, type AwardSnapshot } from '@/libs/awards/awards';

interface PendingAward {
  user: string;
  command: AwardCommand;
  stage: 'command' | 'mirror';
  snapshot?: AwardSnapshot;
}
class AwardsDatabase extends Dexie {
  snapshots!: Table<{ user: string; snapshot: AwardSnapshot }, string>;
  pending!: Table<PendingAward, string>;
  constructor() {
    super('arena-awards-v1');
    this.version(1).stores({ snapshots: '&user', pending: '&user' });
  }
}
const db = new AwardsDatabase();
export class AwardModel {
  static async get(user: string) {
    return (await db.snapshots.get(user))?.snapshot;
  }
  static async save(user: string, snapshot: AwardSnapshot) {
    await db.snapshots.put({ user, snapshot });
  }
  static async pending(user: string) {
    return db.pending.get(user);
  }
  static async claim(entry: PendingAward) {
    await db.pending.add(entry);
  }
  static async queue(entry: PendingAward) {
    await db.pending.put(entry);
  }
  static async done(user: string) {
    await db.pending.delete(user);
  }
}
