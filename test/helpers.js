import { createApp } from '../src/app.js';
import { createClient } from '../scripts/client.js';
export async function fixture(t) {
  const {app,db}=createApp({adminKey:'test-admin-key'});
  const client=await createClient(app,process.env.TEST_TRANSPORT==='http');
  t.after(async()=>{await client.close(); db.close();});
  const request=(method,path,body,token,admin=false)=>client.request(method,path,body,token,admin ? 'test-admin-key':undefined);
  async function user(email='student@example.test') {
    const input={email,password:'Example-pass-123'};
    await request('POST','/auth/register',input);
    return (await request('POST','/auth/login',input)).body.token;
  }
  return {...client,request,user,db};
}
