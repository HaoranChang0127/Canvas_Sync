const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {Canvas,syncCourse}=require('./sync');
test('同步页面中的附件并在第二次同步时跳过未变化文件',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-integration-'));let downloads=0;
 const data={
 '/api/v1/courses/1/modules?per_page=100':[{id:2,name:'Weekly Material'}],
 '/api/v1/courses/1/modules/2/items?per_page=100':[{type:'Page',page_url:'week-1',title:'Week 1'}],
 '/api/v1/courses/1/files?per_page=100':[{id:42,display_name:'Lecture.pdf',updated_at:'v1',url:'https://canvas.uts.edu.au/download/42'}],
 '/api/v1/courses/1/pages?per_page=100':[{url:'week-1',title:'Week 1'}],
 '/api/v1/courses/1/pages/week-1':{page_id:5,title:'Week 1',updated_at:'v1',body:'<a href="/courses/1/files/42?wrap=1">Slides</a>'},
 '/api/v1/courses/1/assignments?per_page=100':[],
 '/api/v1/courses/1/tabs?per_page=100':[],
 '/api/v1/announcements?context_codes[]=course_1&per_page=100':[]};
 const ctx={request:{get:async(url)=>{let u=new URL(url),key=u.pathname+u.search;if(u.pathname==='/download/42'){downloads++;return {ok:()=>true,status:()=>200,headers:()=>({'content-type':'application/pdf'}),body:async()=>Buffer.from('PDF')}}return {ok:()=>!!data[key],status:()=>data[key]?200:404,headers:()=>({'content-type':'application/json'}),json:async()=>data[key]}}}};
 try{const api=new Canvas(ctx);const course={id:1,name:'Test Course'};let first=await syncCourse(api,course,root,()=>{});assert.deepEqual(first.failures,[]);assert.equal(downloads,1);const index=await fs.readFile(path.join(first.folder,'Course Index.md'),'utf8');assert.match(index,/Weekly Material/);assert.match(index,/Lecture\.pdf/);let second=await syncCourse(api,course,root,()=>{});assert.equal(downloads,1);assert.deepEqual(second.failures,[]);}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('模块引用、脱离模块的资料及增量冲突处理',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-tree-'));let version='1', downloads=0;
 const ctx={request:{get:async(url)=>{const u=new URL(url),key=u.pathname+u.search;let data;
 if(key==='/api/v1/courses/8/modules?per_page=100')data=[{id:11,name:'Week One'},{id:12,name:'Week Two'}];
 else if(key==='/api/v1/courses/8/modules/11/items?per_page=100')data=[{type:'Page',page_url:'overview',title:'Overview'}];
 else if(key==='/api/v1/courses/8/modules/12/items?per_page=100')data=[{type:'File',content_id:50,title:'Same slide'}];
 else if(key==='/api/v1/courses/8/files?per_page=100')data=[{id:50,filename:'slides.pdf',display_name:'slides.pdf',content_type:'application/pdf',updated_at:version,url:'https://canvas.uts.edu.au/download/50'},{id:51,filename:'extra.pdf',display_name:'extra.pdf',updated_at:'1',url:'https://canvas.uts.edu.au/download/51'}];
 else if(key==='/api/v1/courses/8/pages?per_page=100')data=[{url:'overview',title:'Overview'}];
 else if(key==='/api/v1/courses/8/pages/overview')data={page_id:99,title:'Overview',body:'<a href="/courses/8/files/50?wrap=1">Slides</a>'};
 else if(key==='/api/v1/announcements?context_codes[]=course_8&per_page=100')data=[{id:90,title:'Correction',message:'Corrected value',html_url:'https://canvas.uts.edu.au/courses/8/discussion_topics/90'}];
 else if(key==='/api/v1/courses/8/assignments?per_page=100')data=[{id:9,name:'Essay'}];
 else if(key==='/api/v1/courses/8/assignments/9')data={id:9,name:'Essay',description:'Write',rubric:[{description:'Clarity',points:5}]};
 else if(u.pathname.startsWith('/download/')){downloads++;return {ok:()=>true,status:()=>200,headers:()=>({'content-type':'application/pdf'}),body:async()=>Buffer.from(u.pathname==='\/download/50'?`slides${version}`:'extra')};}
 return {ok:()=>data!==undefined,status:()=>data===undefined?404:200,headers:()=>({'content-type':'application/json'}),json:async()=>data};}}};
 try{const api=new Canvas(ctx),course={id:8,name:'Class'},first=await syncCourse(api,course,root,()=>{});assert.deepEqual(first.failures,[]);assert.equal(downloads,2);const index=await fs.readFile(path.join(first.folder,'Course Index.md'),'utf8');assert.match(index,/Week One/);assert.match(index,/Week Two/);assert.match(index,/未关联模块/);assert.match(index,/Correction/);const st=JSON.parse(await fs.readFile(path.join(first.folder,'.canvas-sync.json')));const slide=path.join(first.folder,st['file:50'].path),page=path.join(first.folder,st['page:overview'].path);assert.match(st['file:50'].path,/Modules/);assert.match(st['file:51'].path,/Other Materials/);const html=await fs.readFile(page,'utf8');const href=html.match(/href="([^"]+)"/)[1];assert.equal(path.resolve(path.dirname(page),decodeURIComponent(href)),slide);const assignment=await fs.readFile(path.join(first.folder,st['assignment:9'].path),'utf8');assert.match(assignment,/Clarity/);await fs.writeFile(slide,'personal annotation');version='2';const second=await syncCourse(api,course,root,()=>{});assert.equal(await fs.readFile(slide,'utf8'),'personal annotation');assert.ok(second.failures.some(x=>x.includes('未覆盖')));assert.equal(downloads,3);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
