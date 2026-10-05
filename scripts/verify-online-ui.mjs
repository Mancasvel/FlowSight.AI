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
    window.onlineFail=false;window.usernameTaken=false;
    window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(!['get_online_leagues','set_online_league_consent','online_league_action'].includes(command))return original(command,args);
      window.testCalls.push({command,args});
      if(command==='get_online_leagues')return structuredClone(window.onlineTestState);
      if(window.onlineFail)throw 'Online leagues could not connect. Check your connection and retry';
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
  await page.locator('.online-sharing summary').click();await page.locator('#onlineDisable').click();
  await page.locator('#onlineAccept').waitFor();assert.equal(await page.locator('#onlineInvitationCode').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: Online opt-in, exact alias, connection failure, group creation, invitation, HTML escaping, withdrawal; five-tab layout at 340/370/900 in light/dark. Screenshots use a simulated native service.');
}finally{await browser.close();}
