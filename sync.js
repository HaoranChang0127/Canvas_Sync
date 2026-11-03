const fs = require('node:fs/promises');
const path = require('node:path');
const {safeName, saveManaged, links, extractFileId} = require('./core');
const ORIGIN = 'https://canvas.uts.edu.au';

class Canvas {
  constructor(context, origin = ORIGIN) { this.context=context; this.origin=origin; }
  async get(url) {
    const response=await this.context.request.get(new URL(url,this.origin).toString(),{timeout:30000});
    if (!response.ok()) throw Error(`Canvas ${response.status()}：${new URL(url,this.origin).pathname}`);
    return response;
  }
  async object(url) {
    const r=await this.get(url);
    if (!(r.headers()['content-type']||'').includes('json')) throw Error('Canvas 会话未登录或已过期，请重新登录。');
    return r.json();
  }
  async list(url) {
    let next=new URL(url,this.origin).toString(); const result=[];
    while(next){
      const r=await this.get(next);
      if (!(r.headers()['content-type']||'').includes('json')) throw Error('Canvas 会话未登录或已过期，请重新登录。');
      const data=await r.json();
      if (!Array.isArray(data)) throw Error('Canvas 返回了非列表数据。');
      result.push(...data);
      const match=(r.headers().link||'').match(/<([^>]+)>;\s*rel="next"/); next=match?match[1]:null;
    }
    return result;
  }
  courses(){return this.list('/api/v1/courses?enrollment_state=active&per_page=100');}
}

