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
  let targets={};
  const styles=channel=>state?.styles?.[channel]||[];
  const styleLabel=(channel,id)=>{const item=styles(channel).find(item=>item.id===id);return item?.[getLanguage()==='es'?'es':'en']||id;};
  const api=request=>invoke('bip_cloud',{request:{...request,...(state?.owner_id&&request.action!=='studio'?{expected_owner:state.owner_id}:{})}});
  const localKey=()=>`bip-local-ideas-${state.owner_id}`;
  function persistLocal(){if(state)try{localStorage.setItem(localKey(),JSON.stringify({evidence:local,at:Date.now()}));}catch{/* Storage may be full. */}}
  function acceptStudio(next){
    if(state?.owner_id!==next.owner_id){
      editor=null;secret='';local=[];targets={};editing.clear();
      try{const cached=JSON.parse(localStorage.getItem(`bip-local-ideas-${next.owner_id}`)||'null');if(cached&&Date.now()-cached.at<30*86400000)local=cached.evidence;}catch{/* Invalid cache is ignored. */}
    }
    state=next;loaded=true;
    for(const channel of Object.keys(channelName)){const profile=state.profiles?.find(item=>item.channel===channel);if(!targets[channel])targets[channel]={style:profile?.style||styles(channel)[0]?.id,profile_id:profile?.id||null};}
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
  function header(){return `<header class="bip-heading"><h1>Build in public</h1><p>${tr('Tu trabajo. Buenas ideas. Un encargo para tu IA.','Your work. Useful ideas. A brief for your AI.')}</p></header><nav class="bip-tabs" aria-label="Build in public">${[['stories',tr('Ideas','Ideas')],['prompts',tr('Prompts','Prompts')],['drafts',tr('Contenido','Content')],['connections',tr('Ajustes','Settings')]].map(([value,label])=>`<button type="button" data-view="${value}" aria-current="${tab===value?'page':'false'}" ${controlsDisabled()}>${label}${value==='drafts'&&state?.drafts.length?` <span>${state.drafts.length}</span>`:''}</button>`).join('')}</nav>`;}
  function stories(){return `<div class="bip-period"><label for="bipPeriod">${tr('Tu trabajo de','Your work from')}</label><select id="bipPeriod" ${controlsDisabled()}>${[[1,tr('Hoy','Today')],[7,tr('Los últimos 7 días','The last 7 days')],[30,tr('Los últimos 30 días','The last 30 days')]].map(([n,label])=>`<option value="${n}" ${days===n?'selected':''}>${label}</option>`).join('')}</select></div>
    <button class="button button-primary bip-primary" data-action="collect" ${controlsDisabled()}>${tr('Buscar historias en mi trabajo','Find stories in my work')}</button><p class="bip-note">${tr('Se analiza en tu equipo. Tú eliges qué guardar y compartir.','Analyzed on your device. You choose what to save and share.')}</p>
    ${local.length?`<section class="bip-story-list"><h2>${tr('Posibles historias de tu trabajo','Possible stories from your work')}</h2><p class="bip-note">${tr('Son observaciones. Revisa el resultado antes de convertirlo en un logro.','These are observations. Review the outcome before presenting it as an achievement.')}</p>${local.map((item,index)=>`<button class="bip-story" data-local="${index}" ${controlsDisabled()}><span class="bip-story-date">${dateLabel(item.occurred_on)}</span><strong>${esc(item.title)}</strong><span class="bip-story-action">${tr('Revisar historia','Review story')} <span aria-hidden="true">→</span></span></button>`).join('')}</section>`:''}
    <section class="bip-story-list"><div class="bip-section-heading"><h2>${tr('Tus ideas seleccionables','Your saved ideas')}</h2><button class="bip-text-button" data-action="manual" ${controlsDisabled()}>${tr('Añadir hito','Add highlight')}</button></div>${state?.evidence.filter(item=>item.state!=='dismissed').length?state.evidence.filter(item=>item.state!=='dismissed').map(item=>`<article class="bip-saved-story"><label class="bip-choice"><input type="checkbox" data-select="${item.id}" ${item.state==='selected'?'checked':''} ${controlsDisabled()}><span><strong>${esc(item.title)}</strong><small>${dateLabel(item.occurred_on)} · ${item.confirmed?tr('Confirmado por ti','Confirmed by you'):tr('Pendiente de confirmar','Awaiting confirmation')}</small></span></label><button class="bip-text-button" data-evidence="${item.id}" ${controlsDisabled()}>${tr('Editar','Edit')}</button></article>`).join(''):`<div class="bip-empty"><h3>${tr('Empieza por un avance concreto','Start with one concrete step')}</h3><p>${tr('Una mejora que has hecho, una decisión o algo que acabas de aprender. Busca en tu actividad o añádelo tú.','An improvement, a decision, or something you learned. Find it in your activity or add it yourself.')}</p></div>`}</section>
    ${selected().length?`<section class="bip-generation"><h2>${tr('Cómo quieres contarlo','How you want to tell it')}</h2><div class="bip-targets">${Object.entries(channelName).map(([channel,name])=>`<div class="bip-target"><label class="bip-choice"><input type="checkbox" data-network="${channel}" ${networks.includes(channel)?'checked':''} ${controlsDisabled()}><span>${name}</span></label>${networks.includes(channel)?`<label for="bipStyle-${channel}">${tr('Estilo','Style')}</label><select id="bipStyle-${channel}" data-style="${channel}" ${controlsDisabled()}>${styles(channel).map(style=>`<option value="${style.id}" ${targets[channel]?.style===style.id?'selected':''}>${esc(style[getLanguage()==='es'?'es':'en'])}</option>`).join('')}</select><label for="bipProfile-${channel}">${tr('Perfil','Profile')}</label><select id="bipProfile-${channel}" data-profile="${channel}" ${controlsDisabled()}><option value="">${tr('Lo elegiré con mi IA','I will choose with my AI')}</option>${(state?.profiles||[]).filter(profile=>profile.channel===channel).map(profile=>`<option value="${profile.id}" ${targets[channel]?.profile_id===profile.id?'selected':''}>${esc(profile.name)} · ${esc(profile.handle)}</option>`).join('')}</select>`:''}</div>`).join('')}</div><button class="button button-primary bip-primary" data-action="generate" ${busy||!networks.length||selected().length>3?'disabled':''}>${tr('Preparar prompts para mi IA','Prepare prompts for my AI')}</button><p class="bip-note">${selected().length>3?tr('Selecciona un máximo de 3 ideas por encargo.','Select up to 3 ideas per brief.'):tr('Cada prompt incluye tu trabajo, tu perfil y el estilo elegido. Tu IA se encarga de desarrollar el contenido.','Each prompt includes your work, profile and chosen style. Your AI develops the content.')}</p></section>`:''}`;}
  function prompts(){return state?.briefs?.length?`<p class="bip-note">${tr('Copia un prompt o pide a Codex que recoja tus encargos de FlowSight.','Copy a prompt or ask Codex to pick up your FlowSight briefs.')}</p>${state.briefs.map(brief=>`<button class="bip-draft-row" data-brief="${brief.id}"><div class="bip-draft-meta"><strong>${channelName[brief.channel]}</strong><span>${esc(styleLabel(brief.channel,brief.style))}</span></div><p>${esc(state.evidence.find(item=>item.id===brief.evidence_id)?.title||tr('Idea de trabajo','Work idea'))}</p><small>${(state.drafts||[]).some(draft=>draft.brief_id===brief.id)?tr('Tu IA ha devuelto contenido','Your AI returned content'):tr('Listo para tu IA','Ready for your AI')}</small></button>`).join('')}`:`<div class="bip-empty"><h2>${tr('Un buen prompt empieza con hechos','A useful prompt starts with evidence')}</h2><p>${tr('Elige una idea, una red y un estilo. FlowSight preparará el contexto para que tu IA haga el resto.','Choose an idea, network and style. FlowSight prepares the context for your AI.')}</p><button class="button" data-view="stories">${tr('Elegir una idea','Choose an idea')}</button></div>`;}
  function briefEditor(){const brief=editor.value;return `<button class="bip-back" data-action="back">← ${tr('Prompts','Prompts')}</button><div class="bip-section-heading"><h2>${channelName[brief.channel]}</h2><span class="bip-state">${esc(styleLabel(brief.channel,brief.style))}</span></div><p class="bip-note">${tr('Puedes ajustar el encargo antes de pasarlo a tu IA. Se guarda en tu espacio privado.','Adjust the brief before handing it to your AI. It stays in your private space.')}</p><form id="bipBriefEdit"><label for="bipPrompt">${tr('Prompt con tu contexto','Prompt with your context')}</label><textarea id="bipPrompt" rows="15" maxlength="14000" required>${esc(brief.prompt)}</textarea><button class="button bip-primary" type="submit" ${controlsDisabled()}>${tr('Guardar prompt','Save prompt')}</button></form><button class="button button-primary bip-primary" data-action="copy-brief">${tr('Copiar para mi IA','Copy for my AI')}</button><p class="bip-note">${tr('Con el MCP conectado, dile a Codex: «Recoge mis encargos de FlowSight y prepara las propuestas».','With MCP connected, ask Codex: “Pick up my FlowSight briefs and prepare the proposals.”')}</p><button class="bip-text-button" data-action="delete-brief">${tr('Eliminar encargo','Delete brief')}</button>`;}
  function drafts(){return state?.drafts.length?`<div class="bip-draft-list">${state.drafts.map(draft=>`<button class="bip-draft-row" data-draft="${draft.id}" ${controlsDisabled()}><div class="bip-draft-meta"><strong>${channelName[draft.channel]}</strong><span data-state="${draft.state}">${stateLabel(draft.state)}</span></div><p>${esc(draft.body.slice(0,180))}${draft.body.length>180?'…':''}</p><small>${draft.engine==='local'?tr('IA local','Local AI'):draft.engine==='assistant'?'Codex / MCP':tr('Escrito por ti','Written by you')} · ${tr('Versión','Version')} ${draft.revision}</small></button>`).join('')}</div>`:`<div class="bip-empty"><h2>${tr('Aquí vuelve el contenido de tu IA','Your AI content returns here')}</h2><p>${tr('Prepara un prompt y pídele a tu asistente que desarrolle la propuesta y la guarde en FlowSight.','Prepare a prompt, then ask your assistant to develop the proposal and save it in FlowSight.')}</p><button class="button" data-view="stories">${tr('Elegir una historia','Choose a story')}</button></div>`;}
  function connections(){const prefs=state?.settings||{project_name:'FlowSight',voice:'',excluded_terms:[],cadence:'manual'};return `<section class="bip-connection"><h2>${tr('Mis perfiles sociales','My social profiles')}</h2><p>${tr('Añade tus perfiles aquí para dar contexto a los prompts. No necesitas conectarlos a Buffer.','Add your profiles here to give prompts context. No Buffer connection is needed.')}</p>${(state?.profiles||[]).map(profile=>`<div class="bip-profile-row"><div><strong>${channelName[profile.channel]} · ${esc(profile.name)}</strong><small>${esc(profile.handle)} · ${esc(styleLabel(profile.channel,profile.style))}</small></div><button class="bip-text-button" data-delete-profile="${profile.id}">${tr('Quitar','Remove')}</button></div>`).join('')}<form id="bipProfileForm"><label for="bipProfileNetwork">${tr('Red social','Social network')}</label><select id="bipProfileNetwork">${Object.entries(channelName).map(([channel,name])=>`<option value="${channel}">${name}</option>`).join('')}</select><label for="bipProfileName">${tr('Nombre del perfil','Profile name')}</label><input id="bipProfileName" maxlength="100" required placeholder="${tr('Mi perfil personal','My personal profile')}"><label for="bipProfileHandle">${tr('Usuario o enlace del perfil','Username or profile link')}</label><input id="bipProfileHandle" maxlength="150" required placeholder="@usuario"><label for="bipProfileStyle">${tr('Estilo habitual','Usual style')}</label><select id="bipProfileStyle">${styles('linkedin').map(style=>`<option value="${style.id}">${esc(style[getLanguage()==='es'?'es':'en'])}</option>`).join('')}</select><button class="button" type="submit" ${controlsDisabled()}>${tr('Añadir perfil','Add profile')}</button></form></section>
    <section class="bip-connection"><h2>Codex ${tr('y otros asistentes','and other assistants')}</h2><p>${tr('Tu IA puede recoger ideas, perfiles y prompts, y devolver sus propuestas aquí. La publicación se gestiona después con tu asistente y sus herramientas.','Your AI can pick up ideas, profiles and prompts, then return proposals here. Publishing is handled later with your assistant and its tools.')}</p><button class="button" data-action="token" ${controlsDisabled()}>${tr('Crear conexión de asistente','Create assistant connection')}</button>${secret?`<div class="bip-token"><label for="bipToken">${tr('Clave de conexión · cópiala ahora','Connection key · copy it now')}</label><input id="bipToken" type="password" readonly value="${esc(secret)}"><button class="bip-text-button" data-action="copy-token">${tr('Copiar clave','Copy key')}</button><p class="bip-note">MCP URL</p><code>https://dzpyrdxelcgfpmcdojvb.supabase.co/functions/v1/build-in-public-assistant</code></div>`:''}${state?.tokens.filter(token=>token.scope==='assistant').map(token=>`<div class="bip-token-row"><span>${esc(token.prefix)}…</span><button class="bip-text-button" data-revoke="${token.id}">${tr('Revocar','Revoke')}</button></div>`).join('')||''}</section>
    <section class="bip-connection"><h2>${tr('Tu contexto','Your context')}</h2><form id="bipSettings"><label for="bipProject">${tr('Proyecto','Project')}</label><input id="bipProject" maxlength="100" required value="${esc(prefs.project_name)}"><label for="bipVoice">${tr('Cómo quieres contarlo','How you want to tell it')}</label><textarea id="bipVoice" maxlength="1500" rows="3" placeholder="${tr('Mi audiencia, mi tono, lo que quiero compartir…','My audience, tone, and what I want to share…')}">${esc(prefs.voice)}</textarea><label for="bipExcluded">${tr('Excluir palabras o proyectos','Exclude words or projects')}</label><input id="bipExcluded" value="${esc(prefs.excluded_terms.join(', '))}" placeholder="${tr('Separados por comas','Separated by commas')}"><label for="bipCadence">${tr('Buscar ideas automáticamente','Find ideas automatically')}</label><select id="bipCadence">${[['manual',tr('Solo cuando lo pida','Only when I ask')],['daily',tr('Cada día','Daily')],['weekly',tr('Cada semana','Weekly')]].map(([v,t])=>`<option value="${v}" ${prefs.cadence===v?'selected':''}>${t}</option>`).join('')}</select><p class="bip-note">${tr('Mientras FlowSight está abierto. Las ideas siguen en tu equipo hasta que las eliges.','While FlowSight is open. Ideas stay on your device until you choose them.')}</p><button type="submit" class="button" ${controlsDisabled()}>${tr('Guardar preferencias','Save preferences')}</button></form></section>`;}
  function evidenceEditor(){const value=editor.value;return `<button class="bip-back" data-action="back" ${controlsDisabled()}>← ${tr('Historias','Stories')}</button><h2>${tr('¿Qué merece la pena contar?','What is worth sharing?')}</h2><form id="bipEvidenceEdit"><label for="bipTitle">${tr('La idea','The idea')}</label><input id="bipTitle" maxlength="160" required value="${esc(value.title)}"><label for="bipSummary">${tr('Qué hiciste y qué cambió','What you did and what changed')}</label><textarea id="bipSummary" rows="7" maxlength="2000" required>${esc(value.summary)}</textarea><label class="bip-choice bip-confirm"><input id="bipConfirmed" type="checkbox" ${value.confirmed?'checked':''}><span>${tr('He revisado el texto y describe fielmente mi trabajo.','I reviewed the text and it accurately describes my work.')}</span></label><p class="bip-note">${tr('Al guardar, solo este hito pasa a tu espacio privado online.','Saving sends only this highlight to your private online space.')}</p><button class="button button-primary bip-primary" type="submit" ${controlsDisabled()}>${tr('Guardar y seleccionar','Save and select')}</button></form>`;}
  function draftEditor(){const draft=editor.value;return `<button class="bip-back" data-action="back">← ${tr('Contenido','Content')}</button><div class="bip-section-heading"><h2>${channelName[draft.channel]}</h2><span class="bip-state">${editor.dirty?tr('Cambios sin guardar','Unsaved changes'):tr('Propuesta de tu IA','AI proposal')}</span></div><form id="bipDraftEdit"><label for="bipBody">${tr('Texto de la propuesta','Proposed text')}</label><textarea id="bipBody" rows="9" required maxlength="5000">${esc(draft.body)}</textarea><p class="bip-counter" id="bipCounter">${contentLength(draft.body,draft.channel)} / ${limits[draft.channel]}</p><label for="bipDetails">${tr('Desarrollo, hilo o guion','Full thread, script or plan')}</label><textarea id="bipDetails" rows="7" maxlength="20000" placeholder="${tr('Tu IA puede dejar aquí el contenido completo.','Your AI can leave the full content here.')}">${esc(draft.details||'')}</textarea>${draft.visual?`<div class="bip-visual-editor"><h3>${tr('Boceto visual','Visual outline')}</h3><p class="bip-note">${tr('Es un punto de partida para tu IA creativa.','A starting point for your creative AI.')}</p><label for="bipVisualTitle">${tr('Título','Title')}</label><input id="bipVisualTitle" maxlength="100" value="${esc(draft.visual.title)}"><label for="bipVisualDetail">${tr('Idea visual','Visual idea')}</label><textarea id="bipVisualDetail" rows="3" maxlength="280">${esc(draft.visual.detail)}</textarea><label for="bipVisualFooter">${tr('Firma','Signature')}</label><input id="bipVisualFooter" maxlength="80" value="${esc(draft.visual.footer)}"><img class="bip-image" id="bipImage" alt="${tr('Boceto de imagen para Instagram','Instagram image outline')}"></div>`:''}<button type="submit" class="button bip-primary" ${controlsDisabled()}>${tr('Guardar cambios','Save changes')}</button></form><div class="bip-review-actions"><button class="button button-primary bip-primary" data-action="copy-draft">${tr('Copiar contenido','Copy content')}</button><p class="bip-note">${tr('Continúa con tu asistente para terminar el contenido y decidir cómo publicarlo.','Continue with your assistant to finish the content and decide how to publish it.')}</p><button class="bip-text-button" data-action="delete">${tr('Eliminar propuesta','Delete proposal')}</button></div>`;}
  function render(){
    const active=document.activeElement;
    if(root.contains(active)&&active!==root){
      const selector=active.id?`#${CSS.escape(active.id)}`:Object.entries(active.dataset).map(([key,value])=>`[data-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(value)}"]`).join('');
      pendingFocus=selector?{selector,start:active.selectionStart,end:active.selectionEnd}:null;
    }
    if(!root.querySelector('.bip-status'))root.innerHTML='<div class="bip-header-slot"></div><div class="bip-status" role="status" aria-live="polite" aria-atomic="true"></div><div class="bip-content"></div>';
    root.querySelector('.bip-header-slot').innerHTML=header();
    const live=root.querySelector('.bip-status');live.setAttribute('role',error?'alert':'status');live.textContent=error||notice||(busy?tr('Preparando…','Preparing…'):'');
    root.querySelector('.bip-content').innerHTML=`${editor?(editor.type==='evidence'?evidenceEditor():editor.type==='brief'?briefEditor():draftEditor()):tab==='stories'?stories():tab==='prompts'?prompts():tab==='drafts'?drafts():connections()}${!loaded&&!busy?`<button class="bip-text-button" data-action="refresh">${tr('Reintentar conexión','Retry connection')}</button>`:''}`;
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
    const dirty=Boolean(saved&&(value.body!==saved.body||value.details!==saved.details||value.provider_channel_id!==saved.provider_channel_id||value.scheduled_at!==saved.scheduled_at||['title','detail','footer'].some(key=>value.visual?.[key]!==saved.visual?.[key])));
    if(Boolean(editor.dirty)!==dirty){editor.dirty=dirty;render();}
  }
  function captureEditor(){
    if(!editor)return;
    if(editor.type==='brief'){editor.value.prompt=root.querySelector('#bipPrompt')?.value??editor.value.prompt;return;}
    if(editor.type==='evidence'){editor.value={...editor.value,title:root.querySelector('#bipTitle')?.value??editor.value.title,summary:root.querySelector('#bipSummary')?.value??editor.value.summary,confirmed:root.querySelector('#bipConfirmed')?.checked??editor.value.confirmed};return;}
    const body=root.querySelector('#bipBody');if(!body)return;
    editor.value={...editor.value,body:body.value,details:root.querySelector('#bipDetails')?.value||'',provider_channel_id:null,scheduled_at:null};
    if(editor.value.visual&&root.querySelector('#bipVisualTitle'))editor.value.visual={title:root.querySelector('#bipVisualTitle').value,detail:root.querySelector('#bipVisualDetail').value,footer:root.querySelector('#bipVisualFooter').value};
  }
  async function saveDraft(){
    const draft=editor.value;
    await api({action:'edit',id:draft.id,revision:draft.revision,draft:{body:draft.body,details:draft.details||'',visual:draft.visual,provider_channel_id:draft.provider_channel_id,scheduled_at:draft.scheduled_at}});
    state=await api({action:'studio'});editor.value=state.drafts.find(item=>item.id===draft.id);
    editing.delete(draft.id);editor.dirty=false;
    if(draft.channel==='instagram'&&draft.visual&&!editor.value.image_path){await document.fonts.ready;const png=drawContentImage(draft.visual).split(',')[1];await api({action:'image',id:draft.id,revision:editor.value.revision,png});state=await api({action:'studio'});editor.value=state.drafts.find(item=>item.id===draft.id);}
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    captureEditor();
    if(editor?.value.id)editing.set(editor.value.id,structuredClone(editor));
    if(button.dataset.view){tab=button.dataset.view;editor=null;error='';render();const heading=root.querySelector('.bip-content h2')||root.querySelector('h1');heading.tabIndex=-1;heading.focus({preventScroll:true});return;}
    if(button.dataset.local!==undefined){editor={type:'evidence',value:{...local[Number(button.dataset.local)],confirmed:false},localIndex:Number(button.dataset.local)};render();return;}
    if(button.dataset.evidence){editor={type:'evidence',value:{...state.evidence.find(item=>item.id===button.dataset.evidence)}};render();return;}
    if(button.dataset.draft){editor=editing.get(button.dataset.draft)||{type:'draft',value:structuredClone(state.drafts.find(item=>item.id===button.dataset.draft))};render();return;}
    if(button.dataset.brief){editor=editing.get(button.dataset.brief)||{type:'brief',value:structuredClone(state.briefs.find(item=>item.id===button.dataset.brief))};render();return;}
    if(button.dataset.deleteProfile){run(async()=>{await api({action:'delete_profile',id:button.dataset.deleteProfile});for(const target of Object.values(targets))if(target.profile_id===button.dataset.deleteProfile)target.profile_id=null;});return;}
    if(button.dataset.revoke){run(()=>api({action:'revoke_token',id:button.dataset.revoke}));return;}
    const action=button.dataset.action;
    if(action==='back'){editor=null;render();return;}
    if(action==='manual'){editor={type:'evidence',manual:true,value:{source_key:`manual:${crypto.randomUUID()}`,title:'',summary:'',occurred_on:new Date().toLocaleDateString('en-CA'),kind:'progress',confirmed:false}};render();return;}
    if(action==='refresh'){refresh();return;}
    if(action==='collect')run(async()=>{notice=tr('Buscando avances en tu historial local…','Finding progress in your local history…');render();const result=await invoke('bip_collect_local',{periodDays:days,locale:getLanguage(),excludedTerms:state?.settings.excluded_terms||[]});local=result.evidence;persistLocal();notice=local.length?tr('Elige una idea para revisarla. Todavía está solo en tu equipo.','Choose an idea to review. It is still only on your device.'):tr('No hay suficiente actividad en este periodo. Puedes añadir un hito manualmente.','Not enough activity in this period. You can add a highlight yourself.');},{reload:false});
    if(action==='generate')run(async()=>{await api({action:'briefs',request:{batch_key:crypto.randomUUID(),evidence_ids:selected().slice(0,3).map(item=>item.id),targets:networks.map(channel=>({channel,...targets[channel]}))}});tab='prompts';notice=tr('Encargos listos. Tu IA ya puede recogerlos.','Briefs ready. Your AI can pick them up now.');});
    if(action==='copy-brief')navigator.clipboard.writeText(editor.value.prompt).then(()=>{notice=tr('Prompt copiado. Pégalo en tu IA.','Prompt copied. Paste it into your AI.');render();}).catch(()=>{error=tr('Selecciona el texto del prompt para copiarlo.','Select the prompt text to copy it.');render();});
    if(action==='delete-brief')run(async()=>{await api({action:'delete_brief',id:editor.value.id});editing.delete(editor.value.id);editor=null;});
    if(action==='delete')run(async()=>{await api({action:'delete',id:editor.value.id});editing.delete(editor.value.id);editor=null;});
    if(action==='token')run(async()=>{secret=(await api({action:'assistant_token'})).token;});
    if(action==='copy-token')navigator.clipboard.writeText(secret).then(()=>{notice=tr('Clave copiada.','Key copied.');render();}).catch(()=>{error=tr('No se pudo copiar.','Could not copy.');render();});
    if(action==='copy-draft')navigator.clipboard.writeText([editor.value.body,editor.value.details].filter(Boolean).join('\n\n')).then(()=>{notice=tr('Texto copiado.','Text copied.');render();}).catch(()=>{error=tr('No se pudo copiar.','Could not copy.');render();});
  });
  root.addEventListener('change',event=>{
    if(event.target.dataset.style)targets[event.target.dataset.style].style=event.target.value;
    if(event.target.dataset.profile)targets[event.target.dataset.profile].profile_id=event.target.value||null;
    if(event.target.id==='bipProfileNetwork')root.querySelector('#bipProfileStyle').innerHTML=styles(event.target.value).map(style=>`<option value="${style.id}">${esc(style[getLanguage()==='es'?'es':'en'])}</option>`).join('');
    if(event.target.id==='bipPeriod')days=Number(event.target.value);
    if(event.target.dataset.network){networks=event.target.checked?[...new Set([...networks,event.target.dataset.network])]:networks.filter(item=>item!==event.target.dataset.network);render();}
    if(event.target.dataset.select)run(()=>api({action:'evidence',id:event.target.dataset.select,patch:{state:event.target.checked?'selected':'suggested'}}));
  });
  root.addEventListener('input',event=>{if(event.target.closest('#bipDraftEdit'))markDraftDirty();if(event.target.id==='bipBody')root.querySelector('#bipCounter').textContent=`${contentLength(event.target.value,editor.value.channel)} / ${limits[editor.value.channel]}`;if(event.target.id?.startsWith('bipVisual')){captureEditor();root.querySelector('#bipImage').src=drawContentImage(editor.value.visual);}});
  root.addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;
    const form=event.target;if(!form.reportValidity())return;
    if(form.id==='bipProfileForm'){const profile={channel:root.querySelector('#bipProfileNetwork').value,name:root.querySelector('#bipProfileName').value,handle:root.querySelector('#bipProfileHandle').value,style:root.querySelector('#bipProfileStyle').value};run(async()=>{await api({action:'profile',profile});notice=tr('Perfil añadido a FlowSight.','Profile added to FlowSight.');});}
    if(form.id==='bipBriefEdit'){captureEditor();run(async()=>{const id=editor.value.id;await api({action:'edit_brief',id,revision:editor.value.revision,prompt:editor.value.prompt});state=await api({action:'studio'});editor.value=state.briefs.find(item=>item.id===id);editing.delete(id);notice=tr('Prompt guardado.','Prompt saved.');});}
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
