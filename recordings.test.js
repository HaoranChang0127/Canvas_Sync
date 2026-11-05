const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {recordingsInPage,syncRecording}=require('./recordings');

test('discovers Zoom recording links and nearby passcodes',()=>{
 const items=recordingsInPage('<p><a href="https://university.zoom.us/rec/share/abc">Recording</a> Passcode: example42</p>','https://canvas.example.edu','Lecture 1');
 assert.equal(items.length,1);assert.equal(items[0].passcode,'example42');
 assert.equal(recordingsInPage('<a href="https://evilzoom.us/rec/share/a">x</a>','https://canvas.example.edu','x').length,0);
});

test('saves transcript without downloading video and preserves recording details',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-recording-'));let downloaded='';
 try{
  const empty={count:async()=>0,first(){return this}};
  const transcript={count:async()=>1,first(){return this},getAttribute:async()=>'/files/transcript.vtt'};
  const page={on(){},route:async()=>{},goto:async()=>{},waitForTimeout:async()=>{},url:()=> 'https://university.zoom.us/rec/share/abc',locator:s=>s.includes('.vtt')?transcript:empty,getByRole:()=>empty,close:async()=>{}};
  const context={newPage:async()=>page,request:{get:async url=>{downloaded=url;return {ok:()=>true,body:async()=>Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n')}}}};
  const recording={title:'Week 1',url:'https://university.zoom.us/rec/share/abc',passcode:'abc123'};
  const result=await syncRecording(context,recording,root,{});assert.equal(result.found,true);assert.match(downloaded,/transcript\.vtt$/);
  const note=await fs.readFile(path.join(root,result.notePath),'utf8');assert.match(note,/abc123/);assert.match(note,/Transcript\.vtt/);
  const vtt=await fs.readFile(path.join(root,path.dirname(result.notePath),'Transcript.vtt'),'utf8');assert.match(vtt,/WEBVTT/);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});

test('falls back to audio and records an unavailable transcript',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-audio-'));
 try{
  const empty={count:async()=>0,first(){return this}};
  const audio={count:async()=>1,first(){return this},getAttribute:async()=>'/audio/lecture.m4a'};
  const page={on(){},route:async()=>{},goto:async()=>{},waitForTimeout:async()=>{},url:()=> 'https://zoom.us/rec/share/a',locator:s=>s.includes('.m4a')?audio:empty,getByRole:()=>empty,close:async()=>{}};
  const context={newPage:async()=>page,request:{get:async()=>({ok:()=>true,body:async()=>Buffer.from('audio')})}};
  const result=await syncRecording(context,{title:'Lecture',url:'https://zoom.us/rec/share/a',passcode:''},root,{});
  assert.equal(result.found,true);assert.equal(await fs.readFile(path.join(root,path.dirname(result.notePath),'Audio.m4a'),'utf8'),'audio');
  page.locator=()=>empty;
  const missing=await syncRecording(context,{title:'Other',url:'https://zoom.us/rec/share/b',passcode:''},root,{});
  assert.equal(missing.found,false);assert.match(await fs.readFile(path.join(root,missing.notePath),'utf8'),/No accessible transcript or audio/);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});

test('downloads from a Zoom audio transcript page with an empty href',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-zoom-'));
 try{
  const source=path.join(root,'download');await fs.writeFile(source,'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n');
  const empty={count:async()=>0,first(){return this}};
  const heading={count:async()=>1};
  let clicked=false;
  const link={count:async()=>1,first(){return this},click:async()=>{clicked=true}};
  const page={on(){},route:async()=>{},goto:async()=>{},waitForTimeout:async()=>{},url:()=> 'https://zoom.us/rec/play/transcript',locator:()=>empty,getByRole:(role)=>role==='heading'?heading:role==='link'?link:empty,waitForEvent:async()=>({path:async()=>source,suggestedFilename:()=> 'transcript.vtt'}),close:async()=>{}};
  const context={newPage:async()=>page};
  const result=await syncRecording(context,{title:'Lecture',url:'https://zoom.us/rec/play/transcript',passcode:''},root,{});
  assert.equal(clicked,true);assert.equal(result.found,true);
  assert.match(await fs.readFile(path.join(root,path.dirname(result.notePath),'Transcript.vtt'),'utf8'),/^WEBVTT/);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});

test('re-syncing a recording with a changed play URL updates one file and preserves local edits',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-resync-'));
 try{
  const state={},empty={count:async()=>0,first(){return this}};
  let content='WEBVTT\nfirst';
  const transcript={count:async()=>1,first(){return this},getAttribute:async()=>'/lecture.vtt'};
  const page=()=>({on(){},route:async()=>{},goto:async()=>{},waitForTimeout:async()=>{},url:()=> 'https://zoom.us/rec/play/temp',locator:s=>s.includes('.vtt')?transcript:empty,getByRole:()=>empty,close:async()=>{}});
  const context={newPage:async()=>page(),request:{get:async()=>({ok:()=>true,body:async()=>Buffer.from(content)})}};
  const item={title:'Lecture Oct 16',key:'course 1 - Oct 16',url:'https://zoom.us/rec/play/one',passcode:''};
  const one=await syncRecording(context,item,root,state);
  content='WEBVTT\nsecond';const two=await syncRecording(context,{...item,url:'https://zoom.us/rec/play/two'},root,state);
  assert.equal(one.notePath,two.notePath);
  const dir=path.join(root,path.dirname(one.notePath));
  assert.equal(await fs.readFile(path.join(dir,'Transcript.vtt'),'utf8'),content);
  assert.deepEqual((await fs.readdir(dir)).sort(),['Recording.md','Transcript.vtt']);
  await fs.writeFile(path.join(dir,'Transcript.vtt'),'personal notes');
  content='WEBVTT\nthird';const three=await syncRecording(context,item,root,state);
  assert.equal(await fs.readFile(path.join(dir,'Transcript.vtt'),'utf8'),'personal notes');
  assert.match(three.status,/not overwritten/);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
