import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { timeAgo } from '../../popup/ui.js';
import Header from './Header.jsx';
import SessionPanel from './SessionPanel.jsx';
import Composer from './Composer.jsx';
import MessageItem from './MessageItem.jsx';
import { QUICK_PROMPTS } from './store.js';

const LOGO_URL = chrome.runtime.getURL('icons/icon256.png');

const PROMPT_HEAD = 3;
const RECENT_HEAD = 2;

function Empty({ state, store }) {
  const ready = store.ready();
  const [expanded, setExpanded] = useState(false);
  const prompts = expanded ? QUICK_PROMPTS : QUICK_PROMPTS.slice(0, PROMPT_HEAD);
  const rest = QUICK_PROMPTS.length - prompts.length;
  return (
    <div className="chat-empty">
      <div className="chat-empty-icon">
        <img src={LOGO_URL} alt="MAPUS" className="chat-empty-logo" draggable={false} />
      </div>
      <div className="chat-empty-title">{ready ? '可以直接问这个站点的问题' : '先配置一个大模型'}</div>
      <div className="chat-empty-desc">
        {ready
          ? `我能读取 ${state.host || '当前页面'} 的扫描结果、浏览器特征、隐私防护记录与脚本状态，也能按需查看页面结构、本地存储和接口。`
          : '支持 OpenAI 兼容接口（OpenAI / DeepSeek / Kimi / 智谱 / 通义 / Ollama 等），密钥只保存在本机。'}
      </div>
      {ready ? (
        <>
          <div className="prompt-list">
            {prompts.map(prompt => (
              <button
                key={prompt}
                type="button"
                className="prompt-chip"
                onClick={() => store.send(prompt)}
              >
                {prompt}
              </button>
            ))}
            {QUICK_PROMPTS.length > PROMPT_HEAD ? (
              <button
                type="button"
                className="prompt-more"
                onClick={() => setExpanded(value => !value)}
              >
                {expanded ? '收起' : `更多建议（${rest}）`}
              </button>
            ) : null}
          </div>
          {state.sessions.length ? (
            <div className="empty-recent">
              <div className="empty-recent-title">最近会话</div>
              {state.sessions.slice(0, RECENT_HEAD).map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="empty-recent-item"
                  onClick={() => store.openSession(item.id)}
                >
                  <span>{item.preview || '（空会话）'}</span>
                  <em>{timeAgo(item.updatedAt)}</em>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <button type="button" className="btn primary sm" onClick={() => store.switchSettings()}>去配置模型</button>
      )}
    </div>
  );
}

export default function App({ store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const logRef = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    const node = logRef.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [state.messages, state.streaming]);

  return (
    <div className="chat agent-root">
      <Header state={state} store={store} />
      <div
        className="chat-log"
        ref={logRef}
        onScroll={() => {
          const node = logRef.current;
          if (!node) return;
          stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 56;
        }}
      >
        {state.messages.length
          ? state.messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              live={state.streaming && index === state.messages.length - 1}
              mode={state.collapse || 'auto'}
              onCopy={text => store.copy(text)}
              onRetry={() => store.retry()}
            />
          ))
          : <Empty state={state} store={store} />}
      </div>
      <Composer state={state} store={store} />
      <SessionPanel state={state} store={store} />
    </div>
  );
}
