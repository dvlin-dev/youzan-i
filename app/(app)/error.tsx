"use client";

/** 路由级错误边界：取数 / 渲染抛错时给中文友好提示 + 重试，而非撞 Next 默认报错页。 */
export default function RouteError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="empty" style={{ padding: "60px 20px" }}>
      <div className="e-ic">!</div>
      <h3>页面没能加载出来</h3>
      <p className="dim" style={{ marginTop: 4 }}>
        数据加载失败（可能是网络或服务抖动），重试一下试试。
      </p>
      <button className="btn primary" style={{ marginTop: 14 }} onClick={reset}>
        重试
      </button>
    </div>
  );
}
