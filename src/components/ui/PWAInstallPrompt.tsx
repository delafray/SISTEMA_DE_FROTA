'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Detectar se é dispositivo móvel (celular/tablet)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (!isMobile) return

    // Detectar iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(ios)

    // Detectar se já está instalado
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsStandalone(standalone)

    // Verificar se já foi dispensado anteriormente
    const wasDismissed = localStorage.getItem('pwa-install-dismissed')
    if (wasDismissed) return

    // Capturar evento de instalação (Android)
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // No iOS, mostrar banner após 3s se não estiver instalado
    if (ios && !standalone) {
      const timer = setTimeout(() => setShowBanner(true), 3000)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShowBanner(false)
        setDeferredPrompt(null)
      }
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  // Service Worker: cache offline ciente de versao (ver public/sw.js + swCache.ts).
  // Registramos com ?v=<build sha>: quando o deploy muda o SHA, a URL muda, o
  // browser instala o SW novo e o activate purga o cache da versao anterior — o
  // que evita o bug antigo de "bundle preso" (HTML usa rede-primeiro; assets com
  // hash usam cache-first). updateViaCache:'none' garante que o proprio sw.js
  // nunca venha do HTTP cache.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const versao = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev'
    navigator.serviceWorker
      .register(`/sw.js?v=${versao}`, { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.error('SW registration failed:', err))
  }, [])

  if (isStandalone || dismissed || !showBanner) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 2rem)',
        maxWidth: '420px',
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '16px',
        padding: '1rem 1.25rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        animation: 'slideUp 0.4s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Ícone */}
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '22px',
      }}>
        🚛
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: '#f1f5f9', fontWeight: 600, fontSize: '0.875rem' }}>
          📲 Instalar FROTA
        </p>
        {isIOS ? (
          <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.75rem' }}>
            Pra usar <strong style={{ color: '#a5b4fc' }}>sem internet</strong>: <strong style={{ color: '#6366f1' }}>Compartilhar ⎋</strong> → &quot;Adicionar à Tela de Início&quot;
          </p>
        ) : (
          <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.75rem' }}>
            Instale pra usar a rota e capturar notas <strong style={{ color: '#a5b4fc' }}>sem internet</strong>
          </p>
        )}
      </div>

      {/* Botões */}
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        {!isIOS && deferredPrompt && (
          <button
            onClick={handleInstall}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Instalar
          </button>
        )}
        <button
          onClick={handleDismiss}
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: '#94a3b8',
            border: 'none',
            borderRadius: '8px',
            padding: '0.4rem 0.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            lineHeight: 1,
          }}
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
