"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

interface State extends ConfirmOptions {
  open: boolean;
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm: ConfirmFn = useCallback(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, open: true, resolve });
      }),
    [],
  );

  const close = (value: boolean) => {
    if (!state) return;
    state.resolve(value);
    setState(null);
    setBusy(false);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state?.open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && close(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              {state.destructive && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              )}
              <div className="flex-1">
                <h2 className="font-semibold">{state.title}</h2>
                {state.description && (
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">
                    {state.description}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => close(false)}
                disabled={busy}
              >
                {state.cancelLabel ?? "ยกเลิก"}
              </Button>
              <Button
                variant={state.destructive ? "destructive" : "default"}
                className="flex-1"
                onClick={() => { setBusy(true); close(true); }}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (state.confirmLabel ?? "ตกลง")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useConfirm must be used inside ConfirmProvider");
  return fn;
}
