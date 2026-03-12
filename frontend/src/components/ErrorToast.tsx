// src/components/ErrorToast.tsx
// Drop this anywhere in your app to show error notifications

import { useEffect, useState } from "react"
import { X, AlertTriangle } from "lucide-react"

interface Props {
  message: string
  onClose: () => void
  duration?: number // ms, default 6000
}

export default function ErrorToast({ message, onClose, duration = 6000 }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="bg-[#1e1e2e] border border-red-700 rounded-xl shadow-2xl px-5 py-4 flex items-start gap-3 max-w-md w-full">
        <AlertTriangle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
        <div className="flex-1">
          <p className="text-white text-sm font-semibold">Something went wrong</p>
          <p className="text-slate-400 text-xs mt-1">{message}</p>
          <p className="text-slate-500 text-xs mt-2">
            ✅ Our team has been notified and will fix this shortly.
          </p>
        </div>
        <button onClick={() => { setVisible(false); setTimeout(onClose, 300) }} className="text-slate-500 hover:text-white">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}