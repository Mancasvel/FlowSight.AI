import { z } from 'npm:zod@4.1.12'
import { authenticate, corsHeaders, isResponse, jsonResponse } from '../_shared/http.ts'
import { check, StudioError, studioService } from '../_shared/bip_service.ts'
import { briefService } from '../_shared/bip_briefs.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  const auth = await authenticate(req)
  if (isResponse(auth)) return auth
  try {
    const text = await req.text()
    if (new TextEncoder().encode(text).length > 3_000_000) throw new StudioError(413, 'La solicitud es demasiado grande.')
    let body: Record<string, unknown>
    try { body = JSON.parse(text) } catch { throw new StudioError(400, 'La solicitud no es válida.') }
    if (body.expected_owner && body.expected_owner !== auth.userId) throw new StudioError(409, 'La cuenta ha cambiado. Recarga Build in public antes de continuar.')
    const service = studioService(auth.serviceClient, auth.userId)
    const briefs = briefService(auth.serviceClient, auth.userId)
    const id = () => z.uuid().parse(body.id)
    const revision = () => z.number().int().positive().parse(body.revision)
    switch (body.action) {
      case 'studio': return jsonResponse({ ...await service.studio(), ...await briefs.studio() })
      case 'profile': await briefs.saveProfile(body.profile); break
      case 'delete_profile': await briefs.removeProfile(id()); break
      case 'briefs': await briefs.create(body.request); break
      case 'edit_brief': await briefs.edit(id(),revision(),body.prompt); break
      case 'delete_brief': await briefs.remove(id()); break
      case 'settings': await service.saveSettings(body.settings); break
      case 'direction': await service.saveDirection(body.text); break
      case 'import': await service.importEvidence(body.evidence, body.manual === true); break
      case 'evidence': await service.editEvidence(id(), body.patch); break
      case 'generated': await service.saveGenerated(body.drafts, 'local', z.uuid().parse(body.batch_key)); break
      case 'edit': await service.editDraft(id(), revision(), body.draft); break
      case 'delete': await service.removeDraft(id()); break
      case 'assistant_token': return jsonResponse({ token: await service.createToken('assistant') })
      case 'revoke_token': await service.revokeToken(id()); break
      case 'image': {
        const current = await service.draft(id())
        if (current.state !== 'draft' || current.revision !== revision() || current.channel !== 'instagram') throw new StudioError(409, 'Recarga el borrador antes de guardar su imagen.')
        const encoded = z.string().min(32).max(2_800_000).parse(body.png)
        let bytes: Uint8Array
        try { bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)) } catch { throw new StudioError(400, 'Imagen PNG no válida.') }
        const view = new DataView(bytes.buffer)
        if (bytes.length < 24 || bytes.length > 2_097_152 || bytes.slice(0,8).join() !== '137,80,78,71,13,10,26,10' || view.getUint32(16) !== 1080 || view.getUint32(20) !== 1350) throw new StudioError(400, 'La imagen debe ser un PNG de 1080 × 1350 y menos de 2 MB.')
        const path = `${auth.userId}/${current.id}/${crypto.randomUUID()}.png`
        const uploaded = await auth.serviceClient.storage.from('bip-media').upload(path, bytes, { contentType: 'image/png', upsert: false }); check(uploaded.error)
        const saved = await auth.serviceClient.from('bip_drafts').update({ image_path: path }).eq('user_id', auth.userId).eq('id', current.id).eq('revision', current.revision).eq('state', 'draft').select('id')
        if (saved.error || !saved.data?.length) {
          await auth.serviceClient.storage.from('bip-media').remove([path])
          throw new StudioError(409, 'El borrador cambió. Recarga y guarda la imagen de nuevo.')
        }
        if (current.image_path) await auth.serviceClient.storage.from('bip-media').remove([current.image_path])
        break
      }
      default: throw new StudioError(400, 'Acción no válida.')
    }
    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof StudioError) return jsonResponse({ error: error.message }, error.status)
    if (error instanceof z.ZodError) return jsonResponse({ error: 'Revisa los campos del formulario.' }, 400)
    console.error('Build in public failed', error instanceof Error ? error.name : 'unknown')
    return jsonResponse({ error: 'No se pudo completar la solicitud. Inténtalo de nuevo.' }, 503)
  }
}
Deno.serve(handler)
