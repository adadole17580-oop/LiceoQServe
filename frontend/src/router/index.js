import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../lib/supabase.js'

import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import StudentLayout from '../layouts/StudentLayout.vue'

import HomeView from '../views/HomeView.vue'
import ServicesView from '../views/ServicesView.vue'
import QueueView from '../views/QueueView.vue'
import AppointmentView from '../views/AppointmentView.vue'
import RequestsView from '../views/RequestsView.vue'
import HistoryView from '../views/HistoryView.vue'
import ProfileView from '../views/ProfileView.vue'
import NotificationsView from '../views/NotificationsView.vue'
import StaffPortalView from '../views/StaffPortalView.vue'

const routes = [
  {
    path: '/',
    name: 'login',
    component: LoginView,
    meta: { guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: { guestOnly: true },
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('../views/AuthCallbackView.vue'),
  },
  {
    path: '/student',
    component: StudentLayout,
    meta: { requiresAuth: true, role: 'student' },
    children: [
      {
        path: '',
        redirect: '/student/home',
      },
      {
        path: 'home',
        name: 'student-home',
        component: HomeView,
      },
      {
        path: 'services',
        name: 'student-services',
        component: ServicesView,
      },
      {
        path: 'queue',
        name: 'student-queue',
        component: QueueView,
      },
      {
        path: 'appointments',
        name: 'student-appointments',
        component: AppointmentView,
      },
      {
        path: 'requests',
        name: 'student-requests',
        component: RequestsView,
      },
      {
        path: 'history',
        name: 'student-history',
        component: HistoryView,
      },
      {
        path: 'profile',
        name: 'student-profile',
        component: ProfileView,
      },
      {
        path: 'notifications',
        name: 'student-notifications',
        component: NotificationsView,
      },
    ],
  },
  {
    path: '/staff',
    redirect: '/staff/Cashier',
  },
  {
    path: '/staff/:office',
    name: 'staff-portal',
    component: StaffPortalView,
    meta: { requiresAuth: true, role: 'staff' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

async function getPortalDestination(profile) {
  if (profile.role === 'student') return '/student/home'
  if (profile.role === 'admin') return '/staff/Cashier'
  if (profile.role !== 'staff' || !profile.office_id) return null

  const { data: office, error } = await supabase
    .from('offices')
    .select('name')
    .eq('id', profile.office_id)
    .maybeSingle()

  if (error) throw error
  return office?.name ? `/staff/${encodeURIComponent(office.name)}` : null
}

router.beforeEach(async (to) => {
  if (to.name === 'auth-callback') return true

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    console.error('Could not verify the current Supabase session:', sessionError)
    return to.name === 'login' ? true : { path: '/', query: { authError: 'profile' } }
  }

  if (!session?.user) {
    return to.matched.some((record) => record.meta.requiresAuth)
      ? { path: '/' }
      : true
  }

  let profile
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, office_id')
      .eq('id', session.user.id)
      .maybeSingle()

    if (error) throw error
    profile = data
  } catch (error) {
    console.error('Could not verify the account profile:', error)
    return to.name === 'login' ? true : { path: '/', query: { authError: 'profile' } }
  }

  if (!profile) {
    return to.name === 'login'
      ? true
      : { path: '/', query: { authError: 'onboarding' } }
  }

  let destination
  try {
    destination = await getPortalDestination(profile)
  } catch (error) {
    console.error('Could not resolve the account portal:', error)
    return to.name === 'login' ? true : { path: '/', query: { authError: 'profile' } }
  }

  if (!destination) {
    return to.name === 'login'
      ? true
      : { path: '/', query: { authError: 'unauthorized' } }
  }

  const requiresStudent = to.matched.some((record) => record.meta.role === 'student')
  const requiresStaff = to.matched.some((record) => record.meta.role === 'staff')

  if (to.meta.guestOnly) return destination
  if (requiresStudent && profile.role !== 'student') return destination
  if (requiresStaff && profile.role === 'student') return destination

  if (requiresStaff && profile.role === 'staff') {
    const assignedOffice = decodeURIComponent(destination.split('/').pop())
    if (to.params.office !== assignedOffice) return destination
  }

  return true
})

export default router
