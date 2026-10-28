import { useEffect, useRef, useState } from 'react';
import { IconChevron } from './icons.jsx';

const short = (value, max) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
};

const argSummary = args => {
  const entries = Object.entries(args || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!entries.length) return '';
  return entries.map(([key, value]) => `${key}: ${short(value, 26)}`).join(' · ');
};

const pretty = value => {
  if (typeof value !== 'string') return JSON.stringify(value || {}, null, 2);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch (_) {
    return value;
  }
};

const duration = ms => {
  if (!ms || ms < 60) return '';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
};

export default function ToolCard({ tool, mode = 'auto' }) {
  const state = tool.state === 'running' ? 'running' : tool.ok === false ? 'error' : 'done';
  const label = state === 'running' ? '执行中' : state === 'error' ? '失败' : '完成';
  const summary = argSummary(tool.args);
  const ms = duration(tool.ms);
  const defaultOpen = mode === 'none' ? true : mode === 'all' ? false : state === 'running';
  const [open, setOpen] = useState(defaultOpen);
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
  }, [mode]);
  useEffect(() => {
    if (touched.current) return;
    setOpen(state === 'running' ? true : defaultOpen);
  }, [state, defaultOpen, mode]);
  const toggle = () => {
    touched.current = true;
    setOpen(value => !value);
  };
  const previewText = String(tool.preview || '');
  const longPreview = previewText.length > 500;
  const peek = state === 'error' ? previewText : previewText.slice(0, 160);
  return (
    <div className={`tool-card${state === 'error' ? ' bad' : ''}${open ? ' open' : ''}`} data-state={state}>
      <button type="button" className="tool-head" onClick={toggle}>
        <span className="tool-dot" />
        {tool.step ? <span className="tool-step">{tool.step}</span> : null}
        <span className="tool-name">{tool.name}</span>
        {summary ? <span className="tool-args-sum">{summary}</span> : null}
        <span className="tool-state">
          {state === 'running' ? <i className="tool-spin" /> : null}
          {ms ? <em className="tool-ms">{ms}</em> : null}
          {label}
        </span>
        <span className="tool-caret"><IconChevron /></span>
      </button>
      {tool.shot && !open ? (
        <button type="button" className="tool-shot-thumb" onClick={() => { touched.current = true; setOpen(true); }} title="展开截图">
          <img src={tool.shot} alt="页面截图" />
        </button>
      ) : null}
      {!open && peek ? <div className="tool-peek">{peek}{longPreview ? '…' : ''}</div> : null}
      {open ? (
        <div className="tool-body">
          {tool.shot ? (
            <div className="tool-shot-wrap">
              <img className="tool-shot" src={tool.shot} alt="页面截图" />
            </div>
          ) : null}
          <div className="tool-line">参数</div>
          <pre className="tool-args">{pretty(tool.args)}</pre>
          {tool.preview ? <div className="tool-line">返回</div> : null}
          {tool.preview ? <pre className="tool-preview">{pretty(tool.preview)}</pre> : null}
          <button type="button" className="clamp-btn" onClick={toggle}>收起</button>
        </div>
      ) : null}
    </div>
  );
}
