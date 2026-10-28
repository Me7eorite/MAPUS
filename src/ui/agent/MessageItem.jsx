import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from './Markdown.jsx';
import ToolCard from './ToolCard.jsx';
import ReasoningBlock from './ReasoningBlock.jsx';
import { IconChevron } from './icons.jsx';
import { textOf } from './store.js';

const LOGO_URL = chrome.runtime.getURL('icons/icon64.png');

const LONG_CHAR = 1400;
const CLAMP_CHAR = 2200;
const USER_LONG = 700;

function toBlocks(parts) {
  const blocks = [];
  for (const part of parts || []) {
    if (!part) continue;
    if (part.type === 'tool') {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'tools') last.items.push(part);
      else blocks.push({ type: 'tools', items: [part] });
      continue;
    }
    if (part.type === 'reasoning' && part.text) {
      blocks.push({ type: 'reasoning', text: part.text, step: Number(part.step) || 0 });
      continue;
    }
    if (part.type === 'text' && part.text) blocks.push({ type: 'text', text: part.text });
  }
  return blocks;
}

function measure(message, blocks) {
  let chars = 0;
  let tools = 0;
  let thinks = 0;
  for (const block of blocks) {
    if (block.type === 'tools') {
      tools += block.items.length;
      for (const item of block.items) chars += String(item.preview || '').length;
      continue;
    }
    if (block.type === 'reasoning') {
      thinks += 1;
      chars += (block.text || '').length;
      continue;
    }
    chars += (block.text || '').length;
  }
  return { chars, tools, thinks, long: chars > LONG_CHAR || tools > 5 || blocks.length > 8 };
}

function oneLine(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function Clamped({ text, max = CLAMP_CHAR }) {
  const long = (text || '').length > max;
  const [full, setFull] = useState(!long);
  useEffect(() => {
    setFull(!long);
  }, [text, long]);
  if (!long) return <Markdown text={text} />;
  return (
    <div className={`md-clamp${full ? ' full' : ''}`}>
      <div className="md-clamp-body">
        <Markdown text={full ? text : text.slice(0, max)} />
      </div>
      {!full ? (
        <button type="button" className="clamp-btn" onClick={() => setFull(true)}>
          展开全文（{text.length} 字）
        </button>
      ) : (
        <button type="button" className="clamp-btn" onClick={() => setFull(false)}>收起</button>
      )}
    </div>
  );
}

export default function MessageItem({ message, live, onCopy, onRetry, mode = 'auto' }) {
  const text = textOf(message.parts);
  const blocks = useMemo(() => toBlocks(message.parts), [message.parts]);
  const stat = useMemo(() => measure(message, blocks), [blocks]);
  const lastThinking = blocks.map(block => block.type).lastIndexOf('reasoning');
  const busy = blocks.some(block => block.type === 'tools' && block.items.some(item => item.state === 'running'));
  const usage = message.usage && message.usage.total_tokens ? message.usage.total_tokens : 0;
  const autoFold = mode === 'all' || (mode === 'auto' && stat.long && !live);
  const [open, setOpen] = useState(!autoFold);
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
  }, [mode]);
  useEffect(() => {
    if (touched.current) return;
    setOpen(!autoFold);
  }, [autoFold, message.id, mode]);

  const userFold = message.role === 'user' && mode !== 'none' && (text || '').length > USER_LONG;
  const [uOpen, setUOpen] = useState(!userFold);
  useEffect(() => {
    setUOpen(!userFold);
  }, [userFold, message.id]);

  if (message.role === 'user') {
    if (userFold && !uOpen) {
      return (
        <div className="msg user">
          <button type="button" className="bubble folded" onClick={() => setUOpen(true)}>
            <span>{oneLine(text, 90)}</span>
            <em>展开（{text.length} 字）</em>
          </button>
        </div>
      );
    }
    return (
      <div className="msg user">
        {userFold ? (
          <button type="button" className="bubble" onClick={() => setUOpen(false)}>{text}</button>
        ) : (
          <div className="bubble">{text}</div>
        )}
      </div>
    );
  }

  const summary = oneLine(text || (blocks.length ? '工具执行记录' : ''), 110);

  if (!open) {
    return (
      <div className="msg assistant">
        <div className="msg-avatar"><img src={LOGO_URL} alt="" className="msg-avatar-img" draggable={false} /></div>
        <div className="msg-main">
          <button
            type="button"
            className="msg-fold"
            onClick={() => { touched.current = true; setOpen(true); }}
          >
            <span className="fold-caret"><IconChevron /></span>
            <span className="fold-sum">{summary || '（长回复已折叠）'}</span>
            <span className="fold-meta">
              {stat.thinks ? `${stat.thinks} 步思考` : ''}
              {stat.tools ? `${stat.thinks ? ' · ' : ''}${stat.tools} 次工具` : ''}
              {stat.chars ? `${stat.thinks || stat.tools ? ' · ' : ''}${stat.chars} 字` : ''}
              {busy ? ' · 执行中' : ''}
            </span>
          </button>
          {message.error ? <div className="msg-error">{message.error}</div> : null}
          {message.aborted ? <div className="msg-note">已停止生成</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="msg assistant">
      <div className="msg-avatar"><img src={LOGO_URL} alt="" className="msg-avatar-img" draggable={false} /></div>
      <div className="msg-main">
        {blocks.map((block, index) => {
          if (block.type === 'tools') {
            return (
              <div className="tool-stack" key={`t${index}`}>
                {block.items.map(item => <ToolCard key={item.callId || index} tool={item} mode={mode} />)}
              </div>
            );
          }
          if (block.type === 'reasoning') {
            return (
              <ReasoningBlock
                key={`r${index}`}
                text={block.text}
                step={block.step}
                live={Boolean(live) && index === lastThinking}
                mode={mode}
              />
            );
          }
          return <Clamped key={`m${index}`} text={block.text} />;
        })}
        {message.error ? <div className="msg-error">{message.error}</div> : null}
        {!blocks.length && !message.error ? <div className="bubble-muted">{busy ? '正在调用工具…' : '（无内容）'}</div> : null}
        {message.aborted ? <div className="msg-note">已停止生成</div> : null}
        {(text || message.error || usage) ? (
          <div className="msg-actions">
            {text ? <button type="button" className="link-btn" onClick={() => onCopy(text)}>复制</button> : null}
            {message.error ? <button type="button" className="link-btn" onClick={onRetry}>重试</button> : null}
            <button
              type="button"
              className="link-btn"
              onClick={() => { touched.current = true; setOpen(false); }}
            >收起</button>
            {usage ? <span className="msg-usage">{usage} tokens</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
