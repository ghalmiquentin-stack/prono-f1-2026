import { useState, useCallback } from 'react'
import { usePlayer } from './hooks/usePlayer'
import BottomNav from './components/BottomNav'
import { ToastContainer } from './components/Toast'
import Onboarding from './screens/Onboarding'
import Accueil from './screens/Accueil'
import Courses from './screens/Courses'
import Classement from './screens/Classement'
import Stats from './screens/Stats'
import Administration from './screens/Administration'

let _toastId = 0

export default function App() {
  const { playerId, setPlayerId, logout } = usePlayer()
  const [activeTab, setActiveTab] = useState('accueil')
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  if (!playerId) {
    return (
      <>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <Onboarding onSelectPlayer={setPlayerId} />
      </>
    )
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'accueil':
        return <Accueil currentPlayerId={playerId} setActiveTab={setActiveTab} />
      case 'courses':
        return <Courses currentPlayerId={playerId} addToast={addToast} />
      case 'classement':
        return <Classement currentPlayerId={playerId} />
      case 'stats':
        return <Stats currentPlayerId={playerId} />
      case 'admin':
        return <Administration addToast={addToast} currentPlayerId={playerId} onChangePlayer={logout} />
      default:
        return <Accueil currentPlayerId={playerId} setActiveTab={setActiveTab} />
    }
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-bg">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Main content - scrolls internally, nav stays pinned below */}
      <main className="flex-1 overflow-y-auto safe-top" id="app-main">
        {renderScreen()}
        {/* Spacer so last content clears the sticky nav */}
        <div className="h-4" />
      </main>

      {/* Bottom navigation - sticky in flex flow, immune to Chrome iOS toolbar */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  )
}
