import { IconFold, IconFoldAll, IconInfo, IconList, IconPlus } from './icons.jsx';

const COLLAPSE_TITLE = {
  auto: '折叠：自动（长回复默认收起）',
  all: '折叠：全部收起',
  none: '折叠：全部展开'
};

export default function Header({ state, store }) {
  const ready = store.ready();
  const dot = !state.configLoaded ? 'idle' : !ready ? 'off' : state.streaming ? 'busy' : 'ok';
  const name = !state.configLoaded ? '读取配置中…' : ready ? state.config.model : '未配置模型';
  const parts = [];
  if (ready) parts.push(store.label());
  parts.push(state.findings ? `页面数据 ${state.findings} 条` : '页面暂无扫描数据');
  if (ready && state.config && state.config.streaming) parts.push('流式');
  const sub = !state.configLoaded ? '—' : ready ? parts.filter(Boolean).join(' · ') : '去「设置 → 智能体模型」填写接口与密钥';
  const foreign = state.session && state.session.site && state.host && state.session.site !== state.host;
  return (
    <div className="chat-head">
      <div className="chat-model">
        <span className="chat-dot" data-state={dot} />
        <div className="chat-model-text">
          <div className="chat-model-name">{name}</div>
          <div className="chat-model-sub">
            {foreign ? <span className="sess-origin" title={state.session.url}>{state.session.site}</span> : null}
            {sub}
          </div>
        </div>
      </div>
      <div className="chat-head-actions">
        <button
          type="button"
          className={`icon-btn sm${state.collapse !== 'auto' ? ' on' : ''}`}
          onClick={() => store.cycleCollapse()}
          title={COLLAPSE_TITLE[state.collapse] || COLLAPSE_TITLE.auto}
          data-collapse={state.collapse}
        >
          {state.collapse === 'all' ? <IconFoldAll /> : <IconFold />}
        </button>
        <button
          type="button"
          className={`icon-btn sm${state.drawer ? ' on' : ''}`}
          onClick={() => store.toggleDrawer()}
          title="会话记录"
        >
          <IconList />
          {state.sessions.length ? <i className="btn-dot" /> : null}
        </button>
        <button type="button" className="icon-btn sm" onClick={() => store.newSession()} title="新对话">
          <IconPlus />
        </button>
        <button type="button" className="icon-btn sm" onClick={() => store.showContext()} title="复制将发送的上下文摘要">
          <IconInfo />
        </button>
      </div>
    </div>
  );
}
