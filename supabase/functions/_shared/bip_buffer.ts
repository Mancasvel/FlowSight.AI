import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { type Draft, type SocialChannel, validateDraft } from './bip_domain.ts'
import { check, StudioError, studioService } from './bip_service.ts'

export class BufferError extends Error {
  constructor(public uncertain: boolean, message: string) { super(message) }
}
export async function bufferQuery<T>(key: string, query: string, variables: Record<string, unknown> = {}, transport: typeof fetch = fetch): Promise<T> {
  let response: Response
  try { response = await transport('https://api.buffer.com', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(25000) }) }
  catch { throw new BufferError(true, 'No se pudo confirmar la respuesta de Buffer. Comprueba su cola antes de reintentar.') }
  if (!response.ok) throw new BufferError(response.status >= 500, response.status === 401 || response.status === 403 ? 'La conexión de Buffer ha caducado. Conecta tu cuenta de nuevo.' : 'Buffer no pudo completar la solicitud. Comprueba tu cuenta y sus límites.')
  let result: { data?: T; errors?: unknown[] }
  try { result = await response.json() } catch { throw new BufferError(true, 'Buffer devolvió una respuesta que no se ha podido confirmar.') }
  if (result.errors?.length || !result.data) throw new BufferError(false, 'Buffer rechazó la solicitud. Revisa los permisos y el estado de la cuenta.')
  return result.data
}
export async function listBufferChannels(key: string): Promise<SocialChannel[]> {
  const account = await bufferQuery<{ account: { organizations: { id: string }[] } }>(key, 'query { account { organizations { id } } }')
  const groups = await Promise.all(account.account.organizations.map(async org => {
    const result = await bufferQuery<{ channels: { id: string; name: string; service: string; avatar: string; isDisconnected: boolean; isLocked: boolean }[] }>(key, 'query($input: ChannelsInput!) { channels(input: $input) { id name service avatar isDisconnected isLocked } }', { input: { organizationId: org.id } })
    return result.channels.filter(channel => !channel.isDisconnected && !channel.isLocked && ['linkedin', 'twitter', 'instagram'].includes(channel.service)).map(channel => ({ id: channel.id, name: channel.name, service: channel.service === 'twitter' ? 'x' : channel.service, avatar: channel.avatar })) as SocialChannel[]
  }))
  return groups.flat()
}
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)) }
function unb64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)) }
async function encryptionKey() {
  const key = Deno.env.get('BIP_TOKEN_ENCRYPTION_KEY')
  if (!key) throw new StudioError(503, 'La conexión social todavía no está configurada en el servidor.')
  const bytes = unb64(key)
  if (bytes.length !== 32) throw new StudioError(503, 'La conexión social no está disponible.')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function protectKey(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value)))
  return `${b64(iv)}.${b64(encrypted)}`
}
export async function revealKey(value: string) {
  const [iv, ciphertext] = value.split('.')
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await encryptionKey(), unb64(ciphertext)))
}
export async function connectBuffer(db: SupabaseClient, userId: string, key: string) {
  const channels = await listBufferChannels(key)
  if (!channels.length) throw new StudioError(409, 'Conecta LinkedIn, X o Instagram en Buffer y vuelve a intentarlo.')
  const { error } = await db.from('bip_connections').upsert({ user_id: userId, encrypted_key: await protectKey(key), channels, connected_at: new Date().toISOString() }); check(error)
  return channels
}
export function bufferPostInput(draft: Draft, imageUrl?: string) {
  return {
    channelId: draft.provider_channel_id, text: draft.body, schedulingType: 'automatic',
    mode: draft.scheduled_at ? 'customScheduled' : 'addToQueue',
    ...(draft.scheduled_at ? { dueAt: draft.scheduled_at } : {}),
    assets: imageUrl ? [{ image: { url: imageUrl } }] : [], needsApproval: false,
    aiAssisted: draft.engine !== 'manual',
    ...(draft.channel === 'instagram' ? { metadata: { instagram: { type: 'post', shouldShareToFeed: true } } } : {}),
  }
}
export async function sendToBuffer(db: SupabaseClient, userId: string, id: string, revision: number) {
  const service = studioService(db, userId)
  const draft = await service.draft(id)
  if (draft.state !== 'approved' || draft.approved_revision !== revision || draft.revision !== revision) throw new StudioError(409, 'Aprueba esta versión antes de enviarla.')
  const invalid = validateDraft(draft); if (invalid) throw new StudioError(400, invalid)
  if (!draft.provider_channel_id) throw new StudioError(400, 'Selecciona una cuenta social y aprueba de nuevo el borrador.')
  if (draft.scheduled_at && Date.parse(draft.scheduled_at) <= Date.now() + 60000) throw new StudioError(409, 'La fecha aprobada ya ha pasado. Elige otra fecha y aprueba el cambio.')
  const { data: connection, error } = await db.from('bip_connections').select('encrypted_key').eq('user_id', userId).maybeSingle(); check(error)
  if (!connection) throw new StudioError(409, 'Conecta Buffer antes de enviar.')
  const key = await revealKey(connection.encrypted_key)
  const channels = await listBufferChannels(key)
  if (!channels.some(channel => channel.id === draft.provider_channel_id && channel.service === draft.channel)) throw new StudioError(409, 'La cuenta seleccionada no está disponible en Buffer. Vuelve a conectarla.')
  let imageUrl: string | undefined
  if (draft.channel === 'instagram') {
    const { data: media } = await db.from('bip_drafts').select('image_path').eq('user_id', userId).eq('id', id).single()
    if (!media?.image_path) throw new StudioError(400, 'Guarda la imagen de Instagram antes de aprobar el post.')
    const signed = await db.storage.from('bip-media').createSignedUrl(media.image_path, 3600); check(signed.error)
    imageUrl = signed.data?.signedUrl
  }
  // Compare-and-set before any external write. Only one caller wins.
  const claimed = await db.from('bip_drafts').update({ state: 'sending', error: null }).eq('user_id', userId).eq('id', id).eq('state', 'approved').eq('revision', revision).eq('approved_revision', revision).select('id'); check(claimed.error)
  if (!claimed.data?.length) throw new StudioError(409, 'El envío ya está en curso o el borrador ha cambiado.')
  let receipt: string | undefined
  try {
    const result = await bufferQuery<{ createPost: { __typename: string; post?: { id: string; status: string } } }>(key, 'mutation($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { id status } } } }', { input: bufferPostInput(draft, imageUrl) })
    if (result.createPost.__typename !== 'PostActionSuccess' || !result.createPost.post?.id) throw new BufferError(false, 'Buffer no aceptó el post. Revisa los permisos, el formato y los límites de la cuenta.')
    const post = result.createPost.post
    receipt = post.id
    const stored = await db.from('bip_drafts').update({ state: post.status === 'sent' ? 'published' : 'scheduled', provider_post_id: post.id }).eq('user_id', userId).eq('id', id).eq('state', 'sending'); check(stored.error)
    return post
  } catch (error) {
    const definite = error instanceof BufferError && !error.uncertain
    await db.from('bip_drafts').update({ state: definite ? 'failed' : 'uncertain', ...(receipt ? { provider_post_id: receipt } : {}), error: definite ? error.message : 'El resultado no está confirmado. Revisa la cola de Buffer; no vuelvas a enviarlo todavía.' }).eq('user_id', userId).eq('id', id).eq('state', 'sending')
    throw new StudioError(502, definite ? error.message : 'El envío no está confirmado. Comprueba la cola de Buffer antes de cualquier reintento.')
  }
}
