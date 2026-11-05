const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {syncZoomLti}=require('./zoom-lti');

test('syncs an embedded Zoom transcript and updates it on the next sync',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zoom-lti-'));
 try{
  const state={},source=path.join(root,'download');let version=0;
  const empty={count:async()=>0,isVisible:async()=>false,waitFor:async()=>{},first(){return this}};
  const heading={count:async()=>1,first(){return this},waitFor:async()=>{}};
  const download={count:async()=>1,first(){return this},click:async()=>{}};
  const viewer={on(){},route:async()=>{},waitForLoadState:async()=>{},waitForTimeout:async()=>{},url:()=>`https://example.zoom.us/rec/play/link${version}`,locator:()=>empty,getByRole:role=>role==='heading'?heading:role==='link'?download:empty,waitForEvent:async()=>({path:async()=>source,suggestedFilename:()=> 'transcript.vtt'}),close:async()=>{}};
  const card={count:async()=>1,first(){return this},waitFor:async()=>{},getByRole:()=>empty,locator:()=>({click:async()=>{}})};
  const cards={first:()=>card,filter:({hasText})=>String(hasText).includes('audio transcript')?card:empty};
  const row={innerText:async()=> 'Workshop 123 Oct 16, 2026 12:41 PM',getByRole:()=>({first:()=>({click:async()=>{}})})};
  const rows={filter(){return this},first:()=>({waitFor:async()=>{}}),nth:()=>({...row,waitFor:async()=>{}}),count:async()=>1};
  const frame={url:()=> 'https://applications.zoom.us/lti/advantage',getByRole:(role)=>role==='link'?empty:role==='tab'?{click:async()=>{}}:{click:async()=>{}},locator:s=>s.includes('ant-table-tbody')?rows:s==='.lti-recording-item'?cards:empty};
  const launcher={goto:async()=>{},locator:()=>({first:()=>({waitFor:async()=>{}})}),frames:()=>[frame],close:async()=>{}};
  const context={newPage:async()=>launcher,waitForEvent:async()=>viewer};
  await fs.writeFile(source,'WEBVTT\nfirst');
  const first=await syncZoomLti(context,'https://canvas.example.edu/courses/1/external_tools/2',root,state);
  version++;await fs.writeFile(source,'WEBVTT\nsecond');
  const second=await syncZoomLti(context,'https://canvas.example.edu/courses/1/external_tools/2',root,state);
  assert.equal(first.length,1);assert.equal(first[0].found,true);assert.equal(first[0].notePath,second[0].notePath);
  const dir=path.join(root,path.dirname(first[0].notePath));
  assert.equal(await fs.readFile(path.join(dir,'Transcript.vtt'),'utf8'),'WEBVTT\nsecond');
  assert.deepEqual((await fs.readdir(dir)).sort(),['Recording.md','Transcript.vtt']);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
