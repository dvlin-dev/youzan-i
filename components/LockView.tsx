import { Icon } from "./icons";

export function LockView({ name }: { name: string }) {
  return (
    <div className="empty" style={{ padding: "90px 20px" }}>
      <div className="e-ic">
        <Icon name="lock" size={26} />
      </div>
      <h3>当前角色无权访问「{name}」</h3>
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        权限在<b>数据层</b>真实生效（接口 403 +
        字段脱敏），不是前端藏按钮。用左下角切到有权限的角色即可查看。
      </div>
    </div>
  );
}
