import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
const start = Date.now() + 7*24*60*60*1000;
const slot = (offset=0,provider='Tutor A') => ({provider,starts_at:new Date(start+offset).toISOString(),ends_at:new Date(start+offset+3600000).toISOString()});
test('admin creates slots; provider overlaps and invalid dates are rejected', async t => {
  const {request} = await fixture(t);
  assert.equal((await request('POST','/slots',slot())).status,403);
  assert.equal((await request('POST','/slots',slot(),undefined,true)).status,201);
  assert.equal((await request('POST','/slots',slot(1000),undefined,true)).status,409);
  assert.equal((await request('POST','/slots',slot(3600000),undefined,true)).status,201);
  assert.equal((await request('POST','/slots',slot(0,'Tutor B'),undefined,true)).status,201);
  for (const starts_at of ['invalid','2020-01-01T09:00:00Z','2030-02-30T09:00:00Z'])
    assert.equal((await request('POST','/slots',{...slot(),starts_at},undefined,true)).status,400);
});
test('competing bookings produce one confirmation; cancellation releases slot', async t => {
  const {request,user} = await fixture(t); const alice = await user(); const bob = await user('bob@example.test');
  const created = await request('POST','/slots',slot(),undefined,true); const slotId=created.body.id;
  const results = await Promise.all([alice,bob].map(token=>request('POST','/bookings',{slot_id:slotId},token)));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal((await request('GET','/slots')).body.items.length,0);
  const winner = results[0].status===201 ? 0 : 1; const tokens=[alice,bob]; const booking=results[winner].body;
  assert.equal((await request('PATCH','/bookings/'+booking.id+'/cancel',{},tokens[1-winner])).status,404);
  assert.equal((await request('GET','/bookings',undefined,tokens[1-winner])).body.items.length,0);
  assert.equal((await request('PATCH','/bookings/'+booking.id+'/cancel',{},tokens[winner])).body.status,'cancelled');
  assert.equal((await request('GET','/slots')).body.items.length,1);
  assert.equal((await request('POST','/bookings',{slot_id:slotId},tokens[1-winner])).status,201);
});
test('past slots cannot be booked or cancelled; provider filtering works', async t => {
  const {request,user,db} = await fixture(t); const token=await user();
  const created=await request('POST','/slots',slot(),undefined,true);
  const booking=await request('POST','/bookings',{slot_id:created.body.id},token);
  db.prepare('UPDATE slots SET starts_at = ?, ends_at = ? WHERE id = ?').run(1000,2000,created.body.id);
  assert.equal((await request('PATCH','/bookings/'+booking.body.id+'/cancel',{},token)).status,409);
  assert.equal((await request('POST','/bookings',{slot_id:created.body.id},token)).status,409);
  await request('POST','/slots',slot(3600000,'Tutor B'),undefined,true);
  assert.equal((await request('GET','/slots?provider=tutor%20b')).body.items.length,1);
  assert.equal((await request('GET','/slots?provider=unknown')).body.items.length,0);
});

