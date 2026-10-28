import { timeAgo } from '../../popup/ui.js';
import { IconClose, IconPlus, IconTrash } from './icons.jsx';

export default function SessionPanel({ state, store }) {
  const items = state.sessions || [];
  return (
    <div className="sess-wrap" data-open={state.drawer ? '1' : '0'}>
      <div className="sess-mask" onClick={() => store.toggleDrawer(false)} />
      <aside className="sess-panel">
        <div className="sess-head">
          <div className="sess-title">会话记录</div>
          <button type="button" className="icon-btn sm" onClick={() => store.newSession()} title="新对话">
            <IconPlus />
          </button>
          <button type="button" className="icon-btn sm" onClick={() => store.toggleDrawer(false)} title="关闭">
            <IconClose />
          </button>
        </div>
        <div className="sess-scope">
          <button
            type="button"
            className={state.scope === 'site' ? 'on' : ''}
            onClick={() => store.setScope('site')}
            title={state.site || '当前站点'}
          >
            本站点
          </button>
          <button
            type="button"
            className={state.scope === 'all' ? 'on' : ''}
            onClick={() => store.setScope('all')}
          >
            全部站点
          </button>
        </div>
        <div className="sess-list">
          {items.map(item => (
            <div
              key={item.id}
              className={`sess-item${state.session && state.session.id === item.id ? ' active' : ''}`}
            >
              <div
                className="sess-open"
                role="button"
                tabIndex={0}
                onClick={() => store.openSession(item.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    store.openSession(item.id);
                  }
                }}
              >
                <div className="sess-line">
                  <span className="sess-preview">{item.preview || '（空会话）'}</span>
                  <span className="sess-time">{timeAgo(item.updatedAt)}</span>
                </div>
                <div className="sess-meta">
                  {state.scope === 'all' && item.site ? <span className="sess-site">{item.site}</span> : null}
                  <span>{item.count} 条</span>
                </div>
              </div>
              <button
                type="button"
                className="sess-del"
                onClick={() => store.removeSession(item.id)}
                title="删除这条会话"
              >
                <IconTrash />
              </button>
            </div>
          ))}
          {!items.length ? (
            <div className="sess-empty">
              {state.scope === 'site' ? '这个站点还没有会话记录' : '还没有任何会话记录'}
            </div>
          ) : null}
        </div>
        <div className="sess-foot">会话保存在本地浏览器，按站点归类</div>
      </aside>
    </div>
  );
}
