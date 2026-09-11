import assert from 'node:assert/strict';
import { test, after, beforeEach } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import net from 'node:net';
import http from 'node:http';

const result = await build({
  stdin: { contents: [
    'export * from "./commands/scope-export.ts";',
    'export * from "./session.ts";',
    'export * from "./config.ts";',
    'export * from "./mcp/server.ts";',
    'export * from "./mcp/rpc.ts";',
    'export * from "./mcp/http-server.ts";',
    'export * from "./texture/png-io.ts";',
  ].join('\n'), resolveDir: fileURLToPath(new URL('../src',import.meta.url)) },
  bundle: true, platform: 'neutral', format: 'iife', globalName: 'api', write: false,
});
const nativeRequire = createRequire(import.meta.url);
const context = { require: name => context.load(name), load: nativeRequire, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Buffer,
  console, setTimeout, clearTimeout, btoa, atob, Project: {}, Blockbench: {showQuickMessage() {}}, settings: {}, Settings: { saveLocalStorages() {} } };
runInNewContext(result.outputFiles[0].text,context);
const api=context.api;
const testRoot = process.env.BLOCKBENCH_MCP_TEST_ROOT ?? (process.platform === 'win32' ? 'C:/MinecraftDev/BlockBenchMCP-Test' : '/tmp/BlockBenchMCP-Test');
fs.mkdirSync(testRoot,{recursive:true});
const fixture=fs.mkdtempSync(path.join(testRoot,'security-'));
const approved=path.join(fixture,'approved'), outside=path.join(fixture,'outside');
fs.mkdirSync(approved); fs.mkdirSync(outside);
fs.writeFileSync(path.join(outside,'secret.txt'),'disposable-outside');
after(()=>{ assert.equal(path.dirname(fixture),path.resolve(testRoot)); fs.rmSync(fixture,{recursive:true,force:true}); });
beforeEach(()=>{
  context.load=nativeRequire; context.Project={}; context.settings={}; context.Settings={saveLocalStorages(){}};
  context.Codecs={project:{compile:()=>'{"meta":{"model_format":"java_block"}}'}};
  context.Format={id:'java_block',codec:{compile:()=>'{"elements":[]}'}};
  context.window={confirm:()=>false};
  context.Texture={all:[{uuid:'test',name:'test',width:1,height:1,canvas:{width:1,height:1,toDataURL:()=> 'data:image/png;base64,iVBORw0KGgo='}}]};
});
const session=()=>({scopedDirectory:fs.realpathSync(approved)});
const denied=fn=>assert.throws(fn,error=>error.code==='E_SCOPE_DENIED');

test('random token is 256 bits, unique, persisted, migrates public default, autostart opt-in',()=>{
  const tokens=new Set(Array.from({length:64},()=>api.generateSecureToken())); assert.equal(tokens.size,64);
  for(const value of tokens) assert.match(value,/^[a-f0-9]{64}$/);
  context.settings={mcp_secret:{value:'dev-local-secret'}};
  const config=api.readPluginConfig(); assert.equal(config.autostart,false); assert.match(config.secret,/^[a-f0-9]{64}$/);
  assert.equal(context.settings.mcp_secret.value,config.secret); assert.equal(api.readPluginConfig().secret,config.secret);
  context.settings.mcp_autostart={value:true}; assert.equal(api.readPluginConfig().autostart,true);
  context.load=()=>{throw Error('denied')}; assert.throws(()=>api.generateSecureToken());
});

