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
    path: '/student',
    component: StudentLayout,
    meta: { requiresAuth: true },
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
    meta: { requiresAuth: true },
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

router.beforeEach(async (to, _from, next) => {
  const { data: { session } } = await supabase.auth.getSession()
  const isAuthenticated = !!session?.user

  if (to.meta.requiresAuth && !isAuthenticated) {
    return next({ path: '/' })
  }

  if (to.meta.guestOnly && isAuthenticated) {
    return next({ path: '/student/home' })
  }

  next()
})

export default router
