const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {chromium} = require('playwright');
const {Canvas,syncCourse,ORIGIN} = require('./sync');
const {readSettings,writeSettings,chooseFolder,defaultFolder} = require('./settings');
let root;
const appData=path.join(os.homedir(),'.canvas-course-library');
const PORT=38465; let context, page, courses=[];
let status={busy:false,message:'Ready',courses:{}};
function timeFileFor(folder){return path.join(appData,`sync-times-${crypto.createHash('sha256').update(path.resolve(folder)).digest('hex').slice(0,16)}.json`);}
async function readTimes(folder){
  try{return JSON.parse(await fs.readFile(timeFileFor(folder),'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(path.resolve(folder)===path.resolve(defaultFolder()))try{return JSON.parse(await fs.readFile(path.join(appData,'sync-times.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  return {};
}
async function browser(){if(context)return context;await fs.mkdir(appData,{recursive:true});context=await chromium.launchPersistentContext(path.join(appData,'browser'),{headless:false,acceptDownloads:true});context.on('close',()=>{context=null;page=null});page=context.pages()[0]||await context.newPage();return context;}
async function getCourses(){const ctx=await browser();const result=await new Canvas(ctx).courses();courses=result.courses.filter(c=>c.id&&c.name);root=(await readSettings(appData)).folder;const times=await readTimes(root);return {folder:root,warnings:result.warnings,courses:courses.map(c=>({id:c.id,name:c.name,dashboard:c.dashboard,history:times[c.id]||null}))};}
async function run(ids){
 const selected=courses.filter(c=>ids.includes(c.id));
 status={busy:true,message:'Syncing courses',courses:Object.fromEntries(selected.map(c=>[c.id,{percent:0,message:'Waiting',state:'pending'}]))};
 try{root=(await readSettings(appData)).folder;const ctx=await browser(),canvas=new Canvas(ctx);if(selected.length!==ids.length)throw Error('The course list has changed. Refresh and try again.');await fs.mkdir(root,{recursive:true});const timeFile=timeFileFor(root);const times=await readTimes(root);
 for(const c of selected){const current=status.courses[c.id];current.state='running';current.message='Starting sync';
   try{const result=await syncCourse(canvas,c,root,(fraction,name)=>{current.percent=Math.round(fraction*100);current.message=name;});
     current.percent=100;current.state=result.failures.length?'partial':'complete';current.message=result.failures.length?`Sync finished (${result.failures.length} items incomplete)`:'Sync complete';current.failures=result.failures;
     current.last=new Date().toISOString();times[c.id]={at:current.last,state:current.state};await fs.writeFile(timeFile,JSON.stringify(times,null,2));
   }catch(e){current.state='error';current.message=`Sync failed: ${e.message}`;}
 }
 const incomplete=Object.values(status.courses).filter(x=>x.state!=='complete').length;
 status.message=incomplete?`Sync finished; ${incomplete} courses need attention.`:'Selected courses synced.';status.busy=false;
 }catch(e){status.busy=false;status.message=e.message;for(const s of Object.values(status.courses))if(s.state==='pending'||s.state==='running'){s.state='error';s.message=e.message;}}
}
async function body(req){let text='';for await(const chunk of req)text+=chunk;if(text.length>10000)throw Error('Request too large');return text?JSON.parse(text):{};}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await fs.readFile(path.join(__dirname,'index.html')));return;}let result;
if(req.method==='GET'&&u.pathname==='/api/settings')result=await readSettings(appData);
else if(req.method==='GET'&&u.pathname==='/api/history'){const s=await readSettings(appData);result={history:await readTimes(s.folder)};}
else if(req.method==='POST'&&u.pathname==='/api/settings'){if(status.busy)throw Error('Cannot change the folder while syncing');const data=await body(req);result=await writeSettings(appData,data.folder);root=result.folder;}
else if(req.method==='POST'&&u.pathname==='/api/choose-folder'){if(status.busy)throw Error('Cannot change the folder while syncing');const folder=await chooseFolder();result=folder?await writeSettings(appData,folder):{...(await readSettings(appData)),cancelled:true};root=result.folder;}
else if(req.method==='POST'&&u.pathname==='/api/login'){await browser();await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});result={ok:true};}
else if(req.method==='GET'&&u.pathname==='/api/courses')result=await getCourses();
else if(req.method==='POST'&&u.pathname==='/api/sync'){if(status.busy)throw Error('Sync is already in progress');const data=await body(req);if(!Array.isArray(data.ids)||!data.ids.length)throw Error('Select courses');if(data.ids.some(id=>!courses.some(c=>c.id===id)))throw Error('The course list has changed. Refresh and try again.');run(data.ids);result={ok:true};}
else if(req.method==='GET'&&u.pathname==='/api/status')result=status;
else {res.writeHead(404);res.end();return;}
res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch(e){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message}));}});
server.listen(PORT,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${PORT}`;
  console.log(`Canvas Course Library: ${url}`);
  if(process.platform==='win32')require('node:child_process').spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'}).unref();
  else if(process.platform==='linux')require('node:child_process').execFile('xdg-open',[url],()=>{});
});
