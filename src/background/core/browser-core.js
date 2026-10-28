(function () {
  'use strict';
  if (self.MAPUS_BROWSER) return;

  const DV = '1.3';
  const NET_MAX = 400;
  const LOG_MAX = 300;
  const REF_MAX = 300;
  const SHOT_MAX = 3;
  const SHOT_KEY = 'mapus_shots';

  const sessions = new Map();
  let listenersReady = false;

  const now = () => Date.now();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  const clip = (value, max) => {
    const text = typeof value === 'string' ? value : String(value === undefined || value === null ? '' : value);
    return text.length > max ? text.slice(0, max) + '…' : text;
  };

  function blank(tabId) {
    return {
      tabId,
      attached: false,
      external: false,
      enabled: new Set(),
      net: new Map(),
      netOrder: [],
      netLastAt: 0,
      attachedAt: 0,
      logs: [],
      dialogs: [],
      dialogPolicy: { accept: true, promptText: '' },
      refs: new Map(),
      refSeq: 0,
      failing: false,
      lastError: ''
    };
  }

  function isInternal(url) {
    return !/^https?:\/\//i.test(String(url || ''));
  }

  function ensureListeners() {
    if (listenersReady) return;
    listenersReady = true;
    chrome.debugger.onEvent.addListener((source, method, params) => {
      const state = sessions.get(source.tabId);
      if (!state) return;
      try { onEvent(source.tabId, state, method, params || {}); } catch (_) { }
    });
    chrome.debugger.onDetach.addListener((source, reason) => {
      const state = sessions.get(source.tabId);
      if (!state) return;
      state.attached = false;
      if (reason === 'target_closed' || reason === 'canceled_by_user') sessions.delete(source.tabId);
    });
  }

  function onEvent(tabId, state, method, params) {
    if (method === 'Network.requestWillBeSent') {
      const id = params.requestId;
      if (!id) return;
      const request = params.request || {};
      state.netLastAt = now();
      state.net.set(id, {
        id,
        url: clip(request.url || '', 400),
        method: request.method || 'GET',
        type: params.type || '',
        startedAt: now(),
        postData: request.postData ? clip(request.postData, 1200) : '',
        requestHeaders: request.headers || {},
        status: 0,
        mime: '',
        size: 0,
        ms: 0,
        failed: ''
      });
      state.netOrder.push(id);
      if (state.netOrder.length > NET_MAX) {
        const drop = state.netOrder.shift();
        state.net.delete(drop);
      }
      return;
    }
    if (method === 'Network.responseReceived') {
      const record = state.net.get(params.requestId);
      if (!record) return;
      const response = params.response || {};
      record.status = Number(response.status) || 0;
      record.mime = response.mimeType || '';
      record.responseHeaders = response.headers || {};
      return;
    }
    if (method === 'Network.loadingFinished') {
      const record = state.net.get(params.requestId);
      if (!record) return;
      record.size = Number(params.encodedDataLength) || 0;
      record.ms = now() - record.startedAt;
      state.netLastAt = now();
      return;
    }
    if (method === 'Network.loadingFailed') {
      const record = state.net.get(params.requestId);
      if (!record) return;
      record.failed = params.errorText || 'failed';
      record.ms = now() - record.startedAt;
      return;
    }
    if (method === 'Runtime.consoleAPICalled') {
      pushLog(state, {
        level: String(params.type || 'log'),
        text: (params.args || []).map(renderRemote).join(' '),
        url: (params.stackTrace && params.stackTrace.callFrames && params.stackTrace.callFrames[0])
          ? params.stackTrace.callFrames[0].url : '',
        at: now()
      });
      return;
    }
    if (method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails || {};
      pushLog(state, {
        level: 'error',
        text: (detail.exception && (detail.exception.description || detail.exception.value)) || detail.text || '未捕获异常',
        url: detail.url || '',
        line: detail.lineNumber,
        at: now(),
        exception: true
      });
      return;
    }
    if (method === 'Log.entryAdded') {
      const entry = params.entry || {};
      pushLog(state, {
        level: entry.level || 'info',
        text: entry.text || '',
        url: entry.url || '',
        at: now()
      });
      return;
    }
    if (method === 'Page.javascriptDialogOpening') {
      const dialog = {
        type: params.type || 'alert',
        message: params.message || '',
        defaultPrompt: params.defaultPrompt || '',
        at: now(),
        handled: false
      };
      state.dialogs.push(dialog);
      if (state.dialogs.length > 30) state.dialogs.shift();
      const policy = state.dialogPolicy || { accept: true };
      chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', {
        accept: policy.accept !== false,
        promptText: policy.promptText || ''
      }).then(() => { dialog.handled = true; }).catch(() => { });
      return;
    }
    if (method === 'Page.frameNavigated' && params.frame && !params.frame.parentId) {
      state.refs.clear();
      state.refSeq = 0;
    }
  }

  function renderRemote(arg) {
    if (!arg) return '';
    if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
    if (arg.description) return arg.description;
    if (arg.unserializableValue) return arg.unserializableValue;
    return arg.type || '';
  }

  function pushLog(state, item) {
    state.logs.push(item);
    if (state.logs.length > LOG_MAX) state.logs.shift();
  }

  async function attach(tabId) {
    ensureListeners();
    const id = Number(tabId);
    if (!Number.isFinite(id)) throw new Error('无效的 tabId');
    let state = sessions.get(id);
    if (state && state.attached) return state;
    if (!state) {
      state = blank(id);
      sessions.set(id, state);
    }
    try {
      await chrome.debugger.attach({ tabId: id }, DV);
      state.external = false;
    } catch (error) {
      const message = String((error && error.message) || '');
      if (/already attached/i.test(message)) {
        state.external = true;
      } else {
        sessions.delete(id);
        throw new Error('无法附加调试器：' + message);
      }
    }
    state.attached = true;
    if (!state.attachedAt) state.attachedAt = now();
    await enableAll(id, state);
    return state;
  }

  async function enableAll(tabId, state) {
    const plan = [
      ['Page.enable', {}],
      ['Runtime.enable', {}],
      ['Network.enable', { maxPostDataSize: 65536 }],
      ['Log.enable', {}],
      ['DOM.enable', {}]
    ];
    for (const [method, params] of plan) {
      const domain = method.split('.')[0];
      if (state.enabled.has(domain)) continue;
      try {
        await chrome.debugger.sendCommand({ tabId }, method, params);
        state.enabled.add(domain);
      } catch (_) { }
    }
  }

  async function send(tabId, method, params) {
    const id = Number(tabId);
    const state = await attach(id);
    try {
      return await chrome.debugger.sendCommand({ tabId: id }, method, params || {});
    } catch (error) {
      const message = String((error && error.message) || '');
      if (/not attached|detached/i.test(message)) {
        state.attached = false;
        state.enabled.clear();
        await attach(id);
        return await chrome.debugger.sendCommand({ tabId: id }, method, params || {});
      }
      throw new Error(method + ' 失败：' + message);
    }
  }

  function describeException(details) {
    if (!details) return '未知异常';
    const exception = details.exception;
    const text = (exception && (exception.description || exception.value)) || details.text || '异常';
    const line = Number.isFinite(details.lineNumber) ? `（第 ${details.lineNumber + 1} 行）` : '';
    return clip(String(text), 600) + line;
  }

  async function evaluate(tabId, expression, options) {
    const opts = options || {};
    const result = await send(tabId, 'Runtime.evaluate', {
      expression: String(expression),
      returnByValue: true,
      awaitPromise: opts.awaitPromise !== false,
      userGesture: true,
      allowUnsafeEvalBlockedByCSP: true,
      timeout: Math.max(1000, Math.min(30000, Number(opts.timeout) || 15000))
    });
    if (result && result.exceptionDetails) throw new Error('页面执行异常：' + describeException(result.exceptionDetails));
    const remote = result && result.result;
    if (!remote) return undefined;
    if (remote.type === 'undefined') return undefined;
    if (remote.unserializableValue) return remote.unserializableValue;
    return remote.value;
  }

  async function tabUrl(tabId) {
    try {
      const tab = await chrome.tabs.get(Number(tabId));
      return tab.url || '';
    } catch (_) { return ''; }
  }

  async function guardPage(tabId) {
    const url = await tabUrl(tabId);
    if (!url) throw new Error('标签页不存在或已关闭');
    if (isInternal(url)) throw new Error('当前页面是浏览器内部页面，调试器无法操作（' + clip(url, 80) + '）');
    return url;
  }



  const SNAPSHOT_SOURCE = `(function(){
    var MAX = __MAX__;
    var out = [];
    var SEL = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="menuitem"],[role="switch"],[onclick],[contenteditable="true"],label[for]';
    function esc(v){ return String(v).replace(/\\\\/g,'\\\\\\\\').replace(/"/g,'\\\\"'); }
    function pathOf(el){
      try {
        if (el.id && el.ownerDocument.querySelectorAll('#'+CSS.escape(el.id)).length === 1) return '#'+CSS.escape(el.id);
        var parts = [], node = el, depth = 0;
        while (node && node.nodeType === 1 && depth < 6) {
          var tag = node.tagName.toLowerCase();
          var parent = node.parentElement;
          if (parent) {
            var same = Array.prototype.filter.call(parent.children, function(c){ return c.tagName === node.tagName; });
            if (same.length > 1) tag += ':nth-of-type(' + (same.indexOf(node)+1) + ')';
          }
          parts.unshift(tag);
          node = parent; depth++;
        }
        return parts.join(' > ');
      } catch (e) { return ''; }
    }
    function collect(doc, frameTag){
      var nodes;
      try { nodes = doc.querySelectorAll(SEL); } catch (e) { return; }
      for (var i = 0; i < nodes.length && out.length < MAX; i++) {
        var el = nodes[i];
        var rect = el.getBoundingClientRect();
        var style = null;
        try { style = doc.defaultView.getComputedStyle(el); } catch (e) { style = null; }
        var visible = rect.width > 0 && rect.height > 0 && (!style || (style.visibility !== 'hidden' && style.display !== 'none'));
        var text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
        out.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || '',
          id: el.id || '',
          name: el.getAttribute('name') || '',
          role: el.getAttribute('role') || '',
          text: text.slice(0, 80),
          placeholder: el.getAttribute('placeholder') || '',
          aria: el.getAttribute('aria-label') || '',
          href: el.getAttribute('href') ? String(el.getAttribute('href')).slice(0, 120) : '',
          value: (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && typeof el.value === 'string' ? el.value.slice(0, 60) : '',
          disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
          checked: el.checked === true,
          visible: visible,
          frame: frameTag || '',
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          selector: pathOf(el)
        });
      }
    }
    collect(document, '');
    var frames = Array.prototype.slice.call(document.querySelectorAll('iframe,frame'));
    for (var f = 0; f < frames.length && out.length < MAX; f++) {
      var tag = 'iframe[' + f + ']';
      try {
        var sub = frames[f].contentDocument;
        if (sub) collect(sub, tag);
      } catch (e) { }
    }
    return { items: out, frames: frames.length, title: document.title, url: location.href, scrolled: window.scrollY, height: document.documentElement.scrollHeight };
  })()`;

  async function snapshot(tabId, limit) {
    await guardPage(tabId);
    const max = Math.max(1, Math.min(300, Number(limit) || 120));
    const data = await evaluate(tabId, SNAPSHOT_SOURCE.replace('__MAX__', String(max)), { timeout: 8000 });
    const state = await attach(Number(tabId));
    state.refs.clear();
    state.refSeq = 0;
    const items = (data && data.items) || [];
    const out = items.map(item => {
      state.refSeq += 1;
      const ref = 'e' + state.refSeq;
      if (state.refs.size < REF_MAX) state.refs.set(ref, { selector: item.selector, frame: item.frame });
      return {
        ref,
        tag: item.tag,
        type: item.type || undefined,
        text: item.text || undefined,
        name: item.name || undefined,
        id: item.id || undefined,
        placeholder: item.placeholder || undefined,
        aria: item.aria || undefined,
        href: item.href || undefined,
        value: item.value || undefined,
        role: item.role || undefined,
        disabled: item.disabled || undefined,
        checked: item.checked || undefined,
        visible: item.visible,
        frame: item.frame || undefined,
        selector: item.selector
      };
    });
    return {
      url: (data && data.url) || '',
      title: (data && data.title) || '',
      pageHeight: (data && data.height) || 0,
      scrollY: (data && data.scrolled) || 0,
      iframes: (data && data.frames) || 0,
      count: out.length,
      truncated: items.length >= max,
      items: out,
      hint: '用 ref（如 e3）或 selector 指定元素；click/type/hover 都认这两个。'
    };
  }

  async function locate(tabId, target) {
    const raw = String(target || '').trim();
    if (!raw) throw new Error('必须给 selector 或 ref');
    let selector = raw;
    if (/^e\d+$/.test(raw)) {
      const state = await attach(Number(tabId));
      const saved = state.refs.get(raw);
      if (!saved) throw new Error('ref 已失效（页面可能已变化），请重新调用 browser_snapshot');
      selector = saved.selector;
    }
    const expression = `(function(){
      var sel = ${JSON.stringify(selector)};
      var el = null;
      try { el = document.querySelector(sel); } catch (e) { return { error: '选择器语法错误：' + e.message }; }
      if (!el) return { error: 'not_found' };
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) { el.scrollIntoView(); }
      var rect = el.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        disabled: el.disabled === true
      };
    })()`;
    const found = await evaluate(tabId, expression, { timeout: 8000 });
    if (!found || found.error === 'not_found') throw new Error('找不到元素：' + selector);
    if (found.error) throw new Error(found.error);
    if (found.width <= 0 || found.height <= 0) throw new Error('元素不可见（尺寸为 0）：' + selector);
    return { ...found, selector };
  }

  async function click(tabId, target, options) {
    await guardPage(tabId);
    const opts = options || {};
    const box = await locate(tabId, target);
    if (box.disabled) throw new Error('元素处于 disabled 状态，点击不会生效：' + box.selector);
    await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none', buttons: 0 });
    await sleep(20);
    await send(tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: box.x, y: box.y, button: opts.button === 'right' ? 'right' : 'left',
      buttons: opts.button === 'right' ? 2 : 1, clickCount: opts.clickCount === 2 ? 2 : 1
    });
    await sleep(30);
    await send(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: box.x, y: box.y, button: opts.button === 'right' ? 'right' : 'left',
      buttons: 0, clickCount: opts.clickCount === 2 ? 2 : 1
    });
    if (opts.waitForNavigation !== false) await sleep(Number(opts.settleMs) || 350);
    return { ok: true, clicked: box.selector, tag: box.tag, text: box.text, x: Math.round(box.x), y: Math.round(box.y) };
  }

  const MODIFIERS = { alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, command: 4, shift: 8 };

  const KEY_CODES = {
    Enter: { code: 'Enter', keyCode: 13, text: '\r' },
    Tab: { code: 'Tab', keyCode: 9 },
    Escape: { code: 'Escape', keyCode: 27 },
    Backspace: { code: 'Backspace', keyCode: 8 },
    Delete: { code: 'Delete', keyCode: 46 },
    ArrowUp: { code: 'ArrowUp', keyCode: 38 },
    ArrowDown: { code: 'ArrowDown', keyCode: 40 },
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
    ArrowRight: { code: 'ArrowRight', keyCode: 39 },
    Space: { code: 'Space', keyCode: 32, text: ' ' },
    Home: { code: 'Home', keyCode: 36 },
    End: { code: 'End', keyCode: 35 },
    PageUp: { code: 'PageUp', keyCode: 33 },
    PageDown: { code: 'PageDown', keyCode: 34 }
  };

  async function pressKey(tabId, key, modifiers) {
    const spec = KEY_CODES[key] || { code: 'Key' + String(key).toUpperCase(), keyCode: 0 };
    const mask = (modifiers || []).reduce((sum, name) => sum | (MODIFIERS[String(name).toLowerCase()] || 0), 0);
    const printable = !KEY_CODES[key] && String(key).length === 1;
    const base = {
      key: printable ? String(key) : key,
      code: spec.code,
      windowsVirtualKeyCode: printable ? String(key).toUpperCase().charCodeAt(0) : spec.keyCode,
      nativeVirtualKeyCode: printable ? String(key).toUpperCase().charCodeAt(0) : spec.keyCode,
      modifiers: mask
    };
    await send(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, ...(spec.text && !printable ? { text: spec.text } : {}) });
    if (printable) {
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'char', ...base, text: String(key) });
    } else if (spec.text && !mask) {
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'char', ...base, text: spec.text });
    }
    await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async function type(tabId, params) {
    await guardPage(tabId);
    const target = params.selector || params.ref;
    if (!target) throw new Error('必须给 selector 或 ref');
    const box = await locate(tabId, target);
    if (box.disabled) throw new Error('元素处于 disabled 状态');
    await click(tabId, target, { waitForNavigation: false, settleMs: 60 });
    if (params.clear === true) {
      await evaluate(tabId, `(function(){
        var el = document.querySelector(${JSON.stringify(box.selector)});
        if (!el) return false;
        var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter && setter.set) setter.set.call(el, ''); else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`, { timeout: 5000 });
    }
    const text = String(params.text === undefined || params.text === null ? '' : params.text);
    if (text) {
      await send(tabId, 'Input.insertText', { text });
    }
    if (params.submit === true) await pressKey(tabId, 'Enter', []);
    await sleep(params.settleMs === undefined ? 150 : Number(params.settleMs));
    const value = await evaluate(tabId, `(function(){
      var el = document.querySelector(${JSON.stringify(box.selector)});
      return el && typeof el.value === 'string' ? el.value.slice(0, 200) : null;
    })()`, { timeout: 5000 }).catch(() => null);
    return { ok: true, target: box.selector, typed: clip(text, 200), value };
  }

  async function key(tabId, params) {
    await guardPage(tabId);
    const value = String(params.key || '').trim();
    if (!value) throw new Error('key 不能为空');
    const parts = value.split('+').map(item => item.trim()).filter(Boolean);
    const combo = parts.length > 1;
    const main = combo ? parts[parts.length - 1] : value;
    const modifiers = combo ? parts.slice(0, -1) : [];
    if (params.ref || params.selector) {
      const target = params.ref || params.selector;
      await click(tabId, target, { waitForNavigation: false, settleMs: 50 });
    }
    await pressKey(tabId, main, modifiers);
    await sleep(Number(params.settleMs) || 120);
    return { ok: true, key: value, target: params.ref || params.selector || '(当前焦点)' };
  }

  async function hover(tabId, target) {
    await guardPage(tabId);
    const box = await locate(tabId, target);
    await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none', buttons: 0 });
    await sleep(200);
    return { ok: true, hovered: box.selector, tag: box.tag };
  }

  async function scroll(tabId, params) {
    await guardPage(tabId);
    if (params.selector || params.ref) {
      const box = await locate(tabId, params.ref || params.selector);
      return { ok: true, scrolledTo: box.selector };
    }
    if (params.to === 'top' || params.to === 'bottom') {
      const result = await evaluate(tabId, `(function(){
        var top = ${params.to === 'top' ? '0' : 'document.documentElement.scrollHeight'};
        window.scrollTo(0, top);
        return { y: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
      })()`);
      return { ok: true, ...result };
    }
    if (Number.isFinite(Number(params.x)) && Number.isFinite(Number(params.y))) {
      const result = await evaluate(tabId, `(function(){ window.scrollTo(${Number(params.x)}, ${Number(params.y)}); return { y: Math.round(window.scrollY) }; })()`);
      return { ok: true, ...result };
    }
    const delta = Number(params.deltaY) || 600;
    await send(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 200, y: 300, deltaX: Number(params.deltaX) || 0, deltaY: delta, button: 'none', buttons: 0
    });
    await sleep(220);
    const y = await evaluate(tabId, 'Math.round(window.scrollY)').catch(() => null);
    return { ok: true, deltaY: delta, scrollY: y };
  }

  async function selectOption(tabId, params) {
    await guardPage(tabId);
    if (!params.selector && !params.ref) throw new Error('必须给 selector 或 ref');
    const selector = params.ref || params.selector;
    const box = await locate(tabId, selector);
    const wanted = String(params.value === undefined ? '' : params.value);
    const result = await evaluate(tabId, `(function(){
      var el = document.querySelector(${JSON.stringify(box.selector)});
      if (!el || el.tagName !== 'SELECT') return { error: '目标不是 select 元素' };
      var options = Array.prototype.slice.call(el.options).map(function(o){ return { value: o.value, text: (o.textContent||'').trim() }; });
      var hit = null;
      for (var i = 0; i < options.length; i++) {
        if (options[i].value === ${JSON.stringify(wanted)} || options[i].text === ${JSON.stringify(wanted)}) { hit = options[i].value; break; }
      }
      if (hit === null) return { error: '找不到匹配选项', options: options.slice(0, 40) };
      var setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (setter && setter.set) setter.set.call(el, hit); else el.value = hit;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { selected: hit, options: options.length };
    })()`, { timeout: 5000 });
    if (result && result.error) return { error: result.error, options: result.options };
    return { ok: true, target: box.selector, ...result };
  }

  async function upload(tabId, params) {
    await guardPage(tabId);
    const files = Array.isArray(params.files) ? params.files.map(String).filter(Boolean) : [];
    if (!files.length) throw new Error('files 不能为空');
    const selector = params.ref || params.selector;
    if (!selector) throw new Error('必须给 selector 或 ref');
    const box = await locate(tabId, selector);
    const doc = await send(tabId, 'DOM.getDocument', { depth: 1 });
    const found = await send(tabId, 'DOM.querySelector', { nodeId: doc.root.nodeId, selector: box.selector });
    if (!found || !found.nodeId) throw new Error('无法定位文件输入框');
    await send(tabId, 'DOM.setFileInputFiles', { nodeId: found.nodeId, files });
    await sleep(200);
    return { ok: true, target: box.selector, files };
  }

  async function handleDialog(tabId, params) {
    const state = await attach(Number(tabId));
    if (params && (params.policy === 'accept' || params.policy === 'dismiss')) {
      state.dialogPolicy = { accept: params.policy === 'accept', promptText: String(params.promptText || '') };
    }
    if (params && params.resolve === true) {
      try {
        await chrome.debugger.sendCommand({ tabId: Number(tabId) }, 'Page.handleJavaScriptDialog', {
          accept: params.accept !== false,
          promptText: String(params.promptText || '')
        });
      } catch (error) {
        return { ok: false, note: '当前没有待处理的对话框', error: error.message };
      }
    }
    return {
      ok: true,
      policy: state.dialogPolicy,
      opened: state.dialogs.slice(-10),
      note: '默认自动接受弹窗（记录在案）。要改成自动取消，把 policy 设为 dismiss。'
    };
  }

  async function waitFor(tabId, params) {
    await guardPage(tabId);
    const timeout = Math.max(200, Math.min(30000, Number(params.timeoutMs) || 8000));
    const started = now();
    if (params.selector || params.text) {
      const selector = params.selector ? String(params.selector) : '';
      const text = params.text ? String(params.text) : '';
      const wantHidden = params.state === 'hidden';
      const expression = `(function(){
        var found = null;
        ${selector ? `try { found = document.querySelector(${JSON.stringify(selector)}); } catch (e) { return { error: e.message }; }` : `var nodes = Array.prototype.slice.call(document.querySelectorAll('body *')).slice(0, 4000);
        for (var i = 0; i < nodes.length; i++) { var t = nodes[i].textContent || ''; if (t.indexOf(${JSON.stringify(text)}) !== -1) { found = nodes[i]; break; } }`}
        if (!found) return { visible: false };
        var rect = found.getBoundingClientRect();
        var style = null;
        try { style = getComputedStyle(found); } catch (e) { }
        var visible = rect.width > 0 && rect.height > 0 && (!style || (style.visibility !== 'hidden' && style.display !== 'none'));
        return { visible: visible };
      })()`;
      while (now() - started < timeout) {
        const result = await evaluate(tabId, expression, { timeout: 5000 }).catch(() => null);
        if (result && result.error) return { error: '选择器语法错误：' + result.error };
        const matched = result ? result.visible === true : false;
        if (wantHidden ? !matched : matched) {
          return { ok: true, waitedMs: now() - started, state: wantHidden ? 'hidden' : 'visible', target: selector || text };
        }
        await sleep(140);
      }
      return { ok: false, timedOut: true, waitedMs: now() - started, target: selector || text, note: '等待超时，目标没有变成期望状态' };
    }
    if (params.networkIdle === true) {
      const state = await attach(Number(tabId));
      const idle = Math.max(200, Number(params.idleMs) || 600);
      while (now() - started < timeout) {
        if (now() - (state.netLastAt || 0) >= idle) {
          return { ok: true, waitedMs: now() - started, state: 'network-idle' };
        }
        await sleep(120);
      }
      return { ok: false, timedOut: true, waitedMs: now() - started, note: '网络一直没安静下来' };
    }
    const ms = Math.max(0, Math.min(30000, Number(params.ms) || 800));
    await sleep(ms);
    return { ok: true, waitedMs: ms };
  }

  async function networkList(tabId, params) {
    const state = await attach(Number(tabId));
    const limit = Math.max(1, Math.min(NET_MAX, Number(params.limit) || 40));
    const keyword = String(params.keyword || '').toLowerCase();
    const withBody = params.includeBody === true;
    const ids = state.netOrder.slice(-Math.min(limit * 3, NET_MAX)).reverse();
    const items = [];
    for (const id of ids) {
      if (items.length >= limit) break;
      const record = state.net.get(id);
      if (!record) continue;
      if (keyword && !(record.url.toLowerCase().includes(keyword) || record.method.toLowerCase().includes(keyword))) continue;
      const item = {
        id: record.id,
        method: record.method,
        url: record.url,
        status: record.status || (record.failed ? 0 : 'pending'),
        type: record.type,
        mime: record.mime || undefined,
        ms: record.ms || undefined,
        bytes: record.size || undefined,
        failed: record.failed || undefined,
        postData: record.postData || undefined
      };
      if (withBody && record.status) {
        try {
          const body = await send(tabId, 'Network.getResponseBody', { requestId: record.id });
          item.body = clip(body && body.body || '', 2000);
          item.base64 = body && body.base64Encoded === true ? true : undefined;
        } catch (error) {
          item.bodyError = clip(error.message, 120);
        }
      }
      items.push(item);
    }
    return {
      tabId: Number(tabId),
      captured: state.netOrder.length,
      since: state.attachedAt || 0,
      items,
      hint: items.length
        ? '用 id 配 includeBody 拉响应体；或者 keyword 过滤。'
        : '缓冲从附加调试器那一刻开始记，页面加载初期的请求抓不到。要抓初始化请求：先 browser_navigate 刷新（或 reload），再回来读。'
    };
  }

  async function consoleLogs(tabId, params) {
    const state = await attach(Number(tabId));
    const limit = Math.max(1, Math.min(LOG_MAX, Number(params.limit) || 40));
    const level = String(params.level || '').toLowerCase();
    let items = state.logs.slice(-limit * 3);
    if (level && level !== 'all') items = items.filter(item => String(item.level).toLowerCase() === level);
    items = items.slice(-limit);
    return {
      count: items.length,
      total: state.logs.length,
      items: items.map(item => ({
        level: item.level,
        text: clip(item.text, 800),
        url: item.url || undefined,
        line: item.line,
        exception: item.exception || undefined
      })),
      hint: items.length ? '' : '缓冲里还没有输出，先刷新页面或触发一下交互。'
    };
  }

  async function screenshot(tabId, params) {
    await guardPage(tabId);
    const fullPage = params.fullPage === true;
    const result = await send(tabId, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage,
      fromSurface: true
    });
    const data = (result && result.data) || '';
    if (!data) throw new Error('截图失败，页面可能还未渲染');
    const metrics = await evaluate(tabId, `(function(){ return { w: window.innerWidth, h: window.innerHeight, sh: document.documentElement.scrollHeight }; })()`, { timeout: 5000 }).catch(() => ({}));
    const id = 'shot_' + now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = {
      id,
      tabId: Number(tabId),
      at: now(),
      url: clip(await tabUrl(tabId), 300),
      width: metrics && metrics.w ? metrics.w : 0,
      height: fullPage ? ((metrics && metrics.sh) || 0) : ((metrics && metrics.h) || 0),
      bytes: Math.round(data.length * 0.75),
      dataUrl: 'data:image/png;base64,' + data
    };
    try {
      const store = await chrome.storage.session.get(SHOT_KEY);
      const list = Array.isArray(store[SHOT_KEY]) ? store[SHOT_KEY] : [];
      list.push(entry);
      while (list.length > SHOT_MAX) list.shift();
      await chrome.storage.session.set({ [SHOT_KEY]: list });
    } catch (error) {
      try { await chrome.storage.session.set({ [SHOT_KEY]: [entry] }); } catch (_) { }
    }
    chrome.runtime.sendMessage({ type: 'MAPUS_SHOT', shot: { id, dataUrl: entry.dataUrl, url: entry.url, width: entry.width, height: entry.height } }).catch(() => { });
    return {
      ok: true,
      shotId: id,
      width: entry.width,
      height: entry.height,
      kb: Math.round(entry.bytes / 1024),
      note: '截图已推到侧边栏对话里，用户能直接看到；你这边不需要再读图片内容。'
    };
  }

  async function go(tabId, params) {
    const target = String(params.url || '').trim();
    const action = String(params.action || (target ? 'goto' : 'reload'));
    if (action === 'back' || action === 'forward') {
      const history = await send(tabId, 'Page.getNavigationHistory');
      const index = Number(history.currentIndex) + (action === 'back' ? -1 : 1);
      const entry = (history.entries || [])[index];
      if (!entry) throw new Error(action === 'back' ? '已经到最前面了' : '已经没有下一页了');
      await send(tabId, 'Page.navigateToHistoryEntry', { entryId: entry.id });
      await sleep(400);
      return { ok: true, action, url: entry.url };
    }
    if (action === 'reload') {
      await send(tabId, 'Page.reload', { ignoreCache: params.hard === true });
      await sleep(400);
      return { ok: true, action: 'reload', hard: params.hard === true };
    }
    if (!target) throw new Error('url 不能为空');
    const url = /^[a-z]+:\/\//i.test(target) ? target : (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(target) ? 'https://' + target : target);
    const result = await send(tabId, 'Page.navigate', { url });
    await sleep(Number(params.settleMs) || 500);
    return { ok: true, action: 'goto', url, frameId: result && result.frameId, errorText: result && result.errorText };
  }

  async function tabs(tabId, params) {
    const action = String(params.action || 'list');
    if (action === 'list') {
      const list = await chrome.tabs.query({});
      const current = Number(tabId);
      return {
        count: list.length,
        items: list.map(tab => ({
          tabId: tab.id,
          active: tab.active,
          windowId: tab.windowId,
          title: clip(tab.title || '', 80),
          url: clip(tab.url || '', 200),
          status: tab.status,
          debug: sessions.has(tab.id) && sessions.get(tab.id).attached
        })),
        current: Number.isFinite(current) ? current : undefined
      };
    }
    if (action === 'activate') {
      const id = Number(params.targetTabId || params.tabId2 || 0);
      if (!id) throw new Error('activate 需要 targetTabId');
      const tab = await chrome.tabs.update(id, { active: true });
      if (tab && tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => { });
      return { ok: true, activated: id, url: clip((tab && tab.url) || '', 200) };
    }
    if (action === 'open') {
      const url = String(params.url || 'about:blank');
      const tab = await chrome.tabs.create({ url, active: params.active !== false });
      return { ok: true, tabId: tab.id, url: clip(tab.url || url, 200) };
    }
    if (action === 'close') {
      const id = Number(params.targetTabId || 0);
      if (!id) throw new Error('close 需要 targetTabId');
      await chrome.tabs.remove(id);
      return { ok: true, closed: id };
    }
    if (action === 'detach') {
      const id = Number(params.targetTabId || tabId);
      return await detach(id);
    }
    throw new Error('不支持的 action：' + action);
  }

  async function emulation(tabId, params) {
    await guardPage(tabId);
    const action = String(params.action || '');
    if (action === 'viewport') {
      await send(tabId, 'Emulation.setDeviceMetricsOverride', {
        width: Math.max(200, Number(params.width) || 390),
        height: Math.max(200, Number(params.height) || 844),
        deviceScaleFactor: Number(params.deviceScaleFactor) || 1,
        mobile: params.mobile === true
      });
      const measured = await evaluate(tabId, '(function(){ return { innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, dpr: window.devicePixelRatio, hasViewportMeta: !!document.querySelector(\'meta[name="viewport"]\') }; })()', { timeout: 5000 }).catch(() => ({}));
      return {
        ok: true,
        viewport: { width: params.width, height: params.height, mobile: params.mobile === true },
        measured,
        note: params.mobile === true && measured && measured.innerWidth !== Number(params.width)
          ? 'mobile=true 且页面没有 viewport meta 时，布局视口会按 980 算，这是浏览器自己的行为，不是没生效。'
          : undefined
      };
    }
    if (action === 'ua') {
      const ua = String(params.userAgent || '');
      if (!ua) throw new Error('ua 需要 userAgent');
      await send(tabId, 'Emulation.setUserAgentOverride', { userAgent: ua });
      return { ok: true, userAgent: ua };
    }
    if (action === 'geo') {
      await send(tabId, 'Emulation.setGeolocationOverride', {
        latitude: Number(params.latitude) || 0,
        longitude: Number(params.longitude) || 0,
        accuracy: Number(params.accuracy) || 10
      });
      return { ok: true, geo: { latitude: params.latitude, longitude: params.longitude } };
    }
    if (action === 'timezone') {
      await send(tabId, 'Emulation.setTimezoneOverride', { timezoneId: String(params.timezoneId || 'Asia/Shanghai') });
      return { ok: true, timezoneId: params.timezoneId || 'Asia/Shanghai' };
    }
    if (action === 'network') {
      await send(tabId, 'Network.emulateNetworkConditions', {
        offline: params.offline === true,
        latency: Math.max(0, Number(params.latency) || 0),
        downloadThroughput: Math.max(-1, Number(params.downloadKbps) ? Number(params.downloadKbps) * 1024 / 8 : -1),
        uploadThroughput: Math.max(-1, Number(params.uploadKbps) ? Number(params.uploadKbps) * 1024 / 8 : -1)
      });
      return { ok: true, network: { offline: params.offline === true, latency: params.latency || 0 } };
    }
    if (action === 'reset') {
      await send(tabId, 'Emulation.clearDeviceMetricsOverride').catch(() => { });
      await send(tabId, 'Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => { });
      await send(tabId, 'Emulation.clearGeolocationOverride').catch(() => { });
      await send(tabId, 'Emulation.setTimezoneOverride', { timezoneId: '' }).catch(() => { });
      await send(tabId, 'Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => { });
      return { ok: true, reset: true };
    }
    throw new Error('不支持的 action：' + action);
  }

  async function detach(tabId) {
    const id = Number(tabId);
    const state = sessions.get(id);
    try {
      await chrome.debugger.detach({ tabId: id });
    } catch (error) {
      sessions.delete(id);
      return { ok: true, detached: id, note: '本来就没挂着：' + clip(error.message, 80) };
    }
    sessions.delete(id);
    return { ok: true, detached: id, wasExternal: !!(state && state.external) };
  }

  async function releaseAll() {
    const ids = Array.from(sessions.keys());
    for (const id of ids) {
      try { await chrome.debugger.detach({ tabId: id }); } catch (_) { }
      sessions.delete(id);
    }
    try { await chrome.storage.session.remove(SHOT_KEY); } catch (_) { }
    return ids.length;
  }

  function isAttached(tabId) {
    const state = sessions.get(Number(tabId));
    return !!(state && state.attached);
  }

  async function getShot(shotId) {
    try {
      const store = await chrome.storage.session.get(SHOT_KEY);
      const list = Array.isArray(store[SHOT_KEY]) ? store[SHOT_KEY] : [];
      return list.find(item => item.id === shotId) || null;
    } catch (_) { return null; }
  }

  self.MAPUS_BROWSER = {
    attach,
    detach,
    releaseAll,
    isAttached,
    getShot,
    send,
    evaluate,
    snapshot,
    click,
    type,
    key,
    hover,
    scroll,
    select: selectOption,
    upload,
    dialog: handleDialog,
    waitFor,
    network: networkList,
    console: consoleLogs,
    screenshot,
    go,
    tabs,
    emulation,
    stateOf: tabId => sessions.get(Number(tabId)) || null
  };
})();
