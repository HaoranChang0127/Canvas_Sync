const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {safeName,saveManaged,links,extractFileId}=require('./core');
test('同步不覆盖用户修改并允许更新未修改的文件',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-lib-'));const state={};try{await saveManaged(dir,'x/a.txt',Buffer.from('one'),state,'a','1');await saveManaged(dir,'x/a.txt',Buffer.from('two'),state,'a','2');assert.equal(await fs.readFile(path.join(dir,'x/a.txt'),'utf8'),'two');await fs.writeFile(path.join(dir,'x/a.txt'),'my notes');const result=await saveManaged(dir,'x/a.txt',Buffer.from('three'),state,'a','3');assert.equal(result.status,'local-change');assert.equal(await fs.readFile(path.join(dir,'x/a.txt'),'utf8'),'my notes');assert.equal(state.a.updated,'2');}finally{await fs.rm(dir,{recursive:true,force:true})}});
test('识别课程页面中的附件并跳过外站同名路径',()=>{const urls=links('<a href="/courses/123/files/456?wrap=1">PDF</a><img src="https://example.org/files/23">','https://canvas.uts.edu.au');assert.equal(extractFileId(urls[0],'https://canvas.uts.edu.au'),456);assert.equal(extractFileId(urls[1],'https://canvas.uts.edu.au'),null)});
test('目录名兼容 Windows',()=>{assert.equal(safeName('Week 1: Basics?'),'Week 1_ Basics_');assert.equal(safeName('CON'),'_CON')});
