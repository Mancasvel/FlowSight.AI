import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { z } from 'npm:zod@4.1.12'
import { evidenceSchema, generatedDraftSchema, redact, settingsSchema, validateDraft, type Draft, type Evidence, type Settings, type Studio } from './bip_domain.ts'

export class StudioError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function check(error: { message: string; code?: string } | null) {
  if (error) throw new StudioError(503, error.code === '42P01' || error.code === 'PGRST205'
    ? 'La base de datos de Build in public todavía no está instalada.' : 'No se ha podido guardar el cambio. Inténtalo de nuevo.')
}
const DEFAULTS: Settings = { project_name: 'Mi proyecto', locale: 'es', timezone: 'Europe/Madrid', cadence: 'manual', excluded_terms: [], voice: '', last_collected_at: null }
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export function studioService(db: SupabaseClient, userId: string) {
  const owned = (table: string) => db.from(table).select('*').eq('user_id', userId)
  async function settings(): Promise<Settings> {
    const { data, error } = await owned('bip_settings').maybeSingle(); check(error)
    return data ?? DEFAULTS
  }
  async function evidence(id: string): Promise<Evidence> {
    const { data, error } = await owned('bip_evidence').eq('id', id).maybeSingle(); check(error)
    if (!data) throw new StudioError(404, 'No se encuentra este hito.')
    return data
  }
  async function draft(id: string): Promise<Draft> {
    const { data, error } = await owned('bip_drafts').eq('id', id).maybeSingle(); check(error)
    if (!data) throw new StudioError(404, 'No se encuentra este borrador.')
    return data
  }
  async function studio(): Promise<Studio> {
    const results = await Promise.all([
      settings(), owned('bip_evidence').order('occurred_on', { ascending: false }).limit(100),
      owned('bip_drafts').order('created_at', { ascending: false }).limit(100),
      db.from('bip_connections').select('channels').eq('user_id', userId).maybeSingle(),
      db.from('bip_tokens').select('id,prefix,scope,last_used_at,expires_at').eq('user_id', userId).is('revoked_at', null).gt('expires_at', new Date().toISOString()),
      db.from('bip_jobs').select('id,kind,state,error,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(12),
    ])
    for (const r of results.slice(1)) check((r as { error: null }).error)
    return { owner_id: userId, settings: results[0], evidence: results[1].data ?? [], drafts: results[2].data ?? [], channels: results[3].data?.channels ?? [], tokens: results[4].data ?? [], jobs: results[5].data ?? [] }
  }
  async function saveSettings(input: unknown) {
    const value = settingsSchema.parse(input)
    const { error } = await db.from('bip_settings').upsert({ ...value, user_id: userId }); check(error)
  }
  async function importEvidence(input: unknown, manual = false) {
    const rows = z.array(evidenceSchema).min(1).max(30).parse(input)
    const prefs = await settings()
    // Insert-only: recollection cannot undo a person's edits, selection or dismissal.
    const { error } = await db.from('bip_evidence').upsert(rows.map(row => ({ ...row, title: redact(row.title, prefs.excluded_terms), summary: redact(row.summary, prefs.excluded_terms), user_id: userId, provenance: manual ? 'manual' : 'local_activity', confirmed: manual })), { onConflict: 'user_id,source_key', ignoreDuplicates: true }); check(error)
    const { error: settingsError } = await db.from('bip_settings').upsert({ ...prefs, user_id: userId, last_collected_at: new Date().toISOString() }); check(settingsError)
  }
  async function editEvidence(id: string, input: unknown) {
    const patch = z.object({ title: z.string().trim().min(1).max(160).optional(), summary: z.string().trim().min(1).max(2000).optional(), confirmed: z.boolean().optional(), state: z.enum(['suggested', 'selected', 'dismissed']).optional() }).strict().parse(input)
    await evidence(id)
    const { error } = await db.from('bip_evidence').update(patch).eq('user_id', userId).eq('id', id); check(error)
  }
  async function createToken(scope: 'device' | 'assistant') {
    const { count, error } = await db.from('bip_tokens').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('revoked_at', null).gt('expires_at', new Date().toISOString()); check(error)
    if ((count ?? 0) >= 6) throw new StudioError(409, 'Revoca una conexión antes de crear otra.')
    const token = `bip_${scope}_${randomBytes(32).toString('base64url')}`
    const { error: insertError } = await db.from('bip_tokens').insert({ user_id: userId, token_hash: tokenHash(token), prefix: token.slice(0, 18), scope, expires_at: new Date(Date.now() + 90 * 86400000).toISOString() }); check(insertError)
    return token
  }
  async function revokeToken(id: string) {
    const { error } = await db.from('bip_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id); check(error)
  }
  async function enqueue(kind: 'collect' | 'generate', input: unknown, key: string) {
    const payload = kind === 'collect'
      ? z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]) }).strict().parse(input)
      : z.object({ evidence_ids: z.array(z.uuid()).min(1).max(5), channels: z.array(z.enum(['linkedin', 'x', 'instagram'])).min(1).max(3) }).strict().parse(input)
    if ('evidence_ids' in payload) for (const id of payload.evidence_ids) {
      const item = await evidence(id)
      if (item.state !== 'selected') throw new StudioError(409, 'Selecciona los hitos antes de generar los borradores.')
    }
    const { count, error: countError } = await db.from('bip_jobs').select('id', { head: true, count: 'exact' }).eq('user_id', userId).in('state', ['pending', 'claimed']); check(countError)
    if ((count ?? 0) >= 5) throw new StudioError(409, 'Ya hay trabajos pendientes. Conecta el agente local para completarlos.')
    const { data, error } = await db.from('bip_jobs').upsert({ user_id: userId, kind, payload, dedupe_key: key }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }).select('id'); check(error)
    return data?.[0]?.id ?? null
  }
  async function saveGenerated(input: unknown, engine: 'local' | 'assistant', batchKey: string) {
    const items = z.array(generatedDraftSchema).min(1).max(15).parse(input)
    for (const item of items) {
      const source = await evidence(item.evidence_id)
      if (source.state !== 'selected') throw new StudioError(409, 'El hito ya no está seleccionado.')
      const invalid = validateDraft(item); if (invalid) throw new StudioError(400, invalid)
    }
    const { error } = await db.from('bip_drafts').upsert(items.map(item => ({ ...item, user_id: userId, engine, batch_key: batchKey })), { onConflict: 'user_id,batch_key,evidence_id,channel', ignoreDuplicates: true }); check(error)
  }
  async function editDraft(id: string, revision: number, input: unknown) {
    const value = z.object({ body: z.string().trim().min(1).max(5000), visual: generatedDraftSchema.shape.visual, provider_channel_id: z.string().max(200).nullable(), scheduled_at: z.iso.datetime({ offset: true }).nullable() }).strict().parse(input)
    const current = await draft(id)
    if (['sending', 'scheduled', 'published', 'uncertain'].includes(current.state)) throw new StudioError(409, 'Este envío ya está en curso. Comprueba el resultado en Buffer.')
    const { data, error } = await db.from('bip_drafts').update(value).eq('user_id', userId).eq('id', id).eq('revision', revision).select('id'); check(error)
    if (!data?.length) throw new StudioError(409, 'Este borrador cambió en otra pestaña. Recarga antes de editarlo.')
    if (current.image_path && ['title','detail','footer'].some(key => current.visual?.[key as keyof typeof current.visual] !== value.visual?.[key as keyof typeof value.visual])) {
      await db.storage.from('bip-media').remove([current.image_path])
    }
  }
  async function approve(id: string, revision: number) {
    const current = await draft(id)
    const invalid = validateDraft(current); if (invalid) throw new StudioError(400, invalid)
    if (current.channel === 'instagram' && !current.image_path) throw new StudioError(409, 'Guarda la imagen antes de aprobar Instagram.')
    if (!(await evidence(current.evidence_id)).confirmed) throw new StudioError(409, 'Confirma que el hito describe fielmente tu trabajo antes de aprobar el post.')
    if (current.scheduled_at && Date.parse(current.scheduled_at) <= Date.now() + 60000) throw new StudioError(400, 'Elige una fecha futura con al menos un minuto de margen.')
    const { data, error } = await db.from('bip_drafts').update({ state: 'approved', approved_revision: revision, approved_at: new Date().toISOString(), error: null }).eq('user_id', userId).eq('id', id).eq('revision', revision).in('state', ['draft', 'failed']).select('id'); check(error)
    if (!data?.length) throw new StudioError(409, 'El borrador cambió o ya fue aprobado. Recarga su estado.')
  }
  async function removeDraft(id: string) {
    const { data, error } = await db.from('bip_drafts').delete().eq('user_id', userId).eq('id', id).in('state', ['draft', 'approved', 'failed']).select('id,image_path'); check(error)
    if (!data?.length) throw new StudioError(409, 'Los envíos en curso se gestionan desde Buffer.')
    const paths = data.flatMap(row => row.image_path ? [row.image_path] : [])
    if (paths.length) await db.storage.from('bip-media').remove(paths)
  }
  return { studio, settings, evidence, draft, saveSettings, importEvidence, editEvidence, createToken, revokeToken, enqueue, saveGenerated, editDraft, approve, removeDraft }
}

export async function authenticateIntegration(db: SupabaseClient, bearer: string, scope: 'device' | 'assistant') {
  if (!bearer.startsWith(`bip_${scope}_`) || bearer.length > 200) throw new StudioError(401, 'Conexión inválida.')
  const { data, error } = await db.from('bip_tokens').select('id,user_id').eq('token_hash', tokenHash(bearer)).eq('scope', scope).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle(); check(error)
  if (!data) throw new StudioError(401, 'La conexión ha caducado o ha sido revocada.')
  await db.from('bip_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  return { userId: data.user_id as string, tokenId: data.id as string }
}
