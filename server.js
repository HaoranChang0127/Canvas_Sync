const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright');
const {Canvas,syncCourse,ORIGIN} = require('./sync');
const root=path.join(os.homedir(),'Documents','Canvas Course Library');
const appData=path.join(os.homedir(),'.canvas-course-library');
const PORT=38465; let context, page, courses=[];
let status={busy:false,message:'等待操作',courses:{}};
async function browser(){if(context)return context;await fs.mkdir(appData,{recursive:true});context=await chromium.launchPersistentContext(path.join(appData,'browser'),{headless:false,acceptDownloads:true});context.on('close',()=>{context=null;page=null});page=context.pages()[0]||await context.newPage();return context;}
async function getCourses(){const ctx=await browser();courses=(await new Canvas(ctx).courses()).filter(c=>c.id&&c.name);let times={};try{times=JSON.parse(await fs.readFile(path.join(appData,'sync-times.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return {folder:root,courses:courses.map(c=>({id:c.id,name:c.name,last:times[c.id]||null}))};}
async function run(ids){
 const selected=courses.filter(c=>ids.includes(c.id));
 status={busy:true,message:'正在同步课程',courses:Object.fromEntries(selected.map(c=>[c.id,{percent:0,message:'等待同步',state:'pending'}]))};
 try{const ctx=await browser(),canvas=new Canvas(ctx);if(selected.length!==ids.length)throw Error('课程列表已变化，请刷新后重试。');await fs.mkdir(root,{recursive:true});let times={};const timeFile=path.join(appData,'sync-times.json');try{times=JSON.parse(await fs.readFile(timeFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const c of selected){const current=status.courses[c.id];current.state='running';current.message='开始同步';
   try{const result=await syncCourse(canvas,c,root,(fraction,name)=>{current.percent=Math.round(fraction*100);current.message=name;});
     current.percent=100;current.state=result.failures.length?'partial':'complete';current.message=result.failures.length?`完成（${result.failures.length} 项需要处理，详见课程索引）`:'完成';current.failures=result.failures;
     times[c.id]=new Date().toISOString();await fs.writeFile(timeFile,JSON.stringify(times,null,2));current.last=times[c.id];
   }catch(e){current.state='error';current.message=`同步失败：${e.message}`;}
 }
 const incomplete=Object.values(status.courses).filter(x=>x.state!=='complete').length;
 status.message=incomplete?`同步结束，${incomplete} 门课程需要处理。`:'所选课程同步完成。';status.busy=false;
 }catch(e){status.busy=false;status.message=e.message;for(const s of Object.values(status.courses))if(s.state==='pending'||s.state==='running'){s.state='error';s.message=e.message;}}
}
async function body(req){let text='';for await(const chunk of req)text+=chunk;if(text.length>10000)throw Error('请求过大');return text?JSON.parse(text):{};}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await fs.readFile(path.join(__dirname,'index.html')));return;}let result;
if(req.method==='POST'&&u.pathname==='/api/login'){await browser();await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});result={ok:true};}
else if(req.method==='GET'&&u.pathname==='/api/courses')result=await getCourses();
else if(req.method==='POST'&&u.pathname==='/api/sync'){if(status.busy)throw Error('同步正在进行中');const data=await body(req);if(!Array.isArray(data.ids)||!data.ids.length)throw Error('请选择课程');if(data.ids.some(id=>!courses.some(c=>c.id===id)))throw Error('课程列表已变化，请刷新后重试。');run(data.ids);result={ok:true};}
else if(req.method==='GET'&&u.pathname==='/api/status')result=status;
else {res.writeHead(404);res.end();return;}
res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch(e){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message}));}});
server.listen(PORT,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${PORT}`;
  console.log(`Canvas Course Library: ${url}`);
  if(process.platform==='win32')require('node:child_process').spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'}).unref();
});
