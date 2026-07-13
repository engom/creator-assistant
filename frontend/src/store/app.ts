import { useState, useEffect, useRef } from 'react'
import type { Notification, CreatorProfile } from '@/api/types'
import { DEMO_CREATORS, DEMO_NOTIFICATIONS } from '@/data/demo'

type Listener = () => void
const listeners = new Set<Listener>()

interface AppState {
  apiKey: string
  notifications: Notification[]
  creators: CreatorProfile[]
  activeCreatorId: string | null
  healthStatus: 'unknown' | 'ok' | 'degraded'
  lmError: string | null
}

const state: AppState = {
  apiKey: localStorage.getItem('omicron_api_key') ?? '',
  notifications: [...DEMO_NOTIFICATIONS],
  creators: [...DEMO_CREATORS],
  activeCreatorId: DEMO_CREATORS[0].id,
  healthStatus: 'unknown',
  lmError: null,
}

function notify() {
  listeners.forEach((l) => l())
}

export const store = {
  getState: () => state,

  setApiKey(key: string) {
    state.apiKey = key
    localStorage.setItem('omicron_api_key', key)
    notify()
  },

  setHealth(status: 'ok' | 'degraded', lmError?: string) {
    state.healthStatus = status
    state.lmError = lmError ?? null
    notify()
  },

  addNotification(n: Notification) {
    state.notifications = [n, ...state.notifications]
    notify()
  },

  markRead(id: string) {
    state.notifications = state.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    )
    notify()
  },

  markAllRead() {
    state.notifications = state.notifications.map((n) => ({ ...n, read: true }))
    notify()
  },

  approveAction(id: string) {
    state.notifications = state.notifications.map((n) =>
      n.id === id ? { ...n, approved: true, read: true } : n
    )
    notify()
  },

  setActiveCreator(id: string) {
    state.activeCreatorId = id
    notify()
  },

  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

export function useAppStore<T>(selector: (s: AppState) => T): T {
  const [value, setValue] = useState<T>(() => selector(state))
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setValue(selectorRef.current(state))
    })
    return () => { unsub() }
  }, [])

  return value
}
