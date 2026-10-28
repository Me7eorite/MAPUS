import { useEffect, useRef, useState } from 'react';
import { IconChevron } from './icons.jsx';

const oneLine = (value, max) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
};

export default function ReasoningBlock({ text, step, live, mode = 'auto' }) {
  const defaultOpen = mode === 'none' ? true : Boolean(live);
  const [open, setOpen] = useState(defaultOpen);
  const touched = useRef(false);
  const [full, setFull] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    touched.current = false;
  }, [mode]);
  useEffect(() => {
    if (touched.current) return;
    setOpen(mode === 'none' ? true : mode === 'all' ? false : Boolean(live));
  }, [live, mode]);

  useEffect(() => {
    if (!open) return;
    const node = bodyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [text, open, live]);

  const chars = (text || '').length;
  const long = chars > 700;
  const shown = !long || full ? text || '' : (text || '').slice(0, 700);
  return (
    <div className={`think${open ? ' open' : ''}`} data-live={live ? '1' : '0'}>
      <button type="button" className="think-head" onClick={() => { touched.current = true; setOpen(value => !value); }}>
        <span className="think-dot" />
        <span className="think-title">{live ? '正在思考' : '思考过程'}</span>
        {step ? <span className="think-step">第 {step} 步</span> : null}
        <span className="think-meta">{chars} 字</span>
        <span className="think-caret"><IconChevron /></span>
      </button>
      {!open && !live ? <div className="think-peek">{oneLine(text, 120)}</div> : null}
      {open ? (
        <div className="think-body" ref={bodyRef}>
          {shown}
          {long ? (
            <button type="button" className="clamp-btn" onClick={() => setFull(value => !value)}>
              {full ? '收起思考' : `展开全部 ${chars} 字`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
