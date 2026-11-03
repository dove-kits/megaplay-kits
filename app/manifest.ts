import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MEGAPLAY',
    short_name: 'MEGAPLAY',
    description: 'MegaPlay - Registration and Management System',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#07239dff', // Your dark background
theme_color: '#020617',

    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      // ✨ Add smaller sizes for desktop
      {
        src: '/icon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        url: '/students/dashboard',
        icons: [{ src: '/icon-192x192.png', sizes: '192x192' }]
      }
    ],
  }
}
