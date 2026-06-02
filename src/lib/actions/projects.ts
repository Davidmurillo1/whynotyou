'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  createProjectSchema,
  updateProjectSchema,
  setItemProjectsSchema,
  addItemsToProjectSchema,
  type UpdateProjectInput,
} from '@/lib/projects/schemas'
import type { ProjectStatus } from '@/lib/projects/constants'

export type ProjectFormState = { error?: string; ok?: boolean } | null

export type ProjectCandidate = {
  id: string
  title: string
  scope: 'study' | 'work'
}

export type AllProjectsRow = {
  id: string
  name: string
  color: string
  emoji: string | null
  status: 'active' | 'archived'
}

/**
 * Devuelve todos los proyectos del usuario actual. Usado por el picker del
 * detalle de ítem; el SSR del item solo trae los proyectos a los que ya
 * pertenece, así no transferimos todo el listado en cada render.
 */
export async function listAllProjectsAction(): Promise<
  { projects: AllProjectsRow[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' }

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color, emoji, status, order_index, created_at')
    .eq('user_id', user.id)
    .order('status', { ascending: true })
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return { error: 'list_failed' }
  return {
    projects: (data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      color: p.color as string,
      emoji: (p.emoji as string | null) ?? null,
      status: (p.status as 'active' | 'archived') ?? 'active',
    })),
  }
}

/**
 * Devuelve los ítems del usuario que NO pertenecen aún al proyecto, para
 * alimentar el modal "Agregar ítems" sin tener que cargarlos en el SSR.
 */
export async function listProjectCandidatesAction(
  projectId: string,
): Promise<{ candidates: ProjectCandidate[] } | { error: string }> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' }

  const [{ data: project }, { data: memberRows }, { data: items }] = await Promise.all([
    supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('project_items')
      .select('item_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id),
    supabase
      .from('items')
      .select('id, title, scope, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ])

  if (!project) return { error: 'not_found' }
  const memberIds = new Set((memberRows ?? []).map((m) => m.item_id as string))
  const candidates = (items ?? [])
    .filter((i) => !memberIds.has(i.id as string))
    .map((i) => ({
      id: i.id as string,
      title: i.title as string,
      scope: ((i.scope as 'study' | 'work') ?? 'study'),
    }))
  return { candidates }
}

function paths() {
  revalidatePath('/proyectos')
  revalidatePath('/biblioteca')
  revalidatePath('/dashboard')
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = createProjectSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || '',
    color: formData.get('color') || '#8b93a1',
    emoji: formData.get('emoji') || '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      emoji: parsed.data.emoji || null,
    })
    .select('id')
    .single()

  if (error || !data) return { error: 'No pudimos guardar el proyecto.' }
  paths()
  redirect(`/proyectos/${data.id}`)
}

export async function updateProjectAction(input: UpdateProjectInput) {
  const parsed = updateProjectSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.description !== undefined) {
    patch.description = parsed.data.description || null
  }
  if (parsed.data.color !== undefined) patch.color = parsed.data.color
  if (parsed.data.emoji !== undefined) {
    patch.emoji = parsed.data.emoji || null
  }

  if (Object.keys(patch).length === 0) return { ok: true as const }

  const { error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
  if (error) return { error: 'update_failed' as const }

  paths()
  revalidatePath(`/proyectos/${parsed.data.id}`)
  return { ok: true as const }
}

export async function deleteProjectAction(projectId: string) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', user.id)
  if (error) return { error: 'delete_failed' as const }

  paths()
  redirect('/proyectos')
}

export async function setProjectStatusAction(
  projectId: string,
  status: ProjectStatus,
) {
  if (status !== 'active' && status !== 'archived') {
    return { error: 'status_invalid' as const }
  }
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase
    .from('projects')
    .update({ status })
    .eq('id', projectId)
    .eq('user_id', user.id)
  if (error) return { error: 'update_failed' as const }

  paths()
  revalidatePath(`/proyectos/${projectId}`)
  return { ok: true as const }
}

