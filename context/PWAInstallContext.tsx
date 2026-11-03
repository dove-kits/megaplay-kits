'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAInstallContextType {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstallable: boolean;
  isPWAInstalled: boolean;
  showInstallPrompt: () => Promise<void>;
}

const PWAInstallContext = createContext<PWAInstallContextType | undefined>(undefined);

export function PWAInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isPWAInstalled, setIsPWAInstalled] = useState(false);

  useEffect(() => {
    // Check if PWA is already installed
    const checkIfInstalled = () => {
      // Method 1: Check display mode
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsPWAInstalled(true);
        return true;
      }
      
      // Method 2: Check if running as PWA
      if ((window.navigator as any).standalone === true) {
        setIsPWAInstalled(true);
        return true;
      }

      // Method 3: Check localStorage flag (set when user installs)
      if (localStorage.getItem('pwa-installed') === 'true') {
        setIsPWAInstalled(true);
        return true;
      }

      return false;
    };

    const isInstalled = checkIfInstalled();

    // Only listen for install prompt if not already installed
    if (!isInstalled) {
      const handler = (e: Event) => {
        e.preventDefault();
        const promptEvent = e as BeforeInstallPromptEvent;
        setDeferredPrompt(promptEvent);
        setIsInstallable(true);
        console.log('PWA install prompt available');
      };

      window.addEventListener('beforeinstallprompt', handler);

      // Listen for successful installation
      const installedHandler = () => {
        console.log('PWA installed successfully');
        setIsPWAInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
        localStorage.setItem('pwa-installed', 'true');
      };

      window.addEventListener('appinstalled', installedHandler);

      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        window.removeEventListener('appinstalled', installedHandler);
      };
    }
  }, []);

  const showInstallPrompt = async () => {
    // Don't show if already installed
    if (isPWAInstalled) {
      console.log('PWA already installed');
      return;
    }

    if (!deferredPrompt) {
      console.log('Install prompt not available');
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log(`User response: ${outcome}`);
      
      if (outcome === 'accepted') {
        console.log('User accepted PWA installation');
        setIsPWAInstalled(true);
        localStorage.setItem('pwa-installed', 'true');
      }
      
      // Clear the prompt after use
      setDeferredPrompt(null);
      setIsInstallable(false);
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  return (
    <PWAInstallContext.Provider value={{ deferredPrompt, isInstallable, isPWAInstalled, showInstallPrompt }}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export function usePWAInstall() {
  const context = useContext(PWAInstallContext);
  if (!context) {
    throw new Error('usePWAInstall must be used within PWAInstallProvider');
  }
  return context;
}
