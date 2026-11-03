// app/layout.tsx
import type { Metadata } from 'next'
import { AuthProvider } from '../context/AuthContext';
import './globals.css';
import { PWAInstallProvider } from '../context/PWAInstallContext'; // Add this
import PWAInstallModal from '../components/PWAInstallModal'; // Import the modal component


export const metadata: Metadata = {
  // Basic metadata
  title: {
    default: 'MEGAPLAY',
    template: '%s | MEGAPLAY',
  },
  description: 'MegaPlay - Registration and Management System',
  
  // Set your production domain for proper URL resolution
  metadataBase: new URL('https://4z83q5j0-3000.inc1.devtunnels.ms/'),
  
  // Keywords for SEO
  keywords: ['MEGAPLAY', 'registration', 'management'],
  
  // PWA Configuration
  manifest: '/manifest.json',
  themeColor: '#000000',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    minimumScale: 1,
    viewportFit: 'cover',
  },
  
  // Apple Web App Configuration
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MEGAPLAY',
  },
  
  // Icons configuration
  icons: {
    icon: '/klo2.png',
    apple: '/klo2.png',
  },
  
  // Open Graph metadata for social sharing (Facebook, LinkedIn, etc.)
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://yourdomain.com',
    siteName: 'MEGAPLAY',
    title: 'MEGAPLAY',
    description: 'MegaPlay - Registration and Management System',
    images: [
      {
        url: '/klo2.png', // 1200x630px recommended
        width: 1200,
        height: 630,
        alt: 'MEGAPLAY site preview image',
      },
    ],
  },
  
  // Twitter Card metadata
  twitter: {
    card: 'summary_large_image',
    title: 'MEGAPLAY',
    description: 'MegaPlay - Registration and Management System',
    images: ['/klo2.png'],
  },
  
  // Additional metadata
  robots: {
    index: true,
    follow: true,
  },
}


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PWAInstallProvider>
          <AuthProvider>
            {children}
            <PWAInstallModal />
          </AuthProvider>
        </PWAInstallProvider>
      </body>
    </html>
  );
}
