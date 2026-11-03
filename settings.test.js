const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {readSettings,writeSettings}=require('./settings');
test('选择的同步位置保存并可重新读取，错误路径不会覆盖',async()=>{const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-settings-'));try{const data=path.join(tmp,'config'),folder=path.join(tmp,'chosen');await fs.mkdir(folder);assert.deepEqual(await writeSettings(data,folder),{folder});assert.equal((await readSettings(data)).folder,folder);await assert.rejects(()=>writeSettings(data,path.join(tmp,'missing')));assert.equal((await readSettings(data)).folder,folder)}finally{await fs.rm(tmp,{recursive:true,force:true})}});

test('Ubuntu folder picker returns a selected folder and handles cancellation', {skip:process.platform!=='linux'}, async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'canvas-picker-'));
 const previous=process.env.PATH;
 try{
  const picker=path.join(tmp,'zenity');
  await fs.writeFile(picker,'#!/bin/sh\nprintf "%s\\n" "/home/user/Course Library"\n',{mode:0o755});
  process.env.PATH=tmp;
  const {chooseFolder}=require('./settings');
  assert.equal(await chooseFolder(),'/home/user/Course Library');
  await fs.writeFile(picker,'#!/bin/sh\nexit 1\n');
  assert.equal(await chooseFolder(),null);
  await fs.unlink(picker);
  await assert.rejects(chooseFolder,/Install zenity/);
 }finally{process.env.PATH=previous;await fs.rm(tmp,{recursive:true,force:true})}
});
