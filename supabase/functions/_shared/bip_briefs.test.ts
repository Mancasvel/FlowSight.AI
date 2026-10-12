import assert from 'node:assert/strict'
import { buildPrompt, STYLES } from './bip_briefs.ts'
import type { Evidence, Settings } from './bip_domain.ts'
const evidence={id:'example',title:'Music follows a focus pause',summary:'YouTube pauses and resumes with the session. No outcome metrics were measured.',confirmed:false,occurred_on:'2026-10-12'} as Evidence
const settings={project_name:'FlowSight.AI',locale:'es',voice:'Direct, concrete language'} as Settings
Deno.test('prompt styles differ by network and preserve unconfirmed work',()=>{
 const short=buildPrompt(evidence,settings,'x','short'),thread=buildPrompt(evidence,settings,'x','thread')
 assert.ok(short.includes('Una idea concreta'));assert.ok(thread.includes('Hilo de 3 a 5'));assert.notEqual(short,thread)
 assert.ok(short.includes('PENDIENTE DE CONFIRMACIÓN'));assert.ok(short.includes(evidence.summary));assert.ok(short.includes('FlowSight prepara este encargo; no publica'))
 assert.throws(()=>buildPrompt(evidence,settings,'linkedin','reel'))
})
Deno.test('profiles supply the prompt destination without a publishing provider',()=>{
 const prompt=buildPrompt({...evidence,confirmed:true},settings,'instagram','carousel',{id:'profile',channel:'instagram',name:'Personal',handle:'@builder',style:'carousel'})
 assert.ok(prompt.includes('@builder'));assert.ok(prompt.includes('5 láminas'));assert.ok(prompt.includes('REVISADA POR EL USUARIO'))
 assert.equal(Object.keys(STYLES).length,3)
})
