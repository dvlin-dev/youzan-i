"use client";
import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; msg: string; type: "ok" | "err" };
type ToastFn = (msg: string, type?: "ok" | "err") => void;

const Ctx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [ts, setTs] = useState<Toast[]>([]);
  const toast = useCallback<ToastFn>((msg, type = "ok") => {
    const id = Date.now() + Math.random();
    setTs((t) => [...t, { id, msg, type }]);
    setTimeout(() => setTs((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts">
        {ts.map((t) => (
          <div
            key={t.id}
            className={"toast " + (t.type === "err" ? "err" : "")}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
