import assert from 'node:assert/strict'
import { redact, textLength, validateDraft, evidenceSchema, settingsSchema } from './bip_domain.ts'

Deno.test('content privacy removes keys, email, private URLs, paths and literal excluded terms',()=>{
  const clean=redact('alice@example.com https://private.example/a sk-1234567890123456789 C:\\Users\\secret private[client]',['private[client]'])
  for(const token of ['alice@','private.example','123456789012','Users','private[client]'])assert.ok(!clean.includes(token))
})
Deno.test('social limits handle URLs and non-Latin weighted X characters',()=>{
  assert.equal(textLength('Visit https://example.com/very/long/url','x'),29)
  assert.equal(textLength('你好','x'),4)
  assert.equal(validateDraft({body:'a'.repeat(281),channel:'x',visual:null})?.includes('280'),true)
  assert.equal(validateDraft({body:'Reel caption',channel:'instagram',visual:null}),null)
  assert.equal(validateDraft({body:'Caption',channel:'instagram',visual:{title:'Title',detail:'Evidence',footer:'FlowSight'}}),null)
})
Deno.test('evidence does not accept forged ownership or completion metadata',()=>{
  assert.equal(evidenceSchema.safeParse({source_key:'1',title:'Example',summary:'Example work',occurred_on:'2026-10-12',kind:'progress',user_id:'other'}).success,false)
  assert.equal(settingsSchema.safeParse({project_name:'P',locale:'es',timezone:'Not/AZone',cadence:'manual',excluded_terms:[],voice:''}).success,false)
})
