import { onMounted, onUnmounted } from 'vue'
import { supabase } from '../lib/supabase.js'

export function useStudentDataSync(refresh, tables = []) {
  let channel = null
  let isMounted = false

  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      void refresh()
    }
  }

  onMounted(async () => {
    isMounted = true
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      if (!isMounted || !session?.user || !tables.length) return

      channel = supabase.channel(`student-data-${session.user.id}`)
      for (const { table, column = 'student_id' } of tables) {
        const filter = column ? { filter: `${column}=eq.${session.user.id}` } : {}
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            ...filter,
          },
          () => {
            void refresh()
          },
        )
      }

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Realtime synchronization is unavailable for ${tables.map(({ table }) => table).join(', ')}.`)
        }
      })
    } catch (error) {
      if (isMounted) console.error('Could not start student data synchronization:', error)
    }
  })

  onUnmounted(() => {
    isMounted = false
    window.removeEventListener('focus', refreshWhenVisible)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
    if (channel) {
      void supabase.removeChannel(channel)
    }
  })
}
