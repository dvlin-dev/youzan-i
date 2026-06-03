import Link from "next/link";

import { Icon } from "@/components/icons";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import type { SessionUser } from "@/lib/session";

import type { NavItem } from "../types";

/** 侧栏：导航 + 角色切换 + 当前用户 / 退出。纯展示，状态与动作经 props 回调。 */
export function Sidebar({
  user,
  nav,
  path,
  pendingCount,
  navOpen,
  onNavClick,
  onSwitchRole,
  onLogout,
}: {
  user: SessionUser;
  nav: NavItem[];
  path: string;
  pendingCount: number;
  navOpen: boolean;
  onNavClick: () => void;
  onSwitchRole: (r: Role) => void;
  onLogout: () => void;
}) {
  return (
    <aside className={"sidebar" + (navOpen ? " open" : "")}>
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
        <Link
          key={href}
          href={href}
          className={"nav-item" + (path === href ? " active" : "")}
          onClick={onNavClick}
        >
          <Icon name={icon} />
          <span>{label}</span>
          {href === "/move" && pendingCount > 0 && (
            <span className="badge-n">{pendingCount}</span>
          )}
        </Link>
      ))}

      <div className="sb-spacer" />
      <div className="userbox">
        <div className="nav-label" style={{ padding: "0 4px 8px" }}>
          切换演示角色
        </div>
        <div className="roles">
          {(["warehouse", "buyer", "admin"] as Role[]).map((r) => (
            <button
              key={r}
              className={"role-btn" + (user.role === r ? " active" : "")}
              onClick={() => onSwitchRole(r)}
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
            aria-label="退出登录"
            style={{ marginLeft: "auto", color: "#857c68" }}
            onClick={onLogout}
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
