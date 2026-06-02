"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "./icons";
import { ToastProvider } from "./toast";
import { Copilot } from "./Copilot";
import { switchRole, logoutAction } from "@/lib/actions";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import type { SessionUser } from "@/lib/session";

const NAV: Record<Role, [string, string, string][]> = {
  warehouse: [
    ["/dashboard", "仪表盘", "dash"],
    ["/stock", "库存", "box"],
    ["/move", "入库 / 出库", "in"],
  ],
  buyer: [
    ["/dashboard", "仪表盘", "dash"],
    ["/stock", "库存", "box"],
    ["/purchase", "采购单", "cart"],
    ["/stocktake", "盘点对账", "scale"],
  ],
  admin: [
    ["/dashboard", "仪表盘", "dash"],
    ["/stock", "库存", "box"],
    ["/move", "入库 / 出库", "in"],
    ["/purchase", "采购单", "cart"],
    ["/stocktake", "盘点对账", "scale"],
  ],
};
const TITLES: Record<string, string> = {
  "/dashboard": "仪表盘",
  "/stock": "库存",
  "/move": "入库 / 出库",
  "/purchase": "采购单",
  "/stocktake": "盘点对账",
};

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
  const [, startTransition] = useTransition();
  const nav = NAV[user.role];
  const title = TITLES[path] ?? "";

  return (
    <ToastProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo">
              <Icon name="box" size={18} />
            </span>
            <div>
              <div className="name">云链进销存</div>
              <div className="sub">服装批发 · Demo</div>
            </div>
          </div>
          <div className="nav-label">主菜单</div>
          {nav.map(([href, label, icon]) => (
            <Link key={href} href={href} className={"nav-item" + (path === href ? " active" : "")}>
              <Icon name={icon} />
              <span>{label}</span>
              {href === "/move" && pendingCount > 0 && <span className="badge-n">{pendingCount}</span>}
            </Link>
          ))}

          <div className="sb-spacer" />
          <div className="userbox">
            <div className="nav-label" style={{ padding: "0 4px 8px" }}>切换演示角色</div>
            <div className="roles">
              {(["warehouse", "buyer", "admin"] as Role[]).map((r) => (
                <button
                  key={r}
                  className={"role-btn" + (user.role === r ? " active" : "")}
                  onClick={() =>
                    startTransition(async () => {
                      await switchRole(r);
                      router.replace("/dashboard");
                      router.refresh();
                    })
                  }
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <div className="me">
              <span className="avatar">{user.name.slice(0, 1)}</span>
              <div className="info">
                <b>{user.name}</b>
                <span>{ROLE_LABEL[user.role]}</span>
              </div>
              <button
                className="icon-btn"
                title="退出登录"
                style={{ marginLeft: "auto", color: "#857c68" }}
                onClick={() =>
                  startTransition(async () => {
                    await logoutAction();
                    router.replace("/login");
                  })
                }
              >
                <Icon name="logout" size={17} />
              </button>
            </div>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="page-title">{title}</div>
            <div className="spacer" />
            <button className="ai-btn" onClick={() => setAi(true)}>
              <Icon name="spark" size={16} />
              AI 助手
            </button>
          </header>
          <main className="content">
            <div className="content-inner">{children}</div>
          </main>
        </div>

        {ai && <Copilot role={user.role} onClose={() => setAi(false)} />}
      </div>
    </ToastProvider>
  );
}
