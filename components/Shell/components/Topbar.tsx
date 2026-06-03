import { Icon } from "@/components/icons";

/** 顶栏：汉堡（移动端开合侧栏）+ 页面标题 + AI 助手按钮。纯展示，动作经 props 回调。 */
export function Topbar({
  title,
  navOpen,
  onToggleNav,
  onOpenAi,
}: {
  title: string;
  navOpen: boolean;
  onToggleNav: () => void;
  onOpenAi: () => void;
}) {
  return (
    <header className="topbar">
      <button
        className="icon-btn nav-toggle"
        onClick={onToggleNav}
        aria-label="打开菜单"
        aria-expanded={navOpen}
      >
        <Icon name="menu" size={20} />
      </button>
      <div className="page-title">{title}</div>
      <div className="spacer" />
      <button className="ai-btn" onClick={onOpenAi}>
        <Icon name="spark" size={16} />
        AI 助手
      </button>
    </header>
  );
}
