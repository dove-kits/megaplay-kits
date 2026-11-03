'use client';

import { useState, useEffect } from 'react';
import { usePWAInstall } from '../context/PWAInstallContext';
import Image from 'next/image';

export default function PWAInstallModal() {
  const { isInstallable, showInstallPrompt } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (isInstallable) {
      // Show modal after login
      const timer = setTimeout(() => {
        setShowModal(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isInstallable]);

  if (!showModal) return null;

  const handleInstall = async () => {
    await showInstallPrompt();
    setShowModal(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 to-indigo-900 border border-white/20 rounded-3xl max-w-md w-full shadow-2xl p-8 text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
          <Image
            src="/klo2.svg"
            alt="MegaPlay"
            width={64}
            height={64}
            className="drop-shadow-2xl"
          />
        </div>

        <h2 className="text-2xl font-bold text-white mb-3">
          Install MegaPlay App
        </h2>
        
        <p className="text-white/70 mb-6">
          Install MegaPlay on your device for quick access and offline functionality
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => setShowModal(false)}
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-medium transition-all"
          >
            Not Now
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-2xl transition-all"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
