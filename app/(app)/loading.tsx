/** 路由级载入骨架：覆盖 (app) 下所有页面，Neon 冷启动 / 取数期不再首屏白屏。 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="加载中">
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="sk-line" style={{ width: 160 }} />
        <div className="sk-line" style={{ width: 280, marginTop: 10 }} />
      </div>
      <div className="card pad">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="sk-row" style={{ opacity: 1 - i * 0.14 }} />
        ))}
      </div>
    </div>
  );
}
