// client/src/router.ts
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/useAuthStore';
import App from '../App.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/Admin.vue'),
    meta: { requiresAuth: true, roles: ['teacher', 'admin'] },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
  },
  {
    path: '/:catchAll(.*)',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// С логами
// router.beforeEach((to, from, next) => {
//   const auth = useAuthStore();
  
//   console.log('Navigation guard triggered:');
//   console.log('  - To:', to.path);
//   console.log('  - User:', auth.user);
//   console.log('  - User role:', auth.user?.role);
//   console.log('  - Route requires auth:', to.meta.requiresAuth);
//   console.log('  - Route roles:', to.meta.roles);
  
//   if (to.meta.requiresAuth && !auth.user) {
//     console.log('No user, redirecting to login');
//     next('/login');
//   } else if (to.meta.roles && auth.user) {
//     const userRole = auth.user.role?.toLowerCase();
//     const routeRoles = (to.meta.roles as string[]).map(r => r.toLowerCase());
//     console.log('Checking roles:', { userRole, routeRoles });
    
//     if (!routeRoles.includes(userRole)) {
//       console.log('Role mismatch, redirecting to home');
//       next('/');
//     } else {
//       console.log('Role allowed');
//       next();
//     }
//   } else {
//     console.log('No auth/role check needed');
//     next();
//   }
// });


router.beforeEach(async (to, from) => {
  const auth = useAuthStore();
  
  // Если уже загружаем пользователя, ждем завершения
  if (auth.isUserLoading) {
    // Создаем промис, который разрешится когда загрузка завершится
    await new Promise<void>((resolve) => {
      const checkLoading = () => {
        if (!auth.isUserLoading) {
          resolve();
        } else {
          setTimeout(checkLoading, 50);
        }
      };
      checkLoading();
    });
  }
  
  // Если пользователь еще не загружен (первый раз), загружаем
  if (!auth.user && !auth.isInitialized) {
    await auth.loadUser();
  }
  
  // Маршрут требует авторизации, а пользователя нет
  if (to.meta.requiresAuth && !auth.user) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  
  // Маршрут только для гостей (логин), а пользователь есть
  if (to.meta.guestOnly && auth.user) {
    return { path: '/' };
  }
  
  // Проверка ролей
  if (to.meta.roles && auth.user) {
    const userRole = auth.user.role;
    if (!(to.meta.roles as string[]).includes(userRole)) {
      // Нет прав - перенаправляем на главную
      return { path: '/' };
    }
  }
});

export default router;