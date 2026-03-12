// src/components/ErrorToast.tsx
import { useState, useEffect } from "react"
import { X, AlertTriangle } from "lucide-react"

interface Toast {
  id: number
  message: string
  type: "error" | "warning" | "info"
}

const listeners: ((toast: Toast) => void)[] = []

export function showErrorToast(message: string, type: Toast["type"] = "error") {
  const toast: Toast = { id: Date.now(), message, type }
  listeners.forEach((l) => l(toast))
}

export default function ErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (toast: Toast) => {
      setToasts((prev) => [...prev, toast])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 6000)
    }
    listeners.push(handler)
    return () => {
      const idx = listeners.indexOf(handler)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border text-sm
            ${toast.type === "error"
              ? "bg-red-900/90 border-red-700 text-red-100"
              : toast.type === "warning"
              ? "bg-yellow-900/90 border-yellow-700 text-yellow-100"
              : "bg-blue-900/90 border-blue-700 text-blue-100"
            }`}
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="flex-shrink-0 opacity-70 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}