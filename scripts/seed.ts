// Dev only: fill an empty database with the prototype's sample data.
//   npm run seed            → seeds only if the database has no items, nights or naps
//   npm run seed -- --force → wipes items, nights and naps first
import '../server/env.ts';
import { seed } from '../shared/seed.ts';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV is production.');
  process.exit(1);
}

const { db, listAll, upsert, putSettings } = await import('../server/db.ts');
const force = process.argv.includes('--force');
const count = listAll('items').length + listAll('nights').length + listAll('naps').length;
if (count && !force) {
  console.error(`Database already has ${count} records. Re-run with --force to replace them.`);
  process.exit(1);
}
if (force) db.exec('DELETE FROM items; DELETE FROM nights; DELETE FROM naps;');

const s = seed();
db.transaction(() => {
  s.items.forEach(i => upsert('items', i));
  s.nights.forEach(n => upsert('nights', n));
  s.naps.forEach(n => upsert('naps', n));
  putSettings(s.settings);
})();
console.log(`Seeded ${s.items.length} items, ${s.nights.length} nights, ${s.naps.length} naps.`);
