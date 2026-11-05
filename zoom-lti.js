const {syncRecording}=require('./recordings');

async function syncZoomLti(context,canvasUrl,courseDir,state,progress=()=>{}){
  const results=[];
  const page=await context.newPage();
  let listing=page;
  try{
    await page.goto(canvasUrl,{waitUntil:'domcontentloaded'});
    await page.locator('iframe').first().waitFor({timeout:30000});
    let frame;
    for(let i=0;i<60;i++){
      frame=page.frames().find(f=>f.url().includes('applications.zoom.us/lti/'));
      if(frame)break;
      await page.waitForTimeout(500);
    }
    if(!frame)throw Error('Zoom course page did not load.');
    const launch=frame.getByRole('link',{name:/click here/i});
    try{await launch.waitFor({state:'visible',timeout:6000});}catch{}
    if(await launch.isVisible()){
      const popup=context.waitForEvent('page');
      await launch.click();
      listing=await popup;
    }else listing=frame;
    await listing.getByRole('tab',{name:/Cloud Recordings/i}).click({timeout:30000});
    const rows=()=>listing.locator('tbody.ant-table-tbody tr').filter({has:listing.getByRole('button')});
    try{await rows().first().waitFor({timeout:20000});}catch{return results;}
    let pageNumber=1;
    while(true){
      const count=await rows().count();
      for(let i=0;i<count;i++){
        const row=rows().nth(i);
        const label=(await row.innerText()).replace(/\s+/g,' ').trim();
        progress(`Zoom: ${label}`);
        await row.getByRole('button').first().click();
        const cards=listing.locator('.lti-recording-item');
        await cards.first().waitFor({timeout:30000});
        const transcript=cards.filter({hasText:/audio transcript/i}).first();
        try{await transcript.waitFor({timeout:12000});}catch{}
        const audio=cards.filter({hasText:/audio only/i}).first();
        const card=await transcript.count()?transcript:(await audio.count()?audio:null);
        if(card){
          const show=card.getByRole('button',{name:/display passcode/i});
          let passcode='';
          if(await show.count()){
            await show.click();
            passcode=await card.locator('footer').evaluate(el=>{
              const button=el.querySelector('[aria-label="Hidden Passcode"], [aria-label="Hide Passcode"]');
              return button?.parentElement?.parentElement?.childNodes[0]?.textContent?.trim()||'';
            });
          }
          const opened=context.waitForEvent('page');
          await card.locator('.lti-recording-item-play-media').click();
          const viewer=await opened;
          await viewer.waitForLoadState('domcontentloaded');
          const current=viewer.url();
          const parsed=new URL(current);
          const url=parsed.searchParams.get('originRequestUrl')||current;
          const result=await syncRecording(context,{title:label,url,passcode,key:`${canvasUrl}|${label}`,expectTranscript:await transcript.count()>0},courseDir,state,viewer);
          results.push({title:label,url,...result});
        }else results.push({title:label,url:canvasUrl,status:'No accessible transcript or audio found.',found:false});
        await listing.getByRole('button',{name:'Course Recordings'}).click();
        await rows().nth(i).waitFor({timeout:30000});
        if(pageNumber>1){
          for(let n=1;n<pageNumber;n++){await listing.locator('.ant-pagination-next:not(.ant-pagination-disabled)').click();await listing.locator('.ant-pagination-item-active').filter({hasText:String(n+1)}).waitFor({timeout:30000});}
        }
      }
      const next=listing.locator('.ant-pagination-next:not(.ant-pagination-disabled)');
      if(!await next.count())break;
      await next.click();pageNumber++;
      await listing.locator('.ant-pagination-item-active').filter({hasText:String(pageNumber)}).waitFor({timeout:30000});
    }
  }finally{
    if(listing!==page&&typeof listing.close==='function')await listing.close();
    await page.close();
  }
  return results;
}
module.exports={syncZoomLti};
