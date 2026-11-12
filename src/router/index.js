
import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../supabase'

import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import PaymentQueueView from '../views/PaymentQueueView.vue'
import MyCounterView from '../views/MyCounterView.vue'
import ReportsView from '../views/ReportsView.vue'
import ProfileView from '../views/ProfileView.vue'

const routes = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { guestOnly: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardView,
    meta: { requiresAuth: true },
  },
  {
    path: '/payment-queue',
    name: 'payment-queue',
    component: PaymentQueueView,
    meta: { requiresAuth: true },
  },
  {
    path: '/my-counter',
    name: 'my-counter',
    component: MyCounterView,
    meta: { requiresAuth: true },
  },
  {
    path: '/reports',
    name: 'reports',
    component: ReportsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfileView,
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    console.error('Unable to check authentication session:', error)
  }

  const isAuthenticated = Boolean(data?.session)

  if (to.meta.requiresAuth && !isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guestOnly && isAuthenticated) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