export async function addItemsToProjectAction(
  projectId: string,
  itemIds: string[],
) {
  const parsed = addItemsToProjectSchema.safeParse({
    project_id: projectId,
    item_ids: itemIds,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Necesitás iniciar sesión.' }

  // Validación cruzada: proyecto y todos los ítems deben pertenecer al user.
  const [{ data: project }, { data: ownedItems }] = await Promise.all([
    supabase
      .from('projects')
      .select('id')
      .eq('id', parsed.data.project_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('items')
      .select('id')
      .in('id', parsed.data.item_ids)
      .eq('user_id', user.id),
  ])
  if (!project) return { error: 'Proyecto no encontrado.' }
  const ownedIds = new Set((ownedItems ?? []).map((i) => i.id as string))
  const toInsert = parsed.data.item_ids
    .filter((id) => ownedIds.has(id))
    .map((id) => ({
      project_id: parsed.data.project_id,
      item_id: id,
      user_id: user.id,
    }))
  if (toInsert.length === 0) return { error: 'Ningún ítem válido para agregar.' }

  // `on conflict do nothing` mediante upsert con ignoreDuplicates.
  const { error } = await supabase
    .from('project_items')
    .upsert(toInsert, { onConflict: 'project_id,item_id', ignoreDuplicates: true })
  if (error) return { error: 'No pudimos agregar los ítems.' }

  paths()
  revalidatePath(`/proyectos/${parsed.data.project_id}`)
  for (const id of parsed.data.item_ids) {
    revalidatePath(`/item/${id}`)
  }
  return { ok: true as const }
}

export async function removeItemFromProjectAction(
  projectId: string,
  itemId: string,
) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  const { error } = await supabase
    .from('project_items')
    .delete()
    .eq('project_id', projectId)
    .eq('item_id', itemId)
    .eq('user_id', user.id)
  if (error) return { error: 'delete_failed' as const }

  paths()
  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath(`/item/${itemId}`)
  return { ok: true as const }
}

export async function setItemProjectsAction(
  itemId: string,
  projectIds: string[],
) {
  const parsed = setItemProjectsSchema.safeParse({
    item_id: itemId,
    project_ids: projectIds,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'no_auth' as const }

  // Validar ownership del ítem.
  const { data: item } = await supabase
    .from('items')
    .select('id')
    .eq('id', parsed.data.item_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!item) return { error: 'item_not_found' as const }

  // Filtramos project_ids a los que efectivamente pertenecen al usuario.
  let validProjectIds: string[] = []
  if (parsed.data.project_ids.length > 0) {
    const { data: ownedProjects } = await supabase
      .from('projects')
      .select('id')
      .in('id', parsed.data.project_ids)
      .eq('user_id', user.id)
    validProjectIds = (ownedProjects ?? []).map((p) => p.id as string)
  }

  // Estado actual de pertenencias del ítem.
  const { data: existing } = await supabase
    .from('project_items')
    .select('project_id')
    .eq('item_id', parsed.data.item_id)
    .eq('user_id', user.id)
  const currentIds = new Set((existing ?? []).map((r) => r.project_id as string))
  const targetIds = new Set(validProjectIds)

  const toDelete = [...currentIds].filter((id) => !targetIds.has(id))
  const toInsert = [...targetIds]
    .filter((id) => !currentIds.has(id))
    .map((projectId) => ({
      project_id: projectId,
      item_id: parsed.data.item_id,
      user_id: user.id,
    }))

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('project_items')
      .delete()
      .eq('item_id', parsed.data.item_id)
      .eq('user_id', user.id)
      .in('project_id', toDelete)
    if (error) return { error: 'update_failed' as const }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('project_items')
      .upsert(toInsert, { onConflict: 'project_id,item_id', ignoreDuplicates: true })
    if (error) return { error: 'update_failed' as const }
  }

  paths()
  revalidatePath(`/item/${parsed.data.item_id}`)
  for (const pid of [...currentIds, ...targetIds]) {
    revalidatePath(`/proyectos/${pid}`)
  }
  return { ok: true as const }
}
