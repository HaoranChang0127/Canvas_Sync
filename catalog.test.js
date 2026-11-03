const {test}=require('node:test');const assert=require('node:assert/strict');const {Canvas}=require('./sync');
test('Dashboard 优先，合并当前与历史课程并读取分页',async()=>{
 const answers={
 '/api/v1/courses?enrollment_state=active&state[]=available&state[]=completed&per_page=100':{data:[{id:1,name:'Current'},{id:2,name:'Other'}],link:'<https://canvas.test/page2>; rel="next"'},
 '/page2':{data:[{id:3,name:'More'}]},
 '/api/v1/courses?enrollment_state=completed&state[]=available&state[]=completed&per_page=100':{data:[{id:4,name:'Past'},{id:2,name:'Other'}]},
 '/api/v1/courses?enrollment_state=invited_or_pending&state[]=available&state[]=completed&per_page=100':{data:[]},
 '/api/v1/dashboard/dashboard_cards':{data:[{id:1},{id:5,originalName:'Dashboard only'}]}};
 const ctx={request:{get:async url=>{let u=new URL(url),answer=answers[u.pathname+u.search];return {ok:()=>!!answer,status:()=>answer?200:404,headers:()=>({'content-type':'application/json',link:answer?.link||''}),json:async()=>answer.data}}}};
 const result=await new Canvas(ctx,'https://canvas.test').courses();assert.deepEqual(result.warnings,[]);assert.deepEqual(result.courses.map(x=>x.id),[1,5,2,3,4]);assert.deepEqual(result.courses.map(x=>x.dashboard),[true,true,false,false,false]);
});
test('单类课程读取失败时返回其他课程并显示提示',async()=>{const ctx={request:{get:async url=>{const u=new URL(url);let fail=u.searchParams.get('enrollment_state')==='completed';if(u.pathname.endsWith('dashboard_cards'))fail=false;return {ok:()=>!fail,status:()=>fail?403:200,headers:()=>({'content-type':'application/json'}),json:async()=>[]}}}};const result=await new Canvas(ctx,'https://canvas.test').courses();assert.ok(result.warnings.length>0)});
