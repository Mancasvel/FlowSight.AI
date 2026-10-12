import { z } from 'npm:zod@4.1.12'

export const channelSchema = z.enum(['linkedin', 'x', 'instagram'])
export type Channel = z.infer<typeof channelSchema>
export const CHANNEL_LIMITS: Record<Channel, number> = { linkedin: 3000, x: 280, instagram: 2200 }
export const visualSchema = z.object({
  title: z.string().trim().min(1).max(100),
  detail: z.string().trim().min(1).max(280),
  footer: z.string().trim().max(80),
}).strict()
export const evidenceSchema = z.object({
  source_key: z.string().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2000),
  occurred_on: z.iso.date(),
  kind: z.enum(['progress', 'learning', 'decision', 'milestone']),
}).strict()
export const generatedDraftSchema = z.object({
  evidence_id: z.uuid(), channel: channelSchema,
  brief_id: z.uuid().optional(),
  body: z.string().trim().min(1).max(5000),
  details: z.string().max(20000).default(''),
  visual: visualSchema.nullable().default(null),
}).strict()
export type Visual = z.infer<typeof visualSchema>
export type Evidence = z.infer<typeof evidenceSchema> & {
  id: string; user_id: string; confirmed: boolean; state: 'suggested' | 'selected' | 'dismissed';
  provenance: 'local_activity' | 'manual'; created_at: string;
}
export type Draft = z.infer<typeof generatedDraftSchema> & {
  id: string; state: 'draft' | 'approved' | 'sending' | 'scheduled' | 'published' | 'failed' | 'uncertain';
  engine: string; revision: number; approved_revision: number | null; provider_channel_id: string | null;
  scheduled_at: string | null; provider_post_id: string | null; error: string | null; created_at: string;
  image_path?: string | null;
}
export type SocialChannel = { id: string; name: string; service: Channel; avatar?: string }
export type Settings = {
  project_name: string; locale: 'es' | 'en'; timezone: string; cadence: 'manual' | 'daily' | 'weekly';
  excluded_terms: string[]; voice: string; last_collected_at: string | null;
}
export type Studio = {
  owner_id: string;
  settings: Settings; evidence: Evidence[]; drafts: Draft[]; channels: SocialChannel[];
  tokens: { id: string; prefix: string; scope: string; last_used_at: string | null; expires_at: string }[];
  jobs: { id: string; kind: string; state: string; error: string | null; created_at: string }[];
}
export const settingsSchema = z.object({
  project_name: z.string().trim().min(1).max(100), locale: z.enum(['es', 'en']),
  timezone: z.string().max(80).refine((value) => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }),
  cadence: z.enum(['manual', 'daily', 'weekly']), excluded_terms: z.array(z.string().trim().min(1).max(100)).max(50),
  voice: z.string().max(1500),
}).strict()

// Treat observations as data. Strip common secrets before they cross the device boundary.
export function redact(text: string, excluded: string[] = []): string {
  let clean = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:sk|ghp|github_pat|sb_secret)[-_][A-Za-z0-9_-]{12,}\b/g, '[secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [secret]')
    .replace(/\b[A-Z]:\\[^\n,;]+/gi, '[local path]')
    .replace(/https?:\/\/\S+/gi, '[link]')
  for (const term of excluded) clean = clean.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[private]')
  return clean.trim()
}

// X counts most non-Latin codepoints as two and URLs at a fixed 23 characters.
export function textLength(body: string, channel: Channel): number {
  if (channel !== 'x') return [...body].length
  const urls = body.match(/https?:\/\/\S+/g) ?? []
  const rest = body.replace(/https?:\/\/\S+/g, '')
  return urls.length * 23 + [...rest].reduce((sum, c) => {
    const n = c.codePointAt(0)!
    return sum + (n <= 0x10ff || (n >= 0x2000 && n <= 0x200d) || (n >= 0x2010 && n <= 0x201f) || (n >= 0x2032 && n <= 0x2037) ? 1 : 2)
  }, 0)
}
export function validateDraft(draft: Pick<Draft, 'body' | 'channel' | 'visual'>): string | null {
  if (!draft.body.trim()) return 'Escribe el texto de la publicación.'
  if (textLength(draft.body, draft.channel) > CHANNEL_LIMITS[draft.channel]) return `El texto supera el límite de ${CHANNEL_LIMITS[draft.channel]} caracteres.`
  return null
}
