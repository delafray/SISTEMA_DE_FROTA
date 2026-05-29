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

  if (!email.includes('@')) {
    // Tenta primeiro com @frota.sys (novo padrão para novos usuários/motoristas)
    const { error: errorFrota } = await supabase.auth.signInWithPassword({
      email: `${email}@frota.sys`,
      password,
    })

    if (errorFrota) {
      // Se falhar, tenta com o legado @ronaldoborba.com.br para usuários antigos
      const { error: errorLegado } = await supabase.auth.signInWithPassword({
        email: `${email}@ronaldoborba.com.br`,
        password,
      })

      if (errorLegado) {
        return redirect('/login?error=true')
      }
    }
  } else {
    // Se o usuário digitou o e-mail completo
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return redirect('/login?error=true')
    }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
