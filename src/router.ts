import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue')
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('./views/SearchView.vue')
    },
    {
      path: '/downloads',
      name: 'downloads',
      component: () => import('./views/DownloadsView.vue')
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: () => import('./views/FavoritesView.vue')
    },
    {
      path: '/analyzer',
      name: 'analyzer',
      component: () => import('./views/LinkAnalyzerView.vue')
    },
    {
      path: '/sync',
      name: 'sync',
      component: () => import('./views/SyncView.vue')
    },
    {
      path: '/retag',
      name: 'retag',
      component: () => import('./views/RetagView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue')
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('./views/AboutView.vue')
    },
    {
      path: '/artist/:id',
      name: 'artist',
      component: () => import('./views/ArtistView.vue')
    },
    {
      path: '/album/:id',
      name: 'album',
      component: () => import('./views/AlbumView.vue')
    },
    {
      path: '/playlist/:id',
      name: 'playlist',
      component: () => import('./views/PlaylistView.vue')
    },
    {
      // A Deezer playlist creator's public playlists (#135)
      path: '/user/:id',
      name: 'user-playlists',
      component: () => import('./views/UserPlaylistsView.vue')
    },
    {
      path: '/charts',
      name: 'charts',
      component: () => import('./views/ChartsView.vue')
    },
    {
      path: '/new-releases',
      name: 'new-releases',
      component: () => import('./views/NewReleasesView.vue')
    },
    {
      path: '/qobuz',
      name: 'qobuz',
      component: () => import('./views/QobuzView.vue')
    },
    {
      path: '/qobuz/feed',
      name: 'qobuz-feed',
      component: () => import('./views/QobuzFeedView.vue')
    },
    {
      path: '/genres',
      name: 'genres',
      component: () => import('./views/GenresView.vue')
    },
    {
      // Catch-all: redirect unknown routes to home
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
