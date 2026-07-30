import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

const MAX_SIZE_BYTES = 5 * 1024 * 1024
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) {
    return jsonError(400, 'No file was provided.')
  }

  const ext = EXT_BY_MIME[file.type]
  if (!ext) {
    return jsonError(400, 'Unsupported image type. Use PNG, JPEG, WEBP or GIF.')
  }
  if (file.size > MAX_SIZE_BYTES) {
    return jsonError(400, 'Image is too large. Maximum size is 5MB.')
  }

  const { data: existing } = await supabase.storage.from('avatars').list(user.id)
  if (existing && existing.length > 0) {
    await supabase.storage.from('avatars').remove(existing.map((f) => `${user.id}/${f.name}`))
  }

  const path = `${user.id}/avatar.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: true })

  if (uploadError) {
    return jsonError(500, uploadError.message)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path)
  const avatarUrl = `${publicUrl}?v=${Date.now()}`

  const { data, error } = await supabase
    .from('users')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('email, display_name, avatar_url, is_premium, created_at')
    .single()

  if (error) {
    return jsonError(500, error.message)
  }

  return NextResponse.json(data)
}
