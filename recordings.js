const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {links,safeName,saveManaged}=require('./core');

function recordingsInPage(html,origin,title){
  const urls=links(html,origin).filter(url=>{const u=new URL(url);return /(^|\.)zoom\.us$/i.test(u.hostname)&&/\/(rec|recording)\//i.test(u.pathname)});
  const text=String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&');
  const passwords=[...text.matchAll(/(?:passcode|password|密码)\s*[:：]\s*([^\s<]+)/gi)].map(m=>m[1]);
  return urls.map((url,i)=>({url,title:urls.length===1?title:`${title} ${i+1}`,passcode:passwords.length===urls.length?passwords[i]:''}));
}

async function syncRecording(context,recording,courseDir,state,openedPage){
  const id=crypto.createHash('sha256').update(recording.key||recording.url).digest('hex').slice(0,10);
  const folder=path.join('Other Materials','Recordings',`${safeName(recording.title)} [${id}]`);
  const page=openedPage||await context.newPage();
  let kind='',file='',status='No accessible transcript or audio found.';
  const captions=[];
  page.on('response',response=>{const type=response.headers()['content-type']||'';if(/text\/vtt/i.test(type)||/\.(vtt|srt)(?:[?#]|$)/i.test(response.url()))captions.push(response.body());});
  try{
    await page.route('**/*',route=>route.request().resourceType()==='media'?route.abort():route.continue());
    if(!openedPage)await page.goto(recording.url,{waitUntil:'domcontentloaded',timeout:30000});
    else await page.waitForLoadState('domcontentloaded');
    const password=page.locator('input[type="password"], input[aria-labelledby="passcodeLabel"]');
    if(await password.count()&&recording.passcode){await password.first().fill(recording.passcode);await page.getByRole('button',{name:/watch recording|continue|view|submit/i}).first().click();await page.waitForLoadState('domcontentloaded');}
    if(recording.expectTranscript)await page.getByRole('heading',{name:/audio transcript/i}).first().waitFor({timeout:30000});
    const transcriptButton=page.getByRole('button',{name:/audio transcript/i});
    if(await transcriptButton.count())await transcriptButton.first().click();
    await page.waitForTimeout(1200);
    const transcript=page.locator('a[href*=".vtt"],a[href*=".srt"]').first();
    const audio=page.locator('a[href*=".m4a"],a[href*=".mp3"]').first();
    const link=await transcript.count()?transcript:(await audio.count()?audio:null);
    const transcriptPage=page.getByRole('heading',{name:/audio transcript/i});
    const audioPage=page.getByRole('heading',{name:/audio only/i});
    const downloadLink=page.getByRole('link',{name:/^download\b/i});
    if((await transcriptPage.count()||await audioPage.count())&&await downloadLink.count()){
      const [download]=await Promise.all([page.waitForEvent('download'),downloadLink.first().click()]);
      const data=await fs.readFile(await download.path());
      const ext=path.extname(download.suggestedFilename()).toLowerCase();
      const isTranscript=await transcriptPage.count();
      const allowed=isTranscript?['.vtt','.srt','.txt']:['.m4a','.mp3','.wav','.aac'];
      if(!isTranscript&&!allowed.includes(ext))throw Error('Audio file format is not supported.');
      const name=`${isTranscript?'Transcript':'Audio'}${allowed.includes(ext)?ext:'.txt'}`;
      const saved=await saveManaged(courseDir,path.join(folder,name),data,state,`recording:${id}:${name}`,null);
      file=saved.path;kind=isTranscript?'Transcript':'Audio';status=saved.status==='local-change'?'Local file modified; not overwritten.':`${kind} saved.`;
    }else if(captions.length){
      const saved=await saveManaged(courseDir,path.join(folder,'Transcript.vtt'),await captions[0],state,`recording:${id}:Transcript.vtt`,null);
      file=saved.path;kind='Transcript';status=saved.status==='local-change'?'Local file modified; not overwritten.':'Transcript saved.';
    }else if(link){
      const url=new URL(await link.getAttribute('href'),page.url()).toString();
      const ext=path.extname(new URL(url).pathname).toLowerCase();
      const response=await context.request.get(url);
      if(!response.ok())throw Error(`Download failed (${response.status()})`);
      const name=['.vtt','.srt'].includes(ext)?`Transcript${ext}`:`Audio${ext}`;
      const saved=await saveManaged(courseDir,path.join(folder,name),await response.body(),state,`recording:${id}:${name}`,null);
      file=saved.path;kind=name.startsWith('Transcript')?'Transcript':'Audio';status=saved.status==='local-change'?'Local file modified; not overwritten.':`${kind} saved.`;
    }else if(await password.count()&&!recording.passcode)status='Recording passcode not found on the Canvas page.';
  }catch(error){status=`Could not retrieve recording: ${error.message.split('\n')[0]}`;}
  finally{await page.close();}
  const note=`# ${recording.title}\n\nRecording: ${recording.url}\n\nPasscode: ${recording.passcode||'Not found'}\n\nStatus: ${status}\n${file?`\n${kind}: [${path.basename(file)}](${encodeURIComponent(path.basename(file))})\n`:''}`;
  const notePath=path.join(folder,'Recording.md');
  await saveManaged(courseDir,notePath,Buffer.from(note),state,`recording:${id}:note`,null);
  return {notePath,status,found:!!file};
}
module.exports={recordingsInPage,syncRecording};
