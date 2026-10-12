import assert from 'node:assert/strict'
import { redact, textLength, validateDraft, evidenceSchema, settingsSchema } from './bip_domain.ts'
import { bufferPostInput, bufferQuery, BufferError } from './bip_buffer.ts'
import type { Draft } from './bip_domain.ts'

Deno.test('content privacy removes keys, email, private URLs, paths and literal excluded terms',()=>{
  const clean=redact('alice@example.com https://private.example/a sk-1234567890123456789 C:\\Users\\secret private[client]',['private[client]'])
  for(const token of ['alice@','private.example','123456789012','Users','private[client]'])assert.ok(!clean.includes(token))
})
Deno.test('social limits handle URLs and non-Latin weighted X characters',()=>{
  assert.equal(textLength('Visit https://example.com/very/long/url','x'),29)
  assert.equal(textLength('你好','x'),4)
  assert.equal(validateDraft({body:'a'.repeat(281),channel:'x',visual:null})?.includes('280'),true)
  assert.ok(validateDraft({body:'Caption',channel:'instagram',visual:null}))
  assert.equal(validateDraft({body:'Caption',channel:'instagram',visual:{title:'Title',detail:'Evidence',footer:'FlowSight'}}),null)
})
Deno.test('evidence does not accept forged ownership or completion metadata',()=>{
  assert.equal(evidenceSchema.safeParse({source_key:'1',title:'Example',summary:'Example work',occurred_on:'2026-10-12',kind:'progress',user_id:'other'}).success,false)
  assert.equal(settingsSchema.safeParse({project_name:'P',locale:'es',timezone:'Not/AZone',cadence:'manual',excluded_terms:[],voice:''}).success,false)
})
Deno.test('Buffer uses the approved destination, queue mode and required media fields',()=>{
  const draft={provider_channel_id:'channel-owned',body:'Reviewed text',scheduled_at:null,channel:'instagram',engine:'local'} as Draft
  const input=bufferPostInput(draft,'https://signed.example/image.png')
  assert.equal(input.channelId,'channel-owned');assert.equal(input.mode,'addToQueue');assert.equal(input.needsApproval,false)
  assert.deepEqual(input.assets,[{image:{url:'https://signed.example/image.png'}}])
  assert.equal(input.metadata?.instagram.shouldShareToFeed,true)
  assert.equal(bufferPostInput({...draft,scheduled_at:'2026-11-01T10:00:00Z'}).mode,'customScheduled')
})
Deno.test('provider transport uncertainty is never reported as a definite rejection',async()=>{
  await assert.rejects(()=>bufferQuery('test-key','query {}',{},async()=>{throw new Error('timeout')}),e=>e instanceof BufferError&&e.uncertain)
  await assert.rejects(()=>bufferQuery('test-key','query {}',{},async()=>new Response('down',{status:503})),e=>e instanceof BufferError&&e.uncertain)
  await assert.rejects(()=>bufferQuery('test-key','query {}',{},async()=>new Response('{}',{status:401})),e=>e instanceof BufferError&&!e.uncertain)
  await assert.rejects(()=>bufferQuery('test-key','mutation {}',{},async()=>Response.json({data:{createPost:null},errors:[{message:'Resolver failed after acceptance'}]})),e=>e instanceof BufferError&&e.uncertain)
  assert.deepEqual(await bufferQuery('test-key','query {}',{},async()=>Response.json({data:{ok:true}})),{ok:true})
})
