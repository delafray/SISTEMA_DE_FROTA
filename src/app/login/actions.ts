'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const username = formData.get('username') as string
  const password = formData.get('password') as string

  // Normaliza o nome: tira espaços, minúsculas, tira acentos
  let email = username
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  // Se o usuário digitou só "ronaldo", completamos o domínio que usamos no Supabase
  if (!email.includes('@')) {
    email = `${email}@ronaldoborba.com.br`
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return redirect('/login?error=true')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
