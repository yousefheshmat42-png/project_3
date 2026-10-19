// In-process transport for tests/demos; HTTP mode exercises real sockets.
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
export async function createClient(app, useHttp = false) {
  let server;
  let base = 'http://in-process.test';
  if (useHttp) {
    server = app.listen(0,'127.0.0.1');
    await once(server,'listening');
    base = 'http://127.0.0.1:' + server.address().port;
  }
  async function fetchRequest(url, options = {}) {
    if(useHttp) return fetch(url,options);
    const req = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)]);
    const parsed = new URL(url);
    req.url = parsed.pathname + parsed.search;
    req.method = options.method || 'GET';
    req.headers = Object.fromEntries(Object.entries(options.headers || {}).map(([k,v])=>[k.toLowerCase(),v]));
    const output=[];
    const res=new Writable({ write(chunk, encoding, callback) { output.push(Buffer.from(chunk)); callback(); } });
    res.statusCode=200;
    const headers={};
    res.setHeader=(name,value)=>{headers[name.toLowerCase()]=value;};
    await app.handle(req,res);
    await finished(res);
    const body=Buffer.concat(output).toString('utf8');
    return {status:res.statusCode,headers,json:async()=>JSON.parse(body)};
  }
  async function request(method,path,body,token,adminKey) {
    const response=await fetchRequest(base+path,{method,headers:{
      'Content-Type':'application/json',...(token ? {Authorization:'Bearer '+token}:{}),
      ...(adminKey ? {'X-Admin-Key':adminKey}:{})
    },body:body===undefined ? undefined : JSON.stringify(body)});
    return {status:response.status,body:response.status===204 ? null : await response.json()};
  }
  async function close() { if(server) await new Promise(resolve=>server.close(resolve)); }
  return {request,fetchRequest,base,close};
}