const portableLink = value => value.split(path.sep).map(encodeURIComponent).join('/');
const localLink = (from, to) => portableLink(path.relative(path.dirname(from),to));
const escapeHtml = value => String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function syncCourse(canvas,course,base,progress=()=>{}) {
  const courseDir=path.join(base,`${safeName(course.name||course.course_code)} [${course.id}]`);
  await fs.mkdir(courseDir,{recursive:true});
  const statePath=path.join(courseDir,'.canvas-sync.json'); let state={};
  try{state=JSON.parse(await fs.readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const prefix=`/api/v1/courses/${course.id}`, failures=[], groups=[], entries=[], filesById=new Map(), filePaths=new Map(), pagesBySlug=new Map(), assignmentsById=new Map(), seenPages=new Set(), seenAssignments=new Set();
  const savedPath=(key,proposed)=>state[key]?.path || proposed;
  async function write(rel,data,key,updated){
    const result=await saveManaged(courseDir,rel,Buffer.isBuffer(data)?data:Buffer.from(data),state,key,updated);
    if(result.status==='local-change')failures.push(`${rel}：本地已修改，未覆盖`);
    return result.path;
  }
  async function listOptional(url,label){try{return await canvas.list(url);}catch(e){failures.push(`${label}：${e.message}`);return [];}}
  progress(0,'读取课程目录');
  const modules=await canvas.list(`${prefix}/modules?per_page=100`);
  const files=await listOptional(`${prefix}/files?per_page=100`,'文件列表');
  const pages=await listOptional(`${prefix}/pages?per_page=100`,'页面列表');
  const assignments=await listOptional(`${prefix}/assignments?per_page=100`,'作业列表');
  const announcements=await listOptional(`/api/v1/announcements?context_codes[]=course_${course.id}&per_page=100`,'公告列表');
  for(const f of files)filesById.set(Number(f.id),f);
  for(const p of pages)pagesBySlug.set(p.url,p);
  for(const a of assignments)assignmentsById.set(Number(a.id),a);
  let groupsById=new Map();
  for(const [i,m] of modules.entries()){
    const g={id:String(m.id),name:m.name,folder:path.join('Modules',`${String(i+1).padStart(2,'0')} ${safeName(m.name)} [${m.id}]`)};
    groups.push(g);groupsById.set(g.id,g);
    try{g.items=await canvas.list(`${prefix}/modules/${m.id}/items?per_page=100`);}catch(e){g.items=[];failures.push(`${m.name}：${e.message}`);}
  }
  const other={id:'other',name:'未关联模块',folder:'Other Materials'};
  const assignGroup={id:'assignments',name:'未关联模块的作业',folder:path.join('Other Materials','Assignments')};
  const announcementGroup={id:'announcements',name:'课程公告',folder:path.join('Other Materials','Announcements')};
  const total=Math.max(1,groups.reduce((n,g)=>n+g.items.length,0)+files.length+pages.length+assignments.length+announcements.length);let done=0;
  const tick=name=>progress(Math.min(0.98,++done/total*0.98),name);
  function record(group,title,type,rel,url){entries.push({group:group.id,title:title||'未命名',type,rel,url});}
  async function file(id,group,label,sourceUrl,subfolder=''){
    const key=`file:${id}`;
    if(filePaths.has(id)){record(group,label||filePaths.get(id).title,'文件',filePaths.get(id).rel,sourceUrl);return filePaths.get(id).rel;}
    const info=filesById.get(id)||await canvas.object(`/api/v1/files/${id}`);
    if((info.content_type||'').startsWith('video/')||/\.(mp4|mov|mkv|webm)$/i.test(info.filename||info.display_name||'')){
      record(group,label||info.display_name,'视频（未下载）',null,sourceUrl);return null;
    }
    const filename=safeName(info.display_name||info.filename), ext=path.extname(filename);
    const proposed=path.join(group.folder,subfolder,`${filename.slice(0,filename.length-ext.length)} [${id}]${ext}`), rel=savedPath(key,proposed), old=state[key];
    let exists=false;try{await fs.access(path.join(courseDir,rel));exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!exists||!old||old.updated!==info.updated_at){
      const response=await canvas.get(info.url||`/api/v1/files/${id}/download`);
      await write(rel,await response.body(),key,info.updated_at);
    }
    filePaths.set(id,{rel,title:info.display_name||filename});
    record(group,label||info.display_name,'文件',rel,sourceUrl||`${canvas.origin}/courses/${course.id}/files/${id}`);
    return rel;
  }
  async function prepareHtml(body,group,rel){
    const found=new Map();
    for(const href of links(body,canvas.origin)){
      const id=extractFileId(href,canvas.origin);
      if(id){try{const local=await file(id,group,undefined,href);if(local)found.set(id,local);}catch(e){failures.push(`附件 ${id}：${e.message}`);}}
    }
    return String(body||'').replace(/\b(href|src)\s*=\s*(["'])([^"']+)\2/gi,(original,attribute,quote,value)=>{
      try{const url=new URL(value.replace(/&amp;/g,'&'),canvas.origin);const id=extractFileId(url.toString(),canvas.origin);if(id&&found.has(id))return `${attribute}=${quote}${localLink(rel,found.get(id))}${quote}`; if(url.origin===canvas.origin)return `${attribute}=${quote}${escapeHtml(url.toString())}${quote}`;}catch{}
      return original;
    }).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi,'');
  }
  async function page(slug,group,label,sourceUrl){
    const key=`page:${slug}`;
    if(seenPages.has(slug)){const existing=state[key]?.path;record(group,label||slug,'页面',existing,sourceUrl);return;}
    const data=await canvas.object(`${prefix}/pages/${encodeURIComponent(slug)}`);
    const rel=savedPath(key,path.join(group.folder,`${safeName(data.title||slug)} [page-${data.page_id||safeName(slug)}].html`));
    const body=await prepareHtml(data.body,group,rel);
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.title||slug)}</title></head><body><h1>${escapeHtml(data.title||slug)}</h1>\n${body}</body></html>`;
    await write(rel,html,key,data.updated_at);seenPages.add(slug);
    record(group,label||data.title||slug,'页面',rel,sourceUrl||data.html_url);
  }
  async function assignment(id,group,label,sourceUrl){
    const key=`assignment:${id}`;
    if(seenAssignments.has(id)){record(group,label||`作业 ${id}`,'作业',state[key]?.path,sourceUrl);return;}
    // The list endpoint may omit the rubric; request the individual assignment.
    const a=await canvas.object(`${prefix}/assignments/${id}`);
    const rel=savedPath(key,path.join(group.folder,`${safeName(a.name)} [assignment-${id}].html`));
    const body=await prepareHtml(a.description,group,rel);
    const rubric=a.rubric?`<h2>Rubric</h2><pre>${escapeHtml(JSON.stringify(a.rubric,null,2))}</pre>`:'';
    await write(rel,`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(a.name)}</title></head><body><h1>${escapeHtml(a.name)}</h1>${body}${rubric}</body></html>`,key,a.updated_at);
    seenAssignments.add(id);record(group,label||a.name,'作业',rel,sourceUrl||a.html_url);
  }
  for(const group of groups){
    for(const it of group.items){try{
      if(it.type==='File'&&it.content_id)await file(Number(it.content_id),group,it.title,it.html_url);
      else if(it.type==='Page'&&it.page_url)await page(it.page_url,group,it.title,it.html_url);
      else if(it.type==='Assignment'&&it.content_id)await assignment(Number(it.content_id),group,it.title,it.html_url);
      else record(group,it.title,it.type,null,it.external_url||it.html_url);
    }catch(e){failures.push(`${group.name} / ${it.title}：${e.message}`);}tick(it.title);}
  }
  for(const f of files){if(!filePaths.has(Number(f.id)))try{await file(Number(f.id),other,f.display_name);}catch(e){failures.push(`${f.display_name}：${e.message}`);}tick(f.display_name);}
  for(const p of pages){if(!seenPages.has(p.url))try{await page(p.url,other,p.title);}catch(e){failures.push(`${p.title}：${e.message}`);}tick(p.title);}
  for(const a of assignments){if(!seenAssignments.has(Number(a.id)))try{await assignment(Number(a.id),assignGroup,a.name);}catch(e){failures.push(`${a.name}：${e.message}`);}tick(a.name);}
  for(const a of announcements){
    try{
      const key=`announcement:${a.id}`;
      const rel=savedPath(key,path.join(announcementGroup.folder,`${safeName(a.title)} [${a.id}].html`));
      const body=await prepareHtml(a.message,announcementGroup,rel);
      await write(rel,`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(a.title)}</title></head><body><h1>${escapeHtml(a.title)}</h1>${body}</body></html>`,key,a.updated_at);
      record(announcementGroup,a.title,'公告',rel,a.html_url);
    }catch(e){failures.push(`${a.title}：${e.message}`);}tick(a.title);
  }
  let index=`# ${course.name}\n\nCanvas: ${canvas.origin}/courses/${course.id}\n\n同步时间: ${new Date().toLocaleString()}\n\n`;
  for(const group of [...groups,other,assignGroup,announcementGroup]){
    const list=entries.filter(x=>x.group===group.id);if(!list.length)continue;
    index+=`## ${group.name}\n\n`;
    for(const it of list){const label=it.rel?`[${it.title}](${portableLink(it.rel)})`:it.title;index+=`- ${label} — ${it.type}${it.url?` · [Canvas 来源](${it.url})`:''}\n`;}
    index+='\n';
  }
  if(failures.length)index+=`## 未完成\n\n${failures.map(x=>'- '+x).join('\n')}\n`;
  await write('Course Index.md',index,'course:index',null);
  await fs.writeFile(statePath,JSON.stringify(state,null,2));
  progress(1,failures.length?'完成（部分内容未同步）':'完成');
  return {course:course.name,folder:courseDir,failures,items:entries.length};
}
module.exports={Canvas,syncCourse,ORIGIN};
