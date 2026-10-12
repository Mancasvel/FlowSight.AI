import {getLanguage} from './i18n.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=(es,en)=>getLanguage()==='es'?es:en;
const channelName={linkedin:'LinkedIn',x:'X',instagram:'Instagram'};
const limits={linkedin:3000,x:280,instagram:2200};
const dateLabel=value=>new Date(`${value}T12:00:00`).toLocaleDateString(getLanguage()==='es'?'es-ES':'en-GB',{day:'numeric',month:'short'});
export function contentLength(text,channel){
  if(channel!=='x')return [...text].length;
  const urls=text.match(/https?:\/\/\S+/g)||[];
  return urls.length*23+[...text.replace(/https?:\/\/\S+/g,'')].reduce((n,c)=>{const p=c.codePointAt(0);return n+(p<=0x10ff||(p>=0x2000&&p<=0x200d)||(p>=0x2010&&p<=0x201f)||(p>=0x2032&&p<=0x2037)?1:2);},0);
}
export function drawContentImage(visual,canvas=document.createElement('canvas')){
  canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f6f8f5';ctx.fillRect(0,0,1080,1350);
  function wrap(text,y,size,weight,color,maxLines){
    let lines=[];
    do {
      ctx.font=`${weight} ${size}px Manrope, sans-serif`;lines=[''];
      for(const word of String(text).split(/\s+/)){
        const index=lines.length-1,test=lines[index]?`${lines[index]} ${word}`:word;
        if(ctx.measureText(test).width<=920)lines[index]=test;
        else {
          if(lines[index])lines.push('');
          for(const char of word){const last=lines.length-1;if(ctx.measureText(lines[last]+char).width>920)lines.push(char);else lines[last]+=char;}
        }
      }
      if(lines.length<=maxLines)break;
      size-=2;
    }while(size>=20);
    ctx.fillStyle=color;
    for(const line of lines){ctx.fillText(line,76,y);y+=size*1.28;}
    return y;
  }
  const end=wrap(visual.title,240,72,750,'#152d2a',4);
  wrap(visual.detail,Math.max(600,end+62),43,450,'#41534e',8);
  ctx.fillStyle='#c6d4cd';ctx.fillRect(76,1196,928,2);
  ctx.font='500 28px Manrope, sans-serif';ctx.fillStyle='#47675e';ctx.fillText(String(visual.footer||'').slice(0,80),76,1250,928);
  return canvas.toDataURL('image/png');
}

