// Actual compiled app/API/database/MCP; only the activity fixture is synthetic.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.FLOWSIGHT_PLAYWRIGHT_MODULE||'playwright');
const token=process.env.FLOWSIGHT_BIP_TEST_TOKEN;
if(!token)throw new Error('A disposable test-user token is required.');
const endpoint='https://dzpyrdxelcgfpmcdojvb.supabase.co/functions/v1/';
async function api(body){const response=await fetch(endpoint+'build-in-public',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;}
const source=await readFile(new URL('./verify-recorded-time.mjs',import.meta.url),'utf8');
const begin=source.indexOf('await page.addInitScript(')+'await page.addInitScript('.length;
const end=source.indexOf('}, { locale });',begin)+1;
const output=resolve(process.env.FLOWSIGHT_BIP_EVIDENCE||'.impeccable/review/build-in-public');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({locale:'es-ES',timezoneId:'Europe/Madrid',viewport:{width:370,height:700},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript({content:`(${source.slice(begin,end)})({locale:'es-ES'});`});
 await page.addInitScript(({token,endpoint})=>{
  const original=window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
   if(command==='bip_cloud'){const response=await fetch(endpoint+'build-in-public',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args.request)});const payload=await response.json();if(!response.ok)throw payload.error;return payload;}
   if(command==='bip_collect_local')return {evidence:[{source_key:'synthetic-browser-evidence',title:'La música acompaña a las pausas de trabajo',summary:'Prueba sintética: trabajo en vincular la pausa de YouTube con una sesión de concentración.',occurred_on:'2026-10-12',kind:'progress'}]};
   if(command==='bip_generate_local')throw new Error('Prompt preparation must not invoke local copywriting.');
   return original(command,args);
  };
 },{token,endpoint});
 const click=selector=>page.locator(selector).click();
 const status=text=>page.locator('.bip-status').filter({hasText:text}).waitFor();
 const focus=async id=>assert.equal(await page.evaluate(()=>document.activeElement.id),id);
 await page.goto(process.env.FLOWSIGHT_RENDERER_URL||'http://127.0.0.1:1443',{waitUntil:'networkidle'});
 await click('#navOnline');await click('#onlineContentTab');await click('[data-view=connections]');
 await page.locator('#bipProfileNetwork').selectOption('x');await page.locator('#bipProfileName').fill('Perfil de prueba');await page.locator('#bipProfileHandle').fill('@synthetic_builder');await page.locator('#bipProfileStyle').selectOption('thread');
 await click('#bipProfileForm button[type=submit]');await status('Perfil añadido');await focus('bipProfileFormSubmit');assert.equal(await page.locator('#bipBufferKey').count(),0);
 await click('[data-view=stories]');await click('[data-action=collect]');await click('[data-local="0"]');await page.locator('#bipConfirmed').check();await click('#bipEvidenceEdit button[type=submit]');await page.locator('[data-action=generate]').waitFor();
 await page.locator('[data-network=x]').uncheck();assert.equal(await page.evaluate(()=>document.activeElement.dataset.network),'x');await page.locator('[data-network=x]').check();await page.locator('#bipStyle-x').selectOption('thread');
 const state=await api({action:'studio'});await page.locator('#bipProfile-x').selectOption(state.profiles[0].id);
 await click('[data-action=generate]');await page.locator('[data-brief]').first().waitFor();assert.equal(await page.locator('[data-brief]').count(),3);
 await page.locator('[data-brief]').filter({hasText:'Hilo del proceso'}).click();const prompt=await page.locator('#bipPrompt').inputValue();assert.ok(prompt.includes('Hilo de 3 a 5'));assert.ok(prompt.includes('@synthetic_builder'));assert.ok(prompt.includes('no publica'));
 await page.locator('#bipPrompt').fill(prompt+'\n\nPreferencia sintética: evita tecnicismos.');await click('#bipBriefEdit button[type=submit]');await status('Prompt guardado');await focus('bipBriefEditSubmit');
 const assistant=(await api({action:'assistant_token'})).token;
 async function mcp(name,args={}){const response=await fetch(endpoint+'build-in-public-assistant',{method:'POST',headers:{Authorization:`Bearer ${assistant}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});const value=await response.json();assert.ok(response.ok&&!value.result.isError,JSON.stringify(value));return value.result;}
 const context=JSON.parse((await mcp('get_content_context')).content[0].text);assert.equal(context.briefs.length,3);assert.equal(context.profiles.length,1);
 const drafts=context.briefs.map(brief=>({brief_id:brief.id,evidence_id:brief.evidence_id,channel:brief.channel,body:'Propuesta sintética: la música acompaña a la pausa de concentración.',details:brief.channel==='x'?'1. Problema observado.\n2. Decisión de diseño.\n3. Próximo paso.':'Desarrollo sintético devuelto por el asistente.',visual:brief.channel==='instagram'?{title:'La pausa también se escucha',detail:'Un boceto sintético para explicar el trabajo.',footer:'FlowSight · Prueba'}:null}));
 await mcp('save_content_drafts',{batch_key:crypto.randomUUID(),drafts});
 await page.reload({waitUntil:'networkidle'});await click('#navOnline');await click('#onlineContentTab');await click('[data-view=drafts]');await page.locator('[data-draft]').first().waitFor();assert.equal(await page.locator('[data-draft]').count(),3);assert.equal(await page.locator('[data-action=send],[data-action=approve]').count(),0);
 await page.locator('[data-draft]').filter({hasText:'Instagram'}).click();await page.locator('#bipBody').fill('Texto sintético revisado.');await click('#bipDraftEdit button[type=submit]');await status('Cambios guardados');await focus('bipDraftEditSubmit');
 for(const [name,width,height,scheme] of [['compact',370,700,'light'],['minimum',340,400,'light'],['wide',900,780,'light'],['dark',370,700,'dark']]){
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(250);
  for(const view of ['stories','prompts','connections']){
   await click(`[data-view=${view}]`);await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(output,`${name}-${view}.png`)});
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,checks:['Independent X profile without Buffer','Per-network styles','Local ideas reviewed','Three prompts persisted','Prompt editing','MCP receives profiles and briefs','MCP returns full thread/visual content','Returned content editable','No publishing controls','Focus after profile/prompt/content save','370x700,340x400,900x780 and dark'],data:'Synthetic disposable account; actual compiled renderer, live API/database and MCP'},null,2));
 console.log('Assistant-first Build in public: full renderer/API/database/MCP round-trip passed. Synthetic data.');
}finally{await browser.close();}
