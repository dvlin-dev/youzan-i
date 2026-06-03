"use client";
import { useActionState, useState } from "react";

import { loginAction } from "@/lib/actions";
import { DEMO_USERS, ROLE_LABEL, type Role } from "@/lib/constants";

import { Icon } from "./icons";

export function LoginForm() {
  const [role, setRole] = useState<Role>(DEMO_USERS[0].role);
  const [email, setEmail] = useState(DEMO_USERS[0].email);
  const [pw, setPw] = useState(DEMO_USERS[0].password);
  const [err, action, pending] = useActionState(loginAction, null);

  function pick(r: Role) {
    const u = DEMO_USERS.find((x) => x.role === r)!;
    setRole(r);
    setEmail(u.email);
    setPw(u.password);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        className="card pad"
        style={{ width: 400, maxWidth: "94vw", padding: 26 }}
      >
        <div className="row" style={{ gap: 11, marginBottom: 6 }}>
          <span
            className="brand-logo"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg,#15857a,#0b5048)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
            }}
          >
            <Icon name="box" size={20} />
          </span>
          <div>
            <div
              className="display"
              style={{ fontWeight: 700, fontSize: 18, color: "var(--ink)" }}
            >
              云链进销存
            </div>
            <div className="dim" style={{ fontSize: 12 }}>
              服装批发 · AI-Native
            </div>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 13, margin: "10px 0 16px" }}>
          演示账号已<b style={{ color: "var(--text-2)" }}>预填好</b>
          ，选个角色直接点「登录」即可（也可手改）。
        </p>

        <div
          className="roles"
          style={{ background: "var(--surface-2)", marginBottom: 16 }}
        >
          {DEMO_USERS.map((u) => (
            <button
              key={u.role}
              type="button"
              onClick={() => pick(u.role)}
              className="role-btn"
              style={
                role === u.role
                  ? { background: "var(--primary-600)", color: "#fff" }
                  : { color: "var(--text-2)" }
              }
            >
              {ROLE_LABEL[u.role]}
            </button>
          ))}
        </div>

        <form action={action}>
          <div className="field">
            <label>邮箱</label>
            <input
              className="input"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              className="input"
              name="password"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {err && (
            <div className="field-err" style={{ marginBottom: 12 }}>
              {err}
            </div>
          )}
          <button
            className="btn primary"
            type="submit"
            disabled={pending}
            style={{ width: "100%", justifyContent: "center", padding: "11px" }}
          >
            {pending ? "登录中…" : `以「${ROLE_LABEL[role]}」登录`}
          </button>
        </form>

        <div
          className="dim"
          style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}
        >
          仓管：只看库存 + 录出入库　采购：下采购单 + 对账　老板：全局 + 过账
        </div>
      </div>
    </div>
  );
}