export function mountBuildInPublic({root,invoke}){
  let state=null,tab='stories',busy=false,error='',notice='',local=[],editor=null,days=7,loaded=false;
  let networks=['linkedin','x','instagram'],secret='',cadenceTimer=null,refreshing=false,pendingFocus=null;
  const editing=new Map();
  const api=request=>invoke('bip_cloud',{request:{...request,...(state?.owner_id&&request.action!=='studio'?{expected_owner:state.owner_id}:{})}});
  const localKey=()=>`bip-local-ideas-${state.owner_id}`;
  function persistLocal(){if(state)try{localStorage.setItem(localKey(),JSON.stringify({evidence:local,at:Date.now()}));}catch{/* Storage may be full. */}}
  function acceptStudio(next){
    if(state?.owner_id!==next.owner_id){
      editor=null;secret='';local=[];editing.clear();
      try{const cached=JSON.parse(localStorage.getItem(`bip-local-ideas-${next.owner_id}`)||'null');if(cached&&Date.now()-cached.at<30*86400000)local=cached.evidence;}catch{/* Invalid cache is ignored. */}
    }
    state=next;loaded=true;
  }
  const controlsDisabled=()=>busy?'disabled':'';
  const selected=()=>state?.evidence.filter(item=>item.state==='selected')||[];
  const stateLabel=value=>({draft:tr('Borrador','Draft'),approved:tr('Aprobado','Approved'),sending:tr('Enviando','Sending'),scheduled:tr('En cola','Queued'),published:tr('Publicado','Published'),failed:tr('Revisar envío','Review delivery'),uncertain:tr('Comprobar en Buffer','Check Buffer')})[value]||value;
  async function refresh(){
    if(busy||refreshing)return;refreshing=true;busy=true;
    captureEditor();
    render();
    try{acceptStudio(await api({action:'studio'}));error='';}catch(e){state=null;loaded=false;local=[];editor=null;secret='';error=String(e);}finally{refreshing=false;busy=false;}
    render();
  }
  async function run(task,{reload=true}={}){
    if(busy)return;busy=true;error='';notice='';render();
    try{await task();if(reload)acceptStudio(await api({action:'studio'}));}
    catch(e){error=String(e);}
    finally{busy=false;render();}
  }
  function header(){return `<header class="bip-heading"><h1>Build in public</h1><p>${tr('De lo que haces a lo que compartes.','From the work you do to the stories you share.')}</p></header><nav class="bip-tabs" aria-label="Build in public">${[['stories',tr('Historias','Stories')],['drafts',tr('Borradores','Drafts')],['connections',tr('Conexiones','Connections')]].map(([value,label])=>`<button type="button" data-view="${value}" aria-current="${tab===value?'page':'false'}" ${controlsDisabled()}>${label}${value==='drafts'&&state?.drafts.length?` <span>${state.drafts.length}</span>`:''}</button>`).join('')}</nav>`;}
  function stories(){return `<div class="bip-period"><label for="bipPeriod">${tr('Tu trabajo de','Your work from')}</label><select id="bipPeriod" ${controlsDisabled()}>${[[1,tr('Hoy','Today')],[7,tr('Los últimos 7 días','The last 7 days')],[30,tr('Los últimos 30 días','The last 30 days')]].map(([n,label])=>`<option value="${n}" ${days===n?'selected':''}>${label}</option>`).join('')}</select></div>
    <button class="button button-primary bip-primary" data-action="collect" ${controlsDisabled()}>${tr('Buscar historias en mi trabajo','Find stories in my work')}</button><p class="bip-note">${tr('Se analiza en tu equipo. Tú eliges qué guardar y compartir.','Analyzed on your device. You choose what to save and share.')}</p>
    ${local.length?`<section class="bip-story-list"><h2>${tr('Ideas encontradas en este equipo','Ideas found on this device')}</h2><p class="bip-note">${tr('Son observaciones. Revisa el resultado antes de convertirlo en un logro.','These are observations. Review the outcome before presenting it as an achievement.')}</p>${local.map((item,index)=>`<button class="bip-story" data-local="${index}" ${controlsDisabled()}><span class="bip-story-date">${dateLabel(item.occurred_on)}</span><strong>${esc(item.title)}</strong><span class="bip-story-action">${tr('Revisar historia','Review story')} <span aria-hidden="true">→</span></span></button>`).join('')}</section>`:''}
    <section class="bip-story-list"><div class="bip-section-heading"><h2>${tr('Tus historias','Your stories')}</h2><button class="bip-text-button" data-action="manual" ${controlsDisabled()}>${tr('Añadir hito','Add highlight')}</button></div>${state?.evidence.filter(item=>item.state!=='dismissed').length?state.evidence.filter(item=>item.state!=='dismissed').map(item=>`<article class="bip-saved-story"><label class="bip-choice"><input type="checkbox" data-select="${item.id}" ${item.state==='selected'?'checked':''} ${controlsDisabled()}><span><strong>${esc(item.title)}</strong><small>${dateLabel(item.occurred_on)} · ${item.confirmed?tr('Confirmado por ti','Confirmed by you'):tr('Pendiente de confirmar','Awaiting confirmation')}</small></span></label><button class="bip-text-button" data-evidence="${item.id}" ${controlsDisabled()}>${tr('Editar','Edit')}</button></article>`).join(''):`<div class="bip-empty"><h3>${tr('Empieza por un avance concreto','Start with one concrete step')}</h3><p>${tr('Una mejora que has hecho, una decisión o algo que acabas de aprender. Busca en tu actividad o añádelo tú.','An improvement, a decision, or something you learned. Find it in your activity or add it yourself.')}</p></div>`}</section>
    ${selected().length?`<section class="bip-generation"><h2>${tr('Crear para','Create for')}</h2><div class="bip-networks">${Object.entries(channelName).map(([key,name])=>`<label><input type="checkbox" data-network="${key}" ${networks.includes(key)?'checked':''} ${controlsDisabled()}>${name}</label>`).join('')}</div><button class="button button-primary bip-primary" data-action="generate" ${busy||!networks.length||selected().length>3?'disabled':''}>${tr('Crear borradores con IA local','Create drafts with local AI')}</button><p class="bip-note">${selected().length>3?tr('Selecciona un máximo de 3 historias por generación.','Select up to 3 stories at a time.'):tr('LinkedIn y X reciben su propio texto. Instagram incluye una imagen.','LinkedIn and X get their own text. Instagram includes an image.')}</p></section>`:''}`;}
  function drafts(){return state?.drafts.length?`<div class="bip-draft-list">${state.drafts.map(draft=>`<button class="bip-draft-row" data-draft="${draft.id}" ${controlsDisabled()}><div class="bip-draft-meta"><strong>${channelName[draft.channel]}</strong><span data-state="${draft.state}">${stateLabel(draft.state)}</span></div><p>${esc(draft.body.slice(0,180))}${draft.body.length>180?'…':''}</p><small>${draft.engine==='local'?tr('IA local','Local AI'):draft.engine==='assistant'?'Codex / MCP':tr('Escrito por ti','Written by you')} · ${tr('Versión','Version')} ${draft.revision}</small></button>`).join('')}</div>`:`<div class="bip-empty"><h2>${tr('Tu próxima publicación empieza con tu trabajo','Your next post starts with your work')}</h2><p>${tr('Selecciona una historia y crea tus primeros borradores. Aquí podrás editarlos y revisar cada red antes de enviarlos.','Select a story and create your first drafts. Edit them here and review each network before sending.')}</p><button class="button" data-view="stories">${tr('Elegir una historia','Choose a story')}</button></div>`;}
  function connections(){const prefs=state?.settings||{project_name:'FlowSight',voice:'',excluded_terms:[],cadence:'manual'};return `<section class="bip-connection"><h2>${tr('Tus redes','Your networks')}</h2>${state?.channels.length?`<ul class="bip-channel-list">${state.channels.map(ch=>`<li><strong>${channelName[ch.service]}</strong><span>${esc(ch.name)}</span></li>`).join('')}</ul><button class="bip-text-button" data-action="disconnect" ${controlsDisabled()}>${tr('Desconectar Buffer','Disconnect Buffer')}</button>`:`<p>${tr('Conecta las cuentas que ya tienes en Buffer. Podrás elegir el destino exacto para cada publicación.','Connect your existing Buffer accounts. Choose the exact destination for each post.')}</p>`}
    <form id="bipConnect"><label for="bipBufferKey">${tr('Clave API de Buffer','Buffer API key')}</label><input id="bipBufferKey" type="password" autocomplete="off" minlength="20" maxlength="2000" required placeholder="${tr('Se guarda cifrada','Stored encrypted')}" ${controlsDisabled()}><button class="button" type="submit" ${controlsDisabled()}>${tr('Conectar cuentas','Connect accounts')}</button></form><p class="bip-note">${tr('Gestiona tus redes y tu clave en los ajustes de Buffer.','Manage your networks and API key in Buffer settings.')}</p></section>
    <section class="bip-connection"><h2>Codex ${tr('y otros asistentes','and other assistants')}</h2><p>${tr('Tu asistente puede leer las historias que selecciones y dejarte borradores aquí. Tú conservas la aprobación y el envío.','Your assistant can read selected stories and leave drafts here. You keep approval and sending controls.')}</p><button class="button" data-action="token" ${controlsDisabled()}>${tr('Crear conexión de asistente','Create assistant connection')}</button>${secret?`<div class="bip-token"><label for="bipToken">${tr('Clave de conexión · cópiala ahora','Connection key · copy it now')}</label><input id="bipToken" type="password" readonly value="${esc(secret)}"><button class="bip-text-button" data-action="copy-token">${tr('Copiar clave','Copy key')}</button><p class="bip-note">MCP URL</p><code>https://dzpyrdxelcgfpmcdojvb.supabase.co/functions/v1/build-in-public-assistant</code></div>`:''}${state?.tokens.filter(token=>token.scope==='assistant').map(token=>`<div class="bip-token-row"><span>${esc(token.prefix)}…</span><button class="bip-text-button" data-revoke="${token.id}">${tr('Revocar','Revoke')}</button></div>`).join('')||''}</section>
    <section class="bip-connection"><h2>${tr('Tu contexto','Your context')}</h2><form id="bipSettings"><label for="bipProject">${tr('Proyecto','Project')}</label><input id="bipProject" maxlength="100" required value="${esc(prefs.project_name)}"><label for="bipVoice">${tr('Cómo quieres contarlo','How you want to tell it')}</label><textarea id="bipVoice" maxlength="1500" rows="3" placeholder="${tr('Mi audiencia, mi tono, lo que quiero compartir…','My audience, tone, and what I want to share…')}">${esc(prefs.voice)}</textarea><label for="bipExcluded">${tr('Excluir palabras o proyectos','Exclude words or projects')}</label><input id="bipExcluded" value="${esc(prefs.excluded_terms.join(', '))}" placeholder="${tr('Separados por comas','Separated by commas')}"><label for="bipCadence">${tr('Buscar ideas automáticamente','Find ideas automatically')}</label><select id="bipCadence">${[['manual',tr('Solo cuando lo pida','Only when I ask')],['daily',tr('Cada día','Daily')],['weekly',tr('Cada semana','Weekly')]].map(([v,t])=>`<option value="${v}" ${prefs.cadence===v?'selected':''}>${t}</option>`).join('')}</select><p class="bip-note">${tr('Mientras FlowSight está abierto. Las ideas siguen en tu equipo hasta que las eliges.','While FlowSight is open. Ideas stay on your device until you choose them.')}</p><button type="submit" class="button" ${controlsDisabled()}>${tr('Guardar preferencias','Save preferences')}</button></form></section>`;}
  function evidenceEditor(){const value=editor.value;return `<button class="bip-back" data-action="back" ${controlsDisabled()}>← ${tr('Historias','Stories')}</button><h2>${tr('¿Qué merece la pena contar?','What is worth sharing?')}</h2><form id="bipEvidenceEdit"><label for="bipTitle">${tr('La idea','The idea')}</label><input id="bipTitle" maxlength="160" required value="${esc(value.title)}"><label for="bipSummary">${tr('Qué hiciste y qué cambió','What you did and what changed')}</label><textarea id="bipSummary" rows="7" maxlength="2000" required>${esc(value.summary)}</textarea><label class="bip-choice bip-confirm"><input id="bipConfirmed" type="checkbox" ${value.confirmed?'checked':''}><span>${tr('He revisado el texto y describe fielmente mi trabajo.','I reviewed the text and it accurately describes my work.')}</span></label><p class="bip-note">${tr('Al guardar, solo este hito pasa a tu espacio privado online.','Saving sends only this highlight to your private online space.')}</p><button class="button button-primary bip-primary" type="submit" ${controlsDisabled()}>${tr('Guardar y seleccionar','Save and select')}</button></form>`;}
  function draftEditor(){const draft={...editor.value,state:editor.dirty?'draft':editor.value.state},locked=['sending','scheduled','published','uncertain'].includes(draft.state);return `<button class="bip-back" data-action="back" ${controlsDisabled()}>← ${tr('Borradores','Drafts')}</button><div class="bip-section-heading"><h2>${channelName[draft.channel]}</h2><span class="bip-state">${editor.dirty?tr('Cambios sin guardar','Unsaved changes'):stateLabel(draft.state)}</span></div><form id="bipDraftEdit"><label for="bipBody">${tr('Tu publicación','Your post')}</label><textarea id="bipBody" rows="6" required maxlength="5000" ${locked?'readonly':''}>${esc(draft.body)}</textarea><p class="bip-counter" id="bipCounter">${contentLength(draft.body,draft.channel)} / ${limits[draft.channel]}</p>${draft.channel==='instagram'?`<div class="bip-visual-editor"><label for="bipVisualTitle">${tr('Título de la imagen','Image title')}</label><input id="bipVisualTitle" maxlength="100" required value="${esc(draft.visual?.title)}" ${locked?'readonly':''}><label for="bipVisualDetail">${tr('Idea que muestra la imagen','What the image explains')}</label><textarea id="bipVisualDetail" rows="3" maxlength="280" required ${locked?'readonly':''}>${esc(draft.visual?.detail)}</textarea><label for="bipVisualFooter">${tr('Firma o proyecto','Signature or project')}</label><input id="bipVisualFooter" maxlength="80" value="${esc(draft.visual?.footer)}" ${locked?'readonly':''}><img class="bip-image" id="bipImage" alt="${tr('Vista previa de la imagen de Instagram','Instagram image preview')}"></div>`:''}<label for="bipDestination">${tr('Cuenta de destino','Destination account')}</label><select id="bipDestination" ${locked?'disabled':''}><option value="">${tr('Elegir cuenta','Choose account')}</option>${(state?.channels||[]).filter(ch=>ch.service===draft.channel).map(ch=>`<option value="${esc(ch.id)}" ${draft.provider_channel_id===ch.id?'selected':''}>${esc(ch.name)}</option>`).join('')}</select><label for="bipSchedule">${tr('Fecha opcional','Optional date')}</label><input id="bipSchedule" type="datetime-local" ${locked?'readonly':''} value="${draft.scheduled_at?new Date(Date.parse(draft.scheduled_at)-new Date(draft.scheduled_at).getTimezoneOffset()*60000).toISOString().slice(0,16):''}"><p class="bip-note">${tr('Sin fecha: siguiente hueco de Buffer. Zona horaria del equipo:','No date: next Buffer queue slot. Device timezone:')} ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>${!locked?`<button type="submit" class="button bip-primary" ${controlsDisabled()}>${tr('Guardar cambios','Save changes')}</button>`:''}</form>
    ${!locked?`<div class="bip-review-actions">${draft.state==='approved'?`<p>${tr('Esta versión está aprobada. Se enviará a la cuenta y fecha que aparecen arriba.','This version is approved. It will be sent to the account and time shown above.')}</p><button class="button button-primary bip-primary" data-action="send" ${controlsDisabled()}>${tr('Enviar a Buffer','Send to Buffer')}</button>`:`<button class="button button-primary bip-primary" data-action="approve" ${controlsDisabled()}>${tr('Aprobar esta versión','Approve this version')}</button>`}<button class="bip-text-button" data-action="copy-draft">${tr('Copiar texto','Copy text')}</button><button class="bip-text-button bip-delete" data-action="delete" ${controlsDisabled()}>${tr('Eliminar borrador','Delete draft')}</button></div>`:`<p class="bip-note">${draft.provider_post_id?`${tr('Identificador en Buffer','Buffer post ID')}: ${esc(draft.provider_post_id)}`:tr('Comprueba la cola de Buffer antes de hacer otro envío.','Check the Buffer queue before sending again.')}</p>`}${draft.error?`<p class="bip-error">${esc(draft.error)}</p>`:''}`;}
  function render(){
    const active=document.activeElement;
    if(root.contains(active)&&active!==root){
      const selector=active.id?`#${CSS.escape(active.id)}`:Object.entries(active.dataset).map(([key,value])=>`[data-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(value)}"]`).join('');
      pendingFocus=selector?{selector,start:active.selectionStart,end:active.selectionEnd}:null;
    }
    if(!root.querySelector('.bip-status'))root.innerHTML='<div class="bip-header-slot"></div><div class="bip-status" role="status" aria-live="polite" aria-atomic="true"></div><div class="bip-content"></div>';
    root.querySelector('.bip-header-slot').innerHTML=header();
    const live=root.querySelector('.bip-status');live.setAttribute('role',error?'alert':'status');live.textContent=error||notice||(busy?tr('Preparando…','Preparing…'):'');
    root.querySelector('.bip-content').innerHTML=`${editor?(editor.type==='evidence'?evidenceEditor():draftEditor()):tab==='stories'?stories():tab==='drafts'?drafts():connections()}${!loaded&&!busy?`<button class="bip-text-button" data-action="refresh">${tr('Reintentar conexión','Retry connection')}</button>`:''}`;
    root.querySelectorAll('form button[type=submit]').forEach(button=>{button.id=`${button.form.id}Submit`;});
    if(editor?.type==='draft'&&editor.value.visual){const img=root.querySelector('#bipImage');if(img)img.src=drawContentImage(editor.value.visual);}
    if(pendingFocus&&!busy){
      const next=root.querySelector(pendingFocus.selector)||root.querySelector('.bip-back')||root.querySelector('.bip-content h2')||root.querySelector('h1');
      if(next){if(!next.matches('button,input,textarea,select,a'))next.tabIndex=-1;next.focus({preventScroll:true});if(pendingFocus.start!=null&&next.setSelectionRange)try{next.setSelectionRange(pendingFocus.start,pendingFocus.end);}catch{/* Not a text input. */}}
      pendingFocus=null;
    }
  }
  function markDraftDirty(){
    if(editor?.type!=='draft')return;
    captureEditor();
    const saved=state.drafts.find(item=>item.id===editor.value.id),value=editor.value;
    const dirty=Boolean(saved&&(value.body!==saved.body||value.provider_channel_id!==saved.provider_channel_id||value.scheduled_at!==saved.scheduled_at||['title','detail','footer'].some(key=>value.visual?.[key]!==saved.visual?.[key])));
    if(Boolean(editor.dirty)!==dirty){editor.dirty=dirty;render();}
  }
  function captureEditor(){
    if(!editor)return;
    if(editor.type==='evidence'){editor.value={...editor.value,title:root.querySelector('#bipTitle')?.value??editor.value.title,summary:root.querySelector('#bipSummary')?.value??editor.value.summary,confirmed:root.querySelector('#bipConfirmed')?.checked??editor.value.confirmed};return;}
    const body=root.querySelector('#bipBody');if(!body)return;
    editor.value={...editor.value,body:body.value,provider_channel_id:root.querySelector('#bipDestination').value||null,scheduled_at:root.querySelector('#bipSchedule').value?new Date(root.querySelector('#bipSchedule').value).toISOString():null};
    if(editor.value.channel==='instagram')editor.value.visual={title:root.querySelector('#bipVisualTitle').value,detail:root.querySelector('#bipVisualDetail').value,footer:root.querySelector('#bipVisualFooter').value};
  }
  async function saveDraft(){
    const draft=editor.value;
    await api({action:'edit',id:draft.id,revision:draft.revision,draft:{body:draft.body,visual:draft.visual,provider_channel_id:draft.provider_channel_id,scheduled_at:draft.scheduled_at}});
    state=await api({action:'studio'});editor.value=state.drafts.find(item=>item.id===draft.id);
    editing.delete(draft.id);editor.dirty=false;
    if(draft.channel==='instagram'&&!editor.value.image_path){await document.fonts.ready;const png=drawContentImage(draft.visual).split(',')[1];await api({action:'image',id:draft.id,revision:editor.value.revision,png});state=await api({action:'studio'});editor.value=state.drafts.find(item=>item.id===draft.id);}
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    captureEditor();
    if(editor?.value.id)editing.set(editor.value.id,structuredClone(editor));
    if(button.dataset.view){tab=button.dataset.view;editor=null;error='';render();const heading=root.querySelector('.bip-content h2')||root.querySelector('h1');heading.tabIndex=-1;heading.focus({preventScroll:true});return;}
    if(button.dataset.local!==undefined){editor={type:'evidence',value:{...local[Number(button.dataset.local)],confirmed:false},localIndex:Number(button.dataset.local)};render();return;}
    if(button.dataset.evidence){editor={type:'evidence',value:{...state.evidence.find(item=>item.id===button.dataset.evidence)}};render();return;}
    if(button.dataset.draft){editor=editing.get(button.dataset.draft)||{type:'draft',value:structuredClone(state.drafts.find(item=>item.id===button.dataset.draft))};render();return;}
    if(button.dataset.revoke){run(()=>api({action:'revoke_token',id:button.dataset.revoke}));return;}
    const action=button.dataset.action;
    if(action==='back'){editor=null;render();return;}
    if(action==='manual'){editor={type:'evidence',manual:true,value:{source_key:`manual:${crypto.randomUUID()}`,title:'',summary:'',occurred_on:new Date().toLocaleDateString('en-CA'),kind:'progress',confirmed:false}};render();return;}
    if(action==='refresh'){refresh();return;}
    if(action==='collect')run(async()=>{notice=tr('Buscando avances en tu historial local…','Finding progress in your local history…');render();const result=await invoke('bip_collect_local',{periodDays:days,locale:getLanguage(),excludedTerms:state?.settings.excluded_terms||[]});local=result.evidence;persistLocal();notice=local.length?tr('Elige una idea para revisarla. Todavía está solo en tu equipo.','Choose an idea to review. It is still only on your device.'):tr('No hay suficiente actividad en este periodo. Puedes añadir un hito manualmente.','Not enough activity in this period. You can add a highlight yourself.');},{reload:false});
    if(action==='generate')run(async()=>{notice=tr('El modelo local está escribiendo. Puede tardar unos minutos.','The local model is writing. This can take a few minutes.');render();const result=await invoke('bip_generate_local',{request:{evidence:selected().slice(0,3),channels:networks,...state.settings,locale:getLanguage()}});await api({action:'generated',drafts:result.drafts,batch_key:crypto.randomUUID()});tab='drafts';notice=tr('Borradores preparados. Revisa el texto y los hechos.','Drafts ready. Review the wording and facts.');});
    if(action==='approve')run(async()=>{await saveDraft();await api({action:'approve',id:editor.value.id,revision:editor.value.revision});state=await api({action:'studio'});editor.value=state.drafts.find(item=>item.id===editor.value.id);});
    if(action==='send')run(async()=>{await saveDraft();if(editor.value.state!=='approved')throw tr('Has cambiado el borrador. Aprueba la nueva versión.','You changed the draft. Approve the new version.');await api({action:'send',id:editor.value.id,revision:editor.value.revision});state=await api({action:'studio'});editor.value=state.drafts.find(item=>item.id===editor.value.id);});
    if(action==='delete')run(async()=>{await api({action:'delete',id:editor.value.id});editing.delete(editor.value.id);editor=null;});
    if(action==='disconnect')run(()=>api({action:'disconnect'}));
    if(action==='token')run(async()=>{secret=(await api({action:'assistant_token'})).token;});
    if(action==='copy-token')navigator.clipboard.writeText(secret).then(()=>{notice=tr('Clave copiada.','Key copied.');render();}).catch(()=>{error=tr('No se pudo copiar.','Could not copy.');render();});
    if(action==='copy-draft')navigator.clipboard.writeText(editor.value.body).then(()=>{notice=tr('Texto copiado.','Text copied.');render();}).catch(()=>{error=tr('No se pudo copiar.','Could not copy.');render();});
  });
  root.addEventListener('change',event=>{
    if(['bipDestination','bipSchedule'].includes(event.target.id))markDraftDirty();
    if(event.target.id==='bipPeriod')days=Number(event.target.value);
    if(event.target.dataset.network){networks=event.target.checked?[...new Set([...networks,event.target.dataset.network])]:networks.filter(item=>item!==event.target.dataset.network);render();}
    if(event.target.dataset.select)run(()=>api({action:'evidence',id:event.target.dataset.select,patch:{state:event.target.checked?'selected':'suggested'}}));
  });
  root.addEventListener('input',event=>{if(event.target.closest('#bipDraftEdit'))markDraftDirty();if(event.target.id==='bipBody')root.querySelector('#bipCounter').textContent=`${contentLength(event.target.value,editor.value.channel)} / ${limits[editor.value.channel]}`;if(event.target.id?.startsWith('bipVisual')){captureEditor();root.querySelector('#bipImage').src=drawContentImage(editor.value.visual);}});
  root.addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;
    const form=event.target;if(!form.reportValidity())return;
    if(form.id==='bipConnect'){const key=root.querySelector('#bipBufferKey').value;root.querySelector('#bipBufferKey').value='';run(()=>api({action:'connect',key}));}
    if(form.id==='bipSettings'){const prefs={project_name:root.querySelector('#bipProject').value,voice:root.querySelector('#bipVoice').value,excluded_terms:root.querySelector('#bipExcluded').value.split(',').map(x=>x.trim()).filter(Boolean),cadence:root.querySelector('#bipCadence').value,locale:getLanguage()==='es'?'es':'en',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};run(()=>api({action:'settings',settings:prefs}));}
    if(form.id==='bipDraftEdit'){captureEditor();run(async()=>{await saveDraft();notice=tr('Cambios guardados.','Changes saved.');});}
    if(form.id==='bipEvidenceEdit'){captureEditor();const item=editor.value;run(async()=>{if(!item.id){const {source_key,title,summary,occurred_on,kind}=item;await api({action:'import',evidence:[{source_key,title,summary,occurred_on,kind}],manual:editor.manual===true});state=await api({action:'studio'});item.id=state.evidence.find(row=>row.source_key===item.source_key)?.id;}await api({action:'evidence',id:item.id,patch:{title:item.title,summary:item.summary,confirmed:item.confirmed,state:'selected'}});if(editor.localIndex!==undefined){local.splice(editor.localIndex,1);persistLocal();}editor=null;});}
  });
  async function checkCadence(){
    if(busy||refreshing||editor)return;
    try{acceptStudio(await api({action:'studio'}));}catch{return;}
    if(state.settings.cadence==='manual')return;
    const prefs=state.settings,key=`bip-ideas-${state.owner_id||'local'}`,previous=Number(localStorage.getItem(key)||0),interval=prefs.cadence==='daily'?86400000:7*86400000;
    if(Date.now()-previous<interval)return;
    try{busy=true;const result=await invoke('bip_collect_local',{periodDays:prefs.cadence==='daily'?1:7,locale:getLanguage(),excludedTerms:prefs.excluded_terms});local=result.evidence;persistLocal();localStorage.setItem(key,String(Date.now()));}catch{/* An offline suggestion must not interrupt focus. */}finally{busy=false;if(!root.hidden)render();}
  }
  document.addEventListener('flowsight:languagechange',()=>{captureEditor();render();});
  cadenceTimer=setInterval(checkCadence,60000);
  render();
  return {refresh,dispose(){clearInterval(cadenceTimer);secret='';}};
}
