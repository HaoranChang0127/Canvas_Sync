const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
function defaultFolder(){return path.join(os.homedir(),'Documents','Canvas Course Library');}
async function readSettings(appData){
  try{const s=JSON.parse(await fs.readFile(path.join(appData,'settings.json'),'utf8'));return {folder:s.folder||defaultFolder()};}
  catch(e){if(e.code==='ENOENT')return {folder:defaultFolder()};throw e;}
}
async function writeSettings(appData,folder){
  if(typeof folder!=='string'||!path.isAbsolute(folder.trim()))throw Error('Enter a full folder path.');
  folder=path.normalize(folder.trim());
  const stat=await fs.stat(folder).catch(()=>null);
  if(!stat||!stat.isDirectory())throw Error('Folder does not exist. Create it or choose an existing folder.');
  await fs.mkdir(appData,{recursive:true});
  await fs.writeFile(path.join(appData,'settings.json'),JSON.stringify({folder},null,2));
  return {folder};
}
async function chooseFolder(){
  if(process.platform==='linux'){
    try {
      const {stdout}=await execute('zenity',['--file-selection','--directory','--title=Choose the Canvas sync folder'],{encoding:'utf8'});
      return stdout.trim()||null;
    } catch(e) {
      if(e.code===1)return null;
      if(e.code==='ENOENT')throw Error('Install zenity to choose a folder, or enter its full path and click Save folder.');
      throw e;
    }
  }
  if(process.platform!=='win32')throw Error('Folder selection is unavailable on this system. Enter and save the full path instead.');
  const script=[
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$form = New-Object System.Windows.Forms.Form',
    '$form.TopMost = $true',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Select the folder for your Canvas course library'",
    'if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }',
    '$dialog.Dispose(); $form.Dispose()'
  ].join('; ');
  const {stdout}=await execute('powershell.exe',['-NoProfile','-STA','-Command',script],{windowsHide:true,encoding:'utf8'});
  return stdout.trim()||null;
}
module.exports={readSettings,writeSettings,chooseFolder,defaultFolder};
