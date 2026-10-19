// A small HTTP router for these teaching projects, using only Node.js.
import { createServer } from 'node:http';
function match(pattern, path, prefix) {
  const expected = pattern.split('/').filter(Boolean);
  const actual = path.split('/').filter(Boolean);
  if (prefix ? actual.length < expected.length : actual.length !== expected.length) return null;
  const params = {};
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    else if (expected[i] !== actual[i]) return null;
  }
  return params;
}
export function createRouter() {
  const layers = [];
  const app = {
    handle,
    use(path, ...handlers) {
      if (typeof path === 'function') { handlers.unshift(path); path = '/'; }
      for (const handler of handlers) layers.push({path, handler, prefix:true});
      return app;
    },
    listen(...args) { return createServer(handle).listen(...args); }
  };
  for (const method of ['GET','POST','PATCH','DELETE']) app[method.toLowerCase()] = (path,...handlers) => {
    for (const handler of handlers) layers.push({path, handler, method, prefix:false});
    return app;
  };
  async function handle(req,res) {
    res.status = code => { res.statusCode=code; return res; };
    res.set = (name,value) => { res.setHeader(name,value); return res; };
    res.json = value => { res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(value)); return res; };
    req.get = name => req.headers[name.toLowerCase()];
    let error;
    try {
      const url = new URL(req.url,'http://localhost');
      req.path=url.pathname;
      req.query=Object.create(null);
      for (const [key,value] of url.searchParams) {
        req.query[key] = key in req.query ? [].concat(req.query[key],value) : value;
      }
      if ((req.get('Content-Type') || '').split(';')[0].trim().toLowerCase() === 'application/json') {
        let size=0;
        const chunks=[];
        // Keep at most 16 KiB in memory; discard any excess input.
        await new Promise((resolve,reject) => {
          req.on('data',chunk => { size+=chunk.length; if(size<=16384) chunks.push(chunk); });
          req.on('end',resolve); req.on('error',reject);
        });
        if(size>16384) throw Object.assign(new Error('JSON body exceeds 16 KiB'),{status:413});
        if(size) {
          try { req.body=JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { throw Object.assign(new Error('Invalid JSON'),{status:400,type:'entity.parse.failed'}); }
        }
      }
    } catch(caught) { error=caught instanceof URIError ? Object.assign(caught,{status:400}) : caught; }
    for (const layer of layers) {
      if(res.writableEnded) return;
      const isErrorHandler=layer.handler.length===4;
      if(Boolean(error)!==isErrorHandler) continue;
      if(layer.method && layer.method!==req.method) continue;
      let params;
      try { params=match(layer.path,req.path || '/',layer.prefix); }
      catch(caught) { error=Object.assign(caught,{status:400}); continue; }
      if(params===null) continue;
      req.params=params;
      let advanced=false;
      const next = caught => { error=caught; advanced=true; };
      try {
        if(isErrorHandler) await layer.handler(error,req,res,next);
        else await layer.handler(req,res,next);
      } catch(caught) { error=caught; advanced=true; }
      if(!advanced) return;
    }
    if(!res.writableEnded) res.status(error ? 500 : 404).json({error:error ? 'Internal server error' : 'Route not found'});
  }
  return app;
}
