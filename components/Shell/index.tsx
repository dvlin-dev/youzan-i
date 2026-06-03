"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Copilot } from "@/components/Copilot";
import { ToastProvider } from "@/components/toast";
import { logoutAction, switchRole } from "@/lib/actions";
import { type Role } from "@/lib/constants";
import type { SessionUser } from "@/lib/session";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { NAV, TITLES } from "./types";

export function Shell({
  user,
  pendingCount,
  children,
}: {
  user: SessionUser;
  pendingCount: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [ai, setAi] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [, startTransition] = useTransition();
  const nav = NAV[user.role];
  const title = TITLES[path] ?? "";

  function handleSwitchRole(r: Role) {
    startTransition(async () => {
      await switchRole(r);
      router.replace("/dashboard");
      router.refresh();
    });
  }
  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
      router.replace("/login");
    });
  }

  return (
    <ToastProvider>
      <div className={"app" + (navOpen ? " nav-open" : "")}>
        {navOpen && (
          <div className="nav-scrim" onClick={() => setNavOpen(false)} />
        )}
        <Sidebar
          user={user}
          nav={nav}
          path={path}
          pendingCount={pendingCount}
          navOpen={navOpen}
          onNavClick={() => setNavOpen(false)}
          onSwitchRole={handleSwitchRole}
          onLogout={handleLogout}
        />

        <div className="main">
          <Topbar
            title={title}
            navOpen={navOpen}
            onToggleNav={() => setNavOpen((v) => !v)}
            onOpenAi={() => setAi(true)}
          />
          <main className="content">
            <div className="content-inner">{children}</div>
          </main>
        </div>

        {ai && <Copilot role={user.role} onClose={() => setAi(false)} />}
      </div>
    </ToastProvider>
  );
}