function serverFixture(origins=[]) {
  let connect, bind, closed=false;
  context.load=name=> name==='net' ? {createServer(callback){connect=callback;return {
    on(){},listen(port,host,cb){bind={port,host};cb?.()},close(){closed=true},
  }}}:nativeRequire(name);
  const state=session();
  const handle=api.startMcpHttp({port:39741,secret:'correct-token',autostart:false,allowedOrigins:origins},state);
  async function request({token='correct-token',origin,host='127.0.0.1:39741',remote='127.0.0.1',method='POST',url='/mcp',raw,again=false}={}) {
    const events={};let output='',destroyed=false;
    const socket={remoteAddress:remote,on(name,callback){events[name]=callback},setTimeout(){},write(s){output+=s},destroy(){destroyed=true}};
    connect(socket);
    const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'});
    const headers=[`${method} ${url} HTTP/1.1`];
    if(host!==null) headers.push(`Host: ${host}`);
    if(token!==null) headers.push(`Authorization: Bearer ${token}`);
    if(origin!==undefined) headers.push(`Origin: ${origin}`);
    headers.push(`Content-Length: ${Buffer.byteLength(body)}`);
    const packet=Buffer.from(raw??headers.join('\r\n')+'\r\n\r\n'+body);
    events.data(packet); if(again) events.data(packet);
    await new Promise(resolve=>setImmediate(resolve));
    return {status:Number(output.match(/^HTTP\/1.1 (\d+)/)?.[1]),output,destroyed};
  }
  return {handle,state,request,get bind(){return bind},get closed(){return closed}};
}
test('HTTP authentication, strict Bearer format, legacy header, health and token rotation',async()=>{
  const app=serverFixture();
  for(const token of [null,'wrong','correct-token extra','']) assert.equal((await app.request({token})).status,401);
  assert.equal((await app.request()).status,200);
  assert.equal((await app.request({method:'OPTIONS',token:null})).status,401);
  assert.equal((await app.request({method:'OPTIONS'})).status,204);
  for(const method of ['GET','DELETE']) assert.equal((await app.request({method,token:null})).status,401);
  assert.equal((await app.request({url:'/health',token:null})).status,401);
  app.handle.rotateSecret('new-token'); assert.equal((await app.request()).status,401);
  assert.equal((await app.request({token:'new-token'})).status,200);
  // Authentication succeeds; the deliberately incomplete JSON-RPC envelope then gets 400.
  assert.equal((await app.request({raw:'POST /mcp HTTP/1.1\r\nHost: localhost:39741\r\nX-Mcp-Secret: new-token\r\nContent-Length: 2\r\n\r\n{}'})).status,400);
});
test('Origin deny default, hostile OPTIONS, exact opt-in and no wildcard CORS',async()=>{
  const app=serverFixture(['https://allowed.example','*']);
  for(const origin of ['https://evil.example','null','','*']) for(const method of ['POST','OPTIONS']) {
    const response=await app.request({origin,method}); assert.equal(response.status,403);assert.doesNotMatch(response.output,/Access-Control-Allow-Origin/i);
  }
  assert.equal((await app.request()).status,200);
  for(const method of ['POST','OPTIONS']) {
    const response=await app.request({origin:'https://allowed.example',method}); assert.equal(response.status,method==='POST'?200:204);
    assert.match(response.output,/Access-Control-Allow-Origin: https:\/\/allowed.example\r\n/);assert.match(response.output,/Vary: Origin/);
  }
});
test('loopback-only bind, Host port and remote address validation, stopped requests fail',async()=>{
  const app=serverFixture(); assert.equal(app.bind.host,'127.0.0.1');assert.equal(app.bind.port,39741);
  for(const host of [null,'evil.example:39741','localhost:80','127.0.0.1','localhost.evil:39741']) assert.equal((await app.request({host})).status,403);
  for(const remote of ['192.168.1.2','',undefined]) {
    if(remote!==undefined) assert.equal((await app.request({remote})).status,403);
  }
  assert.equal((await app.request({host:'localhost:39741'})).status,200);
  app.state.scopedDirectory=approved;app.handle.stop();assert.equal(app.state.scopedDirectory,null);assert.equal(app.closed,true);
  assert.equal((await app.request()).destroyed,true);
  const restarted=api.startMcpHttp({port:39741,secret:'t',autostart:false},app.state);assert.equal(app.state.scopedDirectory,null);restarted.stop();
});
test('HTTP framing rejects duplicate security headers, transfer encoding, invalid lengths and over-limit bodies',async()=>{
  const app=serverFixture();
  for(const extra of ['Host: evil.example','Origin: x\r\nOrigin: y','Content-Length: -1','Content-Length: NaN','Transfer-Encoding: chunked']) {
    const response=await app.request({raw:`POST /mcp HTTP/1.1\r\nHost: localhost:39741\r\n${extra}\r\n\r\n`});assert.equal(response.status,400);
  }
  assert.equal((await app.request({raw:'POST /mcp HTTP/1.1\r\nContent-Length: 9000000\r\n\r\n'})).destroyed,true);
  assert.equal((await app.request({raw:'x'.repeat(8*1024*1024+1)})).destroyed,true);
  assert.equal((await app.request({again:true})).output.split('HTTP/1.1').length-1,1);
});
test('public MCP tools and all input schemas exactly match frozen upstream snapshot',async()=>{
  const response=await api.handleMcpJsonRpc({scopedDirectory:null},{jsonrpc:'2.0',id:1,method:'tools/list'});
  const tools=JSON.parse(response.body).result.tools;
  const snapshot=JSON.parse(fs.readFileSync(new URL('./upstream-tools.json',import.meta.url),'utf8'));
  assert.deepEqual(tools,snapshot);
  const forbidden=/^(eval|exec|shell|spawn|run_command|execute_js|trigger_arbitrary_action|read_any_file|write_any_file)$/;
  assert.ok(tools.length>40);for(const tool of tools) assert.equal(forbidden.test(tool.name),false);
  const unknown=await api.handleMcpJsonRpc({scopedDirectory:null},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'execute_js',arguments:{}}});
  assert.ok(JSON.parse(unknown.body).error || JSON.parse(unknown.body).result?.isError);
});
test('human confirmation, canonical root, decline, file instead of directory, and revocation',()=>{
  const state={scopedDirectory:null};assert.throws(()=>api.proposeScopedDirectory(state,approved));assert.equal(state.scopedDirectory,null);
  let prompt;context.window.confirm=message=>{prompt=message;return true};
  api.proposeScopedDirectory(state,approved);assert.equal(state.scopedDirectory,fs.realpathSync(approved));assert.match(prompt,/Access ends/);
  assert.throws(()=>api.proposeScopedDirectory(state,path.join(outside,'secret.txt')));
  api.revokeScope(state);denied(()=>api.writeScopedBinary(state,path.join(approved,'no'),new Uint8Array([1])));
});
test('normal reads, nested new writes, save/export, overwrite is explicit',()=>{
  const state=session(), file=path.join(approved,'normal','file.bin');
  api.writeScopedBinary(state,file,new Uint8Array([1,2]));assert.deepEqual([...api.readScopedBinary(state,file)],[1,2]);
  denied(()=>api.writeScopedBinary(state,file,new Uint8Array([3])));api.writeScopedBinary(state,file,new Uint8Array([3]),true);
  assert.deepEqual([...api.readScopedBinary(state,file)],[3]);
  for(const [name,fn] of [['save',api.saveProject],['export',api.exportModel]]) {
    const target=path.join(approved,name+'.json');fn(state,{path:target});denied(()=>fn(state,{path:target}));fn(state,{path:target,overwrite:true});assert.doesNotThrow(()=>JSON.parse(fs.readFileSync(target)));
  }
});
const ioActions=target=>[
  ()=>api.readScopedBinary(session(),target),()=>api.writeScopedBinary(session(),target,new Uint8Array([1]),true),
  ()=>api.saveProject(session(),{path:target,overwrite:true}),()=>api.exportModel(session(),{path:target,overwrite:true}),
];
test('traversal, external absolute, other drive, UNC, prefix confusion, mixed separators and device aliases denied',()=>{
  for(const target of ['../escape','../../escape',path.join(outside,'secret.txt'),approved+'-prefix/file',approved+'/../outside/new',approved+'\\..\\outside\\new','Z:\\elsewhere\\file','\\\\server\\share\\file',approved+'/a:stream',approved+'/NUL']) {
    for(const action of ioActions(target)) denied(action);
  }
});
test('real junction/symlink escapes and new descendants denied across disk operations',()=>{
  const escape=path.join(approved,'escape');fs.symlinkSync(outside,escape,process.platform==='win32'?'junction':'dir');
  for(const target of [path.join(escape,'secret.txt'),path.join(escape,'nested','new')]) for(const action of ioActions(target)) denied(action);
  assert.equal(fs.readFileSync(path.join(outside,'secret.txt'),'utf8'),'disposable-outside');assert.equal(fs.existsSync(path.join(outside,'nested')),false);
});
test('dangling junction/symlink cannot create an outside target',()=>{
  const dangling=path.join(approved,'dangling');fs.symlinkSync(path.join(outside,'missing'),dangling,process.platform==='win32'?'junction':'dir');
  for(const action of ioActions(path.join(dangling,'new'))) denied(action);
  assert.equal(fs.existsSync(path.join(outside,'missing')),false);
});
test('scope root replaced by a junction is denied, codec-time redirect and revocation are revalidated',()=>{
  const root=path.join(fixture,'replace');fs.mkdirSync(root);const state={scopedDirectory:fs.realpathSync(root)};
  fs.rmdirSync(root);fs.symlinkSync(outside,root,process.platform==='win32'?'junction':'dir');denied(()=>api.resolveScopedPath(state,path.join(root,'secret.txt')));
  const parent=path.join(approved,'race');fs.mkdirSync(parent);
  context.Codecs.project.compile=()=>{fs.rmdirSync(parent);fs.symlinkSync(outside,parent,process.platform==='win32'?'junction':'dir');return 'bad'};
  denied(()=>api.saveProject(session(),{path:path.join(parent,'secret.txt'),overwrite:true}));
  const revoked=session();context.Codecs.project.compile=()=>{api.revokeScope(revoked);return 'bad'};
  denied(()=>api.saveProject(revoked,{path:path.join(approved,'revoked')}));
  assert.equal(fs.readFileSync(path.join(outside,'secret.txt'),'utf8'),'disposable-outside');
});
test('no scope denies read/write/save/export and PNG import; PNG escape is rejected before decode',async()=>{
  const state={scopedDirectory:null},target=path.join(approved,'none');
  for(const action of [()=>api.readScopedBinary(state,target),()=>api.writeScopedBinary(state,target,new Uint8Array()),()=>api.saveProject(state,{path:target}),()=>api.exportModel(state,{path:target})]) denied(action);
  await assert.rejects(api.importTexturePng(state,{path:target}),e=>e.code==='E_SCOPE_DENIED');
  await assert.rejects(api.importTexturePng(session(),{path:path.join(approved,'escape','secret.txt')}),e=>e.code==='E_SCOPE_DENIED');
  denied(()=>api.exportTexturePng(state,{path:target}));
  for(const target of [path.join(outside,'secret.txt'),path.join(approved,'escape','secret.txt'),path.join(approved,'escape','new.png')]) {
    denied(()=>api.exportTexturePng(session(),{path:target,overwrite:true}));
  }
  const png=path.join(approved,'texture.png');api.exportTexturePng(session(),{path:png});
  assert.equal(fs.readFileSync(png).toString('hex'),'89504e470d0a1a0a');
  denied(()=>api.exportTexturePng(session(),{path:png}));api.exportTexturePng(session(),{path:png,overwrite:true});
});

