// Real renderer; simulated native service solely for isolated UI verification.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const source=await readFile(new URL('./verify-recorded-time.mjs',import.meta.url),'utf8');
const begin=source.indexOf('await page.addInitScript(')+'await page.addInitScript('.length;
const end=source.indexOf('}, { locale });',begin)+1;
const initialize=source.slice(begin,end);
const out=new URL('../.impeccable/review/online/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({locale:'es-ES',viewport:{width:370,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript({content:`(${initialize})({locale:'es-ES'});`});
  await page.addInitScript(()=>{
    const original=window.__TAURI_INTERNALS__.invoke;
    window.onlineTestState={signed_in:true,enabled:false,groups:[],alias:''};
    window.onlineFail=false;window.usernameTaken=false;window.onlineHold=false;window.onlineCloudError='';
    window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(!['get_online_leagues','set_online_league_consent','online_league_action'].includes(command))return original(command,args);
      window.testCalls.push({command,args});
      if(window.onlineFail)throw 'Online leagues could not connect. Check your connection and retry';
      if(command==='get_online_leagues'){
        const result=structuredClone(window.onlineTestState);
        if(window.onlineCloudError)Object.assign(result,{cloud_error:window.onlineCloudError,groups:[],today_points:undefined,week_start:undefined});
        if(window.onlineHold)return new Promise((resolve,reject)=>{window.finishOnlineRefresh=()=>resolve(result);window.failOnlineRefresh=()=>reject('Online leagues could not connect. Check your connection and retry');});
        return result;
      }
      if(window.usernameTaken&&command==='set_online_league_consent')throw 'Username already taken. Choose another';
      if(command==='set_online_league_consent'){
        Object.assign(window.onlineTestState,{enabled:args.accept,alias:args.alias,today_points:0,eligible_minutes:0,week_start:'2026-10-05',withdrawal_pending:false});
        if(!args.accept)window.onlineTestState.groups=[];
      }else if(args.request.action==='create'){
        window.onlineTestState.groups=[{id:'test-group',name:args.request.name,owner:true,members:[{alias:window.onlineTestState.alias,mine:true,points:0,rank:1}]}];
        window.onlineTestState.invitation_code='a'.repeat(64);
      }
      return structuredClone(window.onlineTestState);
    };
  });
  await page.goto('http://127.0.0.1:1420',{waitUntil:'networkidle'});
  await page.locator('#navOnline').click();await page.locator('#onlineAccept:not([disabled])').waitFor();
  assert.equal(await page.evaluate(()=>window.testCalls.filter(c=>c.command==='set_online_league_consent').length),0);
  assert.match(await page.locator('#tabOnline').innerText(),/no se comparten aplicaciones, tareas, títulos ni capturas/);
  for(const scheme of ['light','dark']){
    await page.emulateMedia({colorScheme:scheme});
    for(const width of [340,370,900]){
      await page.setViewportSize({width,height:700});
      await page.screenshot({path:new URL(`consent-${scheme}-${width}.png`,out).pathname.slice(1)});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const positions=await page.locator('.bottom-nav .nav-item').evaluateAll(items=>items.map(x=>x.getBoundingClientRect().left));
      assert.ok(positions.every((x,i)=>i===0||x>positions[i-1]));
    }
  }
  await page.setViewportSize({width:370,height:700});
  await page.locator('#onlineAlias').fill('Ana.Foco');
  await page.evaluate(()=>window.onlineFail=true);
  await page.locator('#onlineAccept').click();await page.locator('.online-status').filter({hasText:'No se pudo conectar'}).waitFor();
  assert.equal(await page.locator('#onlineCreate').count(),0);
  await page.evaluate(()=>window.onlineFail=false);
  await page.evaluate(()=>window.usernameTaken=true);
  await page.locator('#onlineAlias').fill('Ana.Foco');
  await page.locator('#onlineAccept').click();await page.locator('.online-status').filter({hasText:'ya está ocupado'}).waitFor();
  assert.equal(await page.locator('#onlineAlias').inputValue(),'ana.foco');
  assert.equal(await page.locator('#onlineCreate').count(),0);
  await page.evaluate(()=>window.usernameTaken=false);
  await page.locator('#onlineAlias').fill('Ana.Foco');
  await page.locator('#onlineAccept').click();await page.locator('#onlineCreate').waitFor();
  const accepted=await page.evaluate(()=>window.testCalls.filter(c=>c.command==='set_online_league_consent').at(-1));
  assert.deepEqual(accepted.args,{accept:true,alias:'ana.foco'});
  await page.locator('#onlineGroupName').fill('Equipo <b>');await page.locator('#onlineCreate button').click();
  await page.locator('.online-group').waitFor();assert.equal(await page.locator('.online-group h2').innerText(),'Equipo <b>');
  assert.equal(await page.locator('.online-group b,.online-group script').count(),0);
  await page.locator('#onlineInvitationCode').waitFor();assert.equal((await page.locator('#onlineInvitationCode').inputValue()).length,64);
  await page.screenshot({path:new URL('group-simulated-native.png',out).pathname.slice(1)});

  // A successful request with zero points must still visibly complete.
  await page.evaluate(()=>window.onlineHold=true);
  await page.locator('#onlineRefresh').click();
  await page.locator('.online-sharing summary').focus();
  await page.evaluate(()=>{window.finishOnlineRefresh();window.onlineHold=false;});
  await page.locator('.online-status').filter({hasText:'Sincronizado'}).waitFor();
  assert.match(await page.locator('.online-status').innerText(),/25 min/);

  // Keep the request pending to verify loading, no duplicate request and drafts
  // edited during the network round trip (rather than an outdated snapshot).
  await page.evaluate(()=>{
    window.onlineHold=true;
    Object.assign(window.onlineTestState,{today_points:40,eligible_minutes:25});
    window.onlineTestState.groups[0].members[0].points=40;
  });
  const syncCalls=await page.evaluate(()=>window.testCalls.filter(c=>c.command==='get_online_leagues').length);
  await page.locator('#onlineRefresh').click();
  assert.equal(await page.locator('#onlineRefresh').innerText(),'Sincronizando…');
  assert.equal(await page.locator('#onlineRefresh').isDisabled(),true);
  assert.equal(await page.locator('.online-summary').getAttribute('aria-busy'),'true');
  await page.locator('#onlineRefresh').evaluate(button=>button.click());
  assert.equal(await page.evaluate(()=>window.testCalls.filter(c=>c.command==='get_online_leagues').length),syncCalls+1);
  await page.locator('.online-sharing summary').click();
  await page.locator('#onlineGroupName').fill('Mi nuevo grupo');
  await page.locator('#onlineCode').fill('codigo-pendiente');
  await page.locator('#onlineGroupName').focus();
  await page.evaluate(()=>window.finishOnlineRefresh());
  await page.locator('.online-score-line strong').filter({hasText:'40 / 100'}).waitFor();
  assert.equal(await page.locator('.online-group li strong').innerText(),'40');
  assert.equal(await page.locator('.online-status').getAttribute('data-state'),'success');
  assert.equal(await page.locator('#onlineRefresh').isEnabled(),true);
  assert.equal(await page.locator('.online-summary').getAttribute('aria-busy'),'false');
  assert.equal(await page.locator('#onlineGroupName').inputValue(),'Mi nuevo grupo');
  assert.equal(await page.locator('#onlineCode').inputValue(),'codigo-pendiente');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'onlineGroupName');
  assert.equal(await page.locator('.online-sharing').evaluate(detail=>detail.open),true);
  for(const width of [340,370]){
    await page.setViewportSize({width,height:700});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.screenshot({path:new URL('sync-success-simulated-native.png',out).pathname.slice(1)});

  // Native failures resolve with local data; preserve the last remote ranking
  // and show an error, never a success indication. Retrying restores feedback.
  await page.evaluate(()=>{window.onlineHold=false;window.onlineCloudError='Online leagues could not connect. Check your connection and retry';});
  await page.locator('#onlineRefresh').click();
  await page.locator('.online-status').filter({hasText:'No se pudo conectar'}).waitFor();
  assert.equal(await page.locator('.online-status').getAttribute('data-state'),'error');
  assert.equal(await page.locator('.online-group li strong').innerText(),'40');
  assert.equal(await page.locator('.online-score-line strong').innerText(),'40 / 100');
  assert.equal(await page.locator('#onlineRefresh').isEnabled(),true);
  await page.evaluate(()=>{window.onlineCloudError='';window.onlineFail=true;});
  await page.locator('#onlineRefresh').click();
  await page.locator('.online-status').filter({hasText:'No se pudo conectar'}).waitFor();
  assert.equal(await page.locator('#onlineRefresh').isEnabled(),true);
  await page.evaluate(()=>window.onlineFail=false);
  await page.locator('#onlineRefresh').click();
  await page.locator('.online-status').filter({hasText:'Sincronizado'}).waitFor();
  assert.equal(await page.locator('.online-status').getAttribute('data-state'),'success');

  // A response from before withdrawal must not restore enabled consent.
  await page.evaluate(()=>window.onlineHold=true);
  await page.locator('#onlineRefresh').click();
  await page.locator('#onlineDisable').click();
  await page.locator('#onlineAccept').waitFor();
  await page.evaluate(()=>window.finishOnlineRefresh());
  await page.waitForTimeout(50);
  await page.locator('#onlineAccept').waitFor();assert.equal(await page.locator('#onlineInvitationCode').count(),0);
  assert.equal(await page.locator('#onlineRefresh').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: Online opt-in, unique username, group creation, invitation, escaping, withdrawal; manual sync loading/success/zero points/error/retry, no duplicate request, updated ranking, draft/focus preservation and stale response protection; five-tab layout at 340/370/900 in light/dark. Screenshots use a simulated native service.');
}finally{await browser.close();}
