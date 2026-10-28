"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "./auth-context";
import { ThemeProvider } from "./theme-context";
import { PwaRegister } from "@/components/PwaRegister";
import { ToastProvider } from "@/components/ToastProvider";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { MaintenanceNotice } from "@/components/MaintenanceNotice";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AuthProvider>
          <ConfirmProvider>
            <PwaRegister />
            <ToastProvider />
            <MaintenanceNotice />
            {children}
          </ConfirmProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
