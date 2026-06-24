"use client";

import { useEffect, useState, useCallback } from "react";

interface ToastMessage {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

let addToastGlobal: ((message: string, type: "error" | "success" | "info") => void) | null = null;

export function showToast(message: string, type: "error" | "success" | "info" = "error") {
  if (addToastGlobal) {
    addToastGlobal(message, type);
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: "error" | "success" | "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    addToastGlobal = addToast;
    return () => {
      addToastGlobal = null;
    };
  }, [addToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-md">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-item flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border cursor-pointer ${
            toast.type === "error"
              ? "bg-red-500/10 border-red-500/30 text-red-300"
              : toast.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-blue-500/10 border-blue-500/30 text-blue-300"
          }`}
          onClick={() => removeToast(toast.id)}
        >
          <span className="text-lg">
            {toast.type === "error" ? "✕" : toast.type === "success" ? "✓" : "ℹ"}
          </span>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
