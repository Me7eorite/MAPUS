import { useEffect, useRef, useState } from 'react';
import { IconCaretDown, IconGlobe, IconSend, IconStop } from './icons.jsx';

export default function Composer({ state, store }) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  const cardRef = useRef(null);
  const ready = store.ready();
  const config = state.config || {};
  const contextOn = config.autoContext !== false;
  const providers = store.providerList();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = Math.min(96, node.scrollHeight) + 'px';
  }, [text]);

  useEffect(() => {
    if (state.streaming) return;
    const node = ref.current;
    if (node && document.activeElement === document.body) node.focus();
  }, [state.streaming]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = event => {
      if (cardRef.current && !cardRef.current.contains(event.target)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const submit = () => {
    const value = text.trim();
    if (!value || state.streaming) return;
    store.send(value);
    setText('');
  };

  const step = state.step;
  const exhausted = state.exhausted && !state.streaming ? state.exhausted : null;

  return (
    <div className="chat-foot">
      <div className="chat-hint">
        {state.error
          ? <span className="chat-error">{state.error}</span>
          : state.streaming
            ? (
              <span className="chat-thinking">
                <span className="dot" />
                {step && step.harness
                  ? '正在思考…'
                  : step
                    ? `第 ${step.index} / ${step.total} 步 · 正在思考…`
                    : '正在读取页面…'}
              </span>
            )
            : exhausted
              ? (
                <span className="chat-exhausted">
                  已用满 {exhausted.budget} 步
                  <button type="button" className="link-btn strong" onClick={() => store.continueRun()}>接着往下跑</button>
                </span>
              )
              : ready
                ? 'Enter 发送 / Shift+Enter 换行'
                : <span>还没有配置模型，<button type="button" className="link-btn" onClick={() => store.switchSettings()}>前往设置</button></span>}
      </div>
      <div className="chat-composer" ref={cardRef}>
        <textarea
          ref={ref}
          className="chat-input"
          rows={1}
          value={text}
          placeholder={ready ? '问点什么，或让它去读当前页面…' : '先配置模型，再开始对话'}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-tools">
          <button
            type="button"
            className={`chip-btn${contextOn ? ' on' : ''}`}
            onClick={() => store.toggleContext()}
            disabled={!state.configLoaded}
            title={contextOn
              ? `站点上下文已开启：发送时会自动附带 ${state.host || '当前页面'} 的扫描结果、浏览器特征与页面数据，点击关闭`
              : '站点上下文已关闭：模型只能看到对话本身，点击开启'}
          >
            <IconGlobe />
            <span>站点上下文{contextOn && state.host ? ` · ${state.host}` : ' 关'}</span>
          </button>
          <div className="model-pick">
            <button
              type="button"
              className="chip-btn"
              onClick={() => setMenu(value => !value)}
              title="切换模型"
            >
              <span className="model-chip-name">{ready ? config.model : '未配置模型'}</span>
              <IconCaretDown />
            </button>
            {menu ? (
              <div className="model-menu" role="menu">
                <div className="model-menu-title">选择模型</div>
                {providers.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    role="menuitem"
                    className={`model-item${preset.id === config.provider ? ' active' : ''}`}
                    onClick={() => { store.selectProvider(preset.id); setMenu(false); }}
                  >
                    <b>{preset.label || preset.id}</b>
                    <span>{preset.model || '自定义接口'}</span>
                  </button>
                ))}
                {!providers.length ? <div className="model-item empty">没有可选的模型预设</div> : null}
                <button type="button" className="model-item setting" onClick={() => { store.switchSettings(); setMenu(false); }}>
                  <b>模型设置…</b>
                  <span>接口地址 / 密钥 / 参数</span>
                </button>
              </div>
            ) : null}
          </div>
          <span className="composer-flex" />
          <button
            type="button"
            className="chat-send"
            data-mode={state.streaming ? 'stop' : 'send'}
            onClick={() => (state.streaming ? store.abort() : submit())}
            title={state.streaming ? '停止生成' : '发送（Enter）'}
          >
            {state.streaming ? <IconStop /> : <IconSend />}
          </button>
        </div>
      </div>
    </div>
  );
}
