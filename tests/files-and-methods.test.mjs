import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Publisher, PUBLIC_CALLER, CHAT_ID, BOT_ID, BOT_USERNAME } from '../lib/telegram.ts';
import { saveAsset, prepareAssets, openAttachments, multipartBody } from '../lib/assets.ts';
import { normalizeCommand } from '../lib/commands.ts';
import { nativeOperation, METHODS } from '../lib/methods.ts';
function database() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  return { prepare(sql) { const q=db.prepare(sql);let v=[];return {bind(...a){v=a;return this},async first(){return q.get(...v)||null},async all(){return {results:q.all(...v)}},async run(){return {meta:{changes:q.run(...v).changes}}}} } };
}
class Bucket {
  files=new Map(); opened=0; peak=0;
  async put(key,body) { this.files.set(key,new Uint8Array(await new Response(body).arrayBuffer())); }
  async delete(key) { this.files.delete(key); }
  async head(key) { const bytes=this.files.get(key);return bytes?{size:bytes.length}:null; }
  async get(key) {
    const bytes=this.files.get(key); if(!bytes)return null;
    this.opened++;this.peak=Math.max(this.peak,this.opened); let done=false;
    const close=()=>{if(!done){this.opened--;done=true}};
    return {size:bytes.length, body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();},cancel:close}).pipeThrough(new TransformStream({transform(chunk,c){c.enqueue(chunk)},flush:close}))};
  }
}
function fixture() {
  const calls=[],env={DB:database(),BUCKET:new Bucket(),TELEGRAM_BOT_TOKEN:'123456:'+'x'.repeat(35)};
  const transport=async(url,init)=>{
    const method=url.split('/').at(-1); let params;
    if(init.headers['Content-Type'].startsWith('multipart/')){
      const form=await new Request(url,{...init,duplex:'half'}).formData(); params={};
      for(const[k,v]of form.entries()) params[k]=typeof v==='string'?v:{name:v.name,type:v.type,bytes:new Uint8Array(await v.arrayBuffer())};
    } else params=JSON.parse(init.body);
    calls.push({method,params}); let result;
    if(method==='getMe')result={id:BOT_ID,is_bot:true,username:BOT_USERNAME};
    else if(method==='getChat')result={id:CHAT_ID,type:'channel',username:'kansk_segodnya'};
    else if(method==='getChatMember')result={status:'administrator',can_post_messages:true,can_edit_messages:true};
    else if(method==='sendMediaGroup')result=[{message_id:41,chat:{id:CHAT_ID}},{message_id:42,chat:{id:CHAT_ID}}];
    else if(['deleteMessage','deleteMessages','pinChatMessage','setMyDescription'].includes(method))result=true;
    else if(method==='getMyCommands')result=[];
    else result={message_id:43,chat:{id:CHAT_ID},photo:[{file_id:'telegram-photo-id'}]};
    return Response.json({ok:true,result});
  };
  return {env,calls,transport,p:new Publisher(env,transport)};
}
const bytes=new TextEncoder().encode('file bytes: фото\u0000\u0001');
async function upload(f,name='picture.jpg',content=bytes){return saveAsset(f.env,new Blob([content]).stream(),name,'image/jpeg',content.length)}
async function command(f,body){const op=normalizeCommand(body);return f.p.execute(PUBLIC_CALLER,op.name,op.args)}
test('file upload persists metadata and exact bytes without calling Telegram',async()=>{
 const f=fixture(),saved=await upload(f,'my "file\n.jpg');assert.match(saved.file,/^upload:/);assert.equal(saved.size,bytes.length);assert.equal(f.calls.length,0);
 const row=await f.env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(saved.upload_id).first();assert.equal(row.filename.includes('\n'),false);assert.deepEqual(f.env.BUCKET.files.get(row.object_key),bytes);
 await assert.rejects(saveAsset(f.env,new Blob([bytes]).stream(),'x','',bytes.length+1));assert.equal(f.env.BUCKET.files.size,1);
});
test('photo sends a real multipart attachment and preserves Telegram file metadata',async()=>{
 const f=fixture(),file=await upload(f); const r=await command(f,{command:'photo',file:file.file,caption:'Подпись',key:'photo-1'});
 const call=f.calls.find(x=>x.method==='sendPhoto');assert.equal(call.params.photo,'attach://file0');assert.equal(call.params.caption,'Подпись');assert.deepEqual(call.params.file0.bytes,bytes);assert.equal(r.data.photo[0].file_id,'telegram-photo-id');assert.equal(r.message_id,43);
});
test('re-uploading identical bytes with the same operation key does not duplicate a post',async()=>{
 const f=fixture(),one=await upload(f),two=await upload(f,'renamed.jpg');
 await command(f,{command:'photo',file:one.file,caption:'Текст',key:'same-file'});
 const result=await command(f,{command:'photo',file:two.file,caption:'Текст',key:'same-file'});assert.equal(result.repeated,true);assert.equal(f.calls.filter(x=>x.method==='sendPhoto').length,1);
 const other=await upload(f,'other.jpg',new Uint8Array([2,3]));await assert.rejects(command(f,{command:'photo',file:other.file,caption:'Текст',key:'same-file'}));
});
test('album carries typed files, caption, and all message IDs in a single Telegram call',async()=>{
 const f=fixture(),a=await upload(f),b=await upload(f,'video.mp4');const r=await command(f,{command:'album',files:[{type:'photo',file:a.file},{type:'video',file:b.file}],caption:'Альбом',key:'album-1'});
 const calls=f.calls.filter(x=>x.method==='sendMediaGroup');assert.equal(calls.length,1);const media=JSON.parse(calls[0].params.media);assert.equal(media[0].caption,'Альбом');assert.equal(media[1].type,'video');assert.equal(r.messages.length,2);assert.equal(r.messages[1].message_id,42);
});
test('ten-file multipart reads stored files sequentially, not as ten simultaneous streams',async()=>{
 const f=fixture(),refs=[];for(let i=0;i<10;i++)refs.push((await upload(f,`${i}.jpg`)).file);
 const prepared=await prepareAssets(f.env,{media:refs.map(media=>({type:'photo',media}))});const files=await openAttachments(f.env,prepared.attachments);assert.equal(f.env.BUCKET.opened,0);
 const uploadBody=multipartBody(prepared.params,files);const form=await new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':uploadBody.contentType},body:uploadBody.body,duplex:'half'}).formData();assert.equal(form.getAll('file9').length,1);assert.equal(f.env.BUCKET.peak,1);
});
test('deletion and bot settings accept boolean success, persist, and deduplicate',async()=>{
 const f=fixture();const r=await command(f,{command:'delete',id:123,key:'del-123'});assert.equal(r.status,'done');assert.equal(r.data,true);assert.equal(r.url,undefined);
 assert.equal((await command(f,{command:'delete',id:123,key:'del-123'})).repeated,true);assert.equal(f.calls.filter(x=>x.method==='deleteMessage').length,1);
 assert.equal((await command(f,{command:'call',method:'setMyDescription',params:{description:'Новости'},key:'desc-1'})).data,true);
});
test('native methods remain fixed to the project channel and validate before Telegram',()=>{
 assert.throws(()=>nativeOperation('sendMessage',{chat_id:'@other',text:'x'},'x'));
 assert.throws(()=>nativeOperation('editMessageText',{inline_message_id:'other',text:'x'},'x'));
 assert.throws(()=>nativeOperation('transferBusinessAccountStars',{},'x'));
 assert.throws(()=>nativeOperation('getUpdates',{offset:9}));
 assert.throws(()=>nativeOperation('deleteMessages',{message_ids:[1,0]},'x'));
 assert.throws(()=>normalizeCommand({command:'text',texxt:'x'}));
 assert.equal(nativeOperation('pinChatMessage',{message_id:123},'x').params.chat_id,CHAT_ID);
 assert.equal(METHODS.length,77);
});
test('read-only native commands do not create journal mutations',async()=>{
 const f=fixture();assert.deepEqual((await command(f,{command:'call',method:'getMyCommands',params:{}})).data,[]);
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM operations').first()).n,0);
});
test('CLI accepts a local path with spaces, uploads exact bytes, and builds the photo command',async(t)=>{
 const dir=mkdtempSync(join(tmpdir(),'edit-cli-')),file=join(dir,'a photo.jpg');writeFileSync(file,bytes); const requests=[];
 const server=createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);const data=Buffer.concat(chunks);requests.push({url:req.url,data,headers:req.headers});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/api/files'?{ok:true,result:{file:'upload:00000000-0000-4000-8000-000000000001'}}:{ok:true,result:{status:'done',message_id:10}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.close();rmSync(dir,{recursive:true,force:true})});
 const child=spawn('python3',['public/edit.py','photo',file,'-c','Подпись'],{env:{...process.env,EDIT_API:`http://127.0.0.1:${server.address().port}`}});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
 const code=await new Promise(resolve=>child.on('close',resolve));assert.equal(code,0,err);assert.deepEqual(new Uint8Array(requests[0].data),bytes);const body=JSON.parse(requests[1].data);assert.equal(body.command,'photo');assert.equal(body.caption,'Подпись');assert.match(body.key,/^edit-/);assert.equal(JSON.parse(out).status,'done');
});
