import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createClient } from './client.js';
const adminKey=randomBytes(32).toString('hex');
const {app,db}=createApp({adminKey});
const client=await createClient(app,process.argv.includes('--http'));
async function step(label,method,path,body,token,key,expected) {
  const response=await client.request(method,path,body,token,key);
  if(expected) assert.equal(response.status,expected);
  else assert.ok(response.status>=200 && response.status<300,JSON.stringify(response));
  console.log('\n'+label+' ['+response.status+']');
  console.log(JSON.stringify(response.body,null,2));
  return response.body;
}
try {
  console.log('Appointment Booking API — isolated demo ('+(process.argv.includes('--http')?'HTTP':'in-process')+')');
  const credentials={email:'student@example.test',password:'Example-pass-123'};
  await step('Register demo user','POST','/auth/register',credentials);
  const login=await client.request('POST','/auth/login',credentials);
  assert.equal(login.status,200);
  const token=login.body.token; // Do not print session tokens.
  
const start=Date.now()+7*24*60*60*1000;
const slot=await step('Admin publishes slot','POST','/slots',{provider:'Tutor A',starts_at:new Date(start).toISOString(),ends_at:new Date(start+3600000).toISOString()},undefined,adminKey);
const booking=await step('Reserve appointment','POST','/bookings',{slot_id:slot.id},token);
await step('Reject second booking','POST','/bookings',{slot_id:slot.id},token,undefined,409);
await step('Cancel appointment','PATCH','/bookings/'+booking.id+'/cancel',{},token);
await step('Slot available again','GET','/slots');

} finally { await client.close(); db.close(); }

