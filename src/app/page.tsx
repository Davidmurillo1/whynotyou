import { redirect } from 'next/navigation'

// El proxy decide login vs dashboard según sesión.
export default function Home() {
  redirect('/dashboard')
}