test('Windows case-insensitive physical paths and in-scope junction preserve legitimate I/O',()=>{
  const target=path.join(approved,'case-file');fs.writeFileSync(target,'ok');
  if(process.platform==='win32') assert.equal(Buffer.from(api.readScopedBinary(session(),target.toUpperCase())).toString(),'ok');
  const link=path.join(approved,'internal');fs.symlinkSync(path.join(approved,'normal'),link,process.platform==='win32'?'junction':'dir');
  api.writeScopedBinary(session(),path.join(link,'safe'),new Uint8Array([4]));assert.equal(fs.readFileSync(path.join(approved,'normal','safe'))[0],4);
});

test('real TCP transport on loopback enforces auth, origin, rotation and stop',async()=>{
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const state=session();const handle=api.startMcpHttp({port,secret:'real-test-token',autostart:false},state);
  try {
    for(let i=0;i<100&&!handle.running();i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(handle.running(),true);
    const request=(token,origin)=>new Promise((resolve,reject)=>{
      const headers={};if(token)headers.Authorization=`Bearer ${token}`;if(origin)headers.Origin=origin;
      const req=http.request({host:'127.0.0.1',port,path:'/health',headers,agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject);req.end();
    });
    assert.equal(await request(null),401);assert.equal(await request('real-test-token'),200);
    assert.equal(await request('real-test-token','https://evil.example'),403);
    handle.rotateSecret('rotated-test-token');assert.equal(await request('real-test-token'),401);assert.equal(await request('rotated-test-token'),200);
    state.scopedDirectory=approved;
  } finally {handle.stop();}
  assert.equal(state.scopedDirectory,null);assert.equal(handle.running(),false);
});

test('native Setting registration restores and persists secrets without Settings.add',()=>{
  const stored={mcp_secret:'previous-private-token',mcp_port:39742,mcp_autostart:true};
  const writes=[];
  context.Setting=class {constructor(id,options){this.value=stored[id]??options.value;context.settings[id]=this;}};
  context.Settings={saveLocalStorages(){writes.push(Object.fromEntries(Object.entries(context.settings).map(([k,v])=>[k,v.value])))}};
  api.registerPluginSettings();assert.equal(api.readPluginConfig().secret,'previous-private-token');
  assert.equal(api.readPluginConfig().port,39742);assert.equal(api.readPluginConfig().autostart,true);
  delete stored.mcp_secret;delete stored.mcp_autostart;context.settings={};
  api.registerPluginSettings();const token=api.readPluginConfig().secret;
  assert.match(token,/^[a-f0-9]{64}$/);assert.equal(writes.at(-1).mcp_secret,token);assert.equal(api.readPluginConfig().autostart,false);
  api.registerPluginSettings();assert.equal(api.readPluginConfig().secret,token);
  stored.mcp_secret=token;context.settings={};api.registerPluginSettings();assert.equal(api.readPluginConfig().secret,token);
  const rotated=api.regenerateSecret();assert.equal(writes.at(-1).mcp_secret,rotated);assert.notEqual(rotated,token);
  context.settings={};assert.equal(api.readPluginConfig().secret,'');assert.throws(()=>api.regenerateSecret());
});
