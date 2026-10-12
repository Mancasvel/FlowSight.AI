// Actual compiled renderer + actual deployed Supabase; native collection/generation
// use explicitly synthetic observations here. The separate pilot tests the local model.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.FLOWSIGHT_PLAYWRIGHT_MODULE||'playwright');
const token=process.env.FLOWSIGHT_BIP_TEST_TOKEN;
if(!token)throw new Error('Supply a short-lived disposable test-user token. Never use a real user for this test.');
const source=await readFile(new URL('./verify-recorded-time.mjs',import.meta.url),'utf8');
const begin=source.indexOf('await page.addInitScript(')+'await page.addInitScript('.length;
const end=source.indexOf('}, { locale });',begin)+1;
const initialize=source.slice(begin,end);
const output=resolve(process.env.FLOWSIGHT_BIP_EVIDENCE||'.impeccable/review/build-in-public');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({locale:'es-ES',timezoneId:'Europe/Madrid',viewport:{width:370,height:700},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript({content:`(${initialize})({locale:'es-ES'});`});
 await page.addInitScript(({token})=>{
  const original=window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
   if(command==='bip_cloud'){
    const response=await fetch('https://dzpyrdxelcgfpmcdojvb.supabase.co/functions/v1/build-in-public',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args.request)});
    const payload=await response.json();if(!response.ok)throw payload.error;return payload;
   }
   if(command==='bip_collect_local')return {evidence:[{source_key:'synthetic-browser-evidence',title:'Una mejora que se puede explicar',summary:'Contenido sintético de prueba: he reducido los pasos para preparar un informe local.',occurred_on:'2026-10-12',kind:'progress'}]};
   if(command==='bip_generate_local')return {drafts:args.request.channels.map(channel=>({evidence_id:args.request.evidence[0].id,channel,body:channel==='x'?'Prueba sintética: menos pasos para preparar un informe local.':'Este es un borrador sintético para verificar la interfaz.\n\nHe reducido los pasos necesarios para preparar un informe local. La mejora hace más sencillo revisar el trabajo antes de compartirlo.',visual:channel==='instagram'?{title:'Del trabajo a una historia',detail:'Prueba sintética: menos pasos para revisar un informe local.',footer:'FlowSight · Vista de prueba'}:null}))};
   return original(command,args);
  };
 },{token});
 await page.goto(process.env.FLOWSIGHT_RENDERER_URL||'http://127.0.0.1:1443',{waitUntil:'networkidle'});
 await page.locator('#navOnline').click();await page.locator('#onlineContentTab').click();
 await page.locator('#buildInPublic [data-action=collect]').click();await page.locator('#buildInPublic [data-local="0"]').waitFor();
 await page.locator('#buildInPublic [data-local="0"]').click();await page.locator('#bipConfirmed').check();
 await page.locator('#bipEvidenceEdit button[type=submit]').click();await page.locator('#buildInPublic [data-action=generate]').waitFor();
 await page.locator('#buildInPublic [data-action=generate]').click();await page.locator('.bip-draft-row').first().waitFor();
 assert.equal(await page.locator('.bip-draft-row').count(),3);
 await page.locator('.bip-draft-row').filter({hasText:'Instagram'}).click();
 await page.locator('#bipDraftEdit button[type=submit]').click();await page.locator('.bip-status').filter({hasText:'Cambios guardados'}).waitFor();
 await page.locator('[data-action=approve]').click();await page.locator('[data-action=send]').waitFor();
 await page.locator('#bipBody').fill('Cambio sintético tras la aprobación.');await page.locator('#bipDraftEdit button[type=submit]').click();
 await page.locator('[data-action=approve]').waitFor();assert.equal(await page.locator('[data-action=send]').count(),0);
 await page.reload({waitUntil:'networkidle'});await page.locator('#navOnline').click();await page.locator('#onlineContentTab').click();
 await page.locator('[data-view=drafts]').click();await page.locator('.bip-draft-row').filter({hasText:'Instagram'}).click();
 assert.equal(await page.locator('#bipBody').inputValue(),'Cambio sintético tras la aprobación.');
 for(const [name,width,height,scheme] of [['compact',370,700,'light'],['minimum',340,700,'light'],['wide',900,780,'light'],['dark',370,700,'dark']]){
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:scheme});
  await page.evaluate(()=>window.scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: page overflow`);
  await page.screenshot({path:resolve(output,`${name}.png`)});
  await page.locator('#bipImage').screenshot({path:resolve(output,`${name}-instagram.png`)});
  await page.locator('[data-action=back]').click();await page.locator('[data-view=stories]').click();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(output,`${name}-stories.png`)});
  await page.locator('[data-view=drafts]').click();await page.locator('.bip-draft-row').filter({hasText:'Instagram'}).click();
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({passed:true,checks:['Online navigation','Local suggestions preview','Selected evidence persisted','Three social drafts generated','Instagram image saved','Revision approved','Edit invalidates approval','Reload restores saved content','Four viewport/theme checks'],data:'Synthetic disposable account; production renderer and database'},null,2));
 console.log('Build in public: renderer → deployed API → database flow passed. Synthetic data only.');
}finally{await browser.close();}
