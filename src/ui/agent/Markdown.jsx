import { Fragment } from 'react';
import { parseBlocks, parseInline, safeHref } from './markdown.js';

function withBreaks(text, keyPrefix) {
  return String(text).split('\n').map((part, index) => (
    index === 0
      ? <Fragment key={`${keyPrefix}t${index}`}>{part}</Fragment>
      : <Fragment key={`${keyPrefix}t${index}`}><br />{part}</Fragment>
  ));
}

function Inline({ text }) {
  return parseInline(text).map((token, index) => {
    if (token.type === 'code') return <code key={index}>{token.text}</code>;
    if (token.type === 'strong') return <strong key={index}>{token.text}</strong>;
    if (token.type === 'em') return <em key={index}>{token.text}</em>;
    if (token.type === 'del') return <del key={index}>{token.text}</del>;
    if (token.type === 'link') {
      const href = safeHref(token.href);
      if (!href) return <Fragment key={index}>{token.text}</Fragment>;
      return (
        <a key={index} href={href} target="_blank" rel="noreferrer noopener">
          {token.text || href}
        </a>
      );
    }
    if (token.type === 'image') {
      const href = safeHref(token.href);
      const label = token.alt || token.href || '图片';
      if (!href) return <Fragment key={index}>图片：{label}</Fragment>;
      return (
        <a key={index} className="md-img-ref" href={href} target="_blank" rel="noreferrer noopener">
          图片：{label}
        </a>
      );
    }
    return <Fragment key={index}>{withBreaks(token.text, index)}</Fragment>;
  });
}

function Align({ value }) {
  return value ? { textAlign: value } : undefined;
}

function Items({ block }) {
  return block.items.map((item, index) => {
    if (item && typeof item === 'object') {
      return (
        <li key={index} className="md-task" data-checked={item.checked ? '1' : '0'}>
          <span className="md-check" />
          <Inline text={item.text} />
        </li>
      );
    }
    return <li key={index}><Inline text={item} /></li>;
  });
}

function Block({ block }) {
  if (block.type === 'code') {
    return (
      <pre className="md-code">
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.type === 'table') {
    return (
      <div className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              {block.head.map((cell, index) => (
                <th key={index} style={Align({ value: block.align[index] })}><Inline text={cell} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} style={Align({ value: block.align[cellIndex] })}><Inline text={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === 'hr') return <hr className="md-hr" />;
  if (block.type === 'quote') {
    return (
      <blockquote className="md-quote">
        <Inline text={block.text} />
      </blockquote>
    );
  }
  if (block.type === 'heading') {
    return <div className="md-h" data-level={block.level}><Inline text={block.text} /></div>;
  }
  if (block.type === 'ul' || block.type === 'ol') {
    const Tag = block.type === 'ul' ? 'ul' : 'ol';
    return (
      <Tag className={block.task ? 'md-list-task' : undefined}>
        <Items block={block} />
      </Tag>
    );
  }
  return <p><Inline text={block.text} /></p>;
}

export default function Markdown({ text, className = 'md' }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((block, index) => <Block key={index} block={block} />)}
    </div>
  );
}
