import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ItemForm } from './item-form'

export const metadata = { title: 'Nuevo ítem · Why Not You?' }
export const dynamic = 'force-dynamic'

export default async function NewItemPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: cats } = await supabase
    .from('categories')
    .select('id, name, emoji, color, parent_id')
    .eq('user_id', user!.id)
    .order('order_index', { ascending: true })

  // Aplanar con sangría para el select
  const all = cats ?? []
  const roots = all.filter((c) => !c.parent_id)
  const options: { id: string; label: string }[] = []
  for (const r of roots) {
    options.push({ id: r.id, label: `${r.emoji ? r.emoji + ' ' : ''}${r.name}` })
    const kids = all.filter((c) => c.parent_id === r.id)
    for (const k of kids) {
      options.push({
        id: k.id,
        label: `   └ ${k.emoji ? k.emoji + ' ' : ''}${k.name}`,
      })
    }
  }

  return (
    <div className="space-y-6 max-w-md">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">¿Qué estás aprendiendo?</h1>
        <p className="text-muted text-sm">Una sola cosa basta. Después agregás más.</p>
      </header>
      <ItemForm categoryOptions={options} />
    </div>
  )
}
