import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
test('registration, normalized email, password hashing, login and logout', async t => {
  const {request, db} = await fixture(t);
  const input = {email:'Student@Example.test', password:'Example-pass-123'};
  const signup = await request('POST','/auth/register',input);
  assert.equal(signup.status,201); assert.equal(signup.body.email,'student@example.test');
  assert.equal(signup.body.password_hash,undefined);
  assert.notEqual(db.prepare('SELECT password_hash FROM users').get().password_hash,input.password);
  assert.equal((await request('POST','/auth/register',input)).status,409);
  assert.equal((await request('POST','/auth/login',{...input,password:'Incorrect-pass'})).status,401);
  const login = await request('POST','/auth/login',input);
  assert.equal(login.status,200); assert.equal(login.body.token.length,64);
  assert.equal((await request('POST','/auth/logout',{},login.body.token)).status,204);
  assert.equal((await request('POST','/auth/logout',{},login.body.token)).status,401);
});
test('expired sessions are rejected', async t => {
  const {request,user,db} = await fixture(t); const token = await user();
  db.prepare('UPDATE sessions SET expires_at = 0').run();
  assert.equal((await request('POST','/auth/logout',{},token)).status,401);
});
test('bad credentials and malformed requests produce controlled errors', async t => {
  const {request,base,fetchRequest} = await fixture(t);
  assert.equal((await request('POST','/auth/register',{email:'bad',password:'short'})).status,400);
  assert.equal((await request('POST','/auth/register',[])).status,400);
  const response = await fetchRequest(base + '/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(response.status,400); assert.deepEqual(await response.json(),{error:'Invalid JSON'});
  assert.equal((await request('GET','/missing')).status,404);
});

