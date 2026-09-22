// 把值写进表单控件：日期格式和选项匹配（纯函数）；找控件、写值、自定义下拉、高亮（DOM）。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});
  const PANEL = '#jt-panel-host';
  const CUSTOM_SELECT = '.ant-select, .el-select, .ivu-select, .arco-select, .n-select, [role="combobox"]:not(input):not(textarea)';
  const OPTION = '.ant-select-item-option, .el-select-dropdown__item, .ivu-select-item, .arco-select-option, .n-base-select-option, [role="option"]';
  const RANGE = '.ant-picker-range, .el-range-editor, .arco-picker-range';
  const PICKER = '.ant-picker, .el-date-editor, .ivu-date-picker, .arco-picker';
  const SKIP_TYPES = new Set(['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color']);
  const CLICK = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  const COLORS = { filled: '#2f8a57', uncertain: '#3f7fd9', manual: '#d4a017' };

  // ---------- 纯函数 ----------

  /** 'YYYY-MM' 或 'YYYY-MM-DD' → 输入框期望的格式（看 type 和 placeholder） */
  JT.formatDate = (value, { type = 'text', placeholder = '' } = {}) => {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(value || '').trim());
    if (!m) return value || '';
    const [, y, mo, d] = m;
    if (type === 'month') return `${y}-${mo}`;
    if (type === 'date') return `${y}-${mo}-${d || '01'}`;
    const p = String(placeholder || '');
    if (/mm\s*\/\s*dd\s*\/\s*yyyy/i.test(p)) return `${mo}/${d || '01'}/${y}`;
    if (/dd\s*\/\s*mm\s*\/\s*yyyy/i.test(p)) return `${d || '01'}/${mo}/${y}`;
    if (/mm\s*\/\s*yyyy/i.test(p)) return `${mo}/${y}`;
    if (/(?:y{4}|\d{4})\s*年/i.test(p)) return d ? `${y}年${mo}月${d}日` : `${y}年${mo}月`;
    const sep = /\d{4}\s*([./-])\s*\d{1,2}/.exec(p)?.[1] || /y{4}\s*([./-])/i.exec(p)?.[1] || '-';
    return d ? [y, mo, d].join(sep) : `${y}${sep}${mo}`;
  };

  /** 文字属于哪个选项分组（中文按包含，英文按整词） */
  JT.groupOf = (groups, text) => {
    const t = JT.normalizeChoice(text);
    if (!t) return null;
    const tokens = JT.tokens(t);
    for (const g of groups) {
      for (const w of g.words) {
        const k = JT.normalizeChoice(w);
        if (JT.hasCJK(k) ? t.includes(k) : JT.phraseIn(tokens, JT.tokens(k))) return g.key;
      }
    }
    return null;
  };

  /** 在选项文字里挑最合适的一个，返回下标；找不到返回 -1 */
  JT.chooseOption = (optionTexts, { groups, values }) => {
    const wanted = (values || []).filter(Boolean);
    if (groups) {
      const target = wanted.map((v) => JT.groupOf(groups, v)).find(Boolean);
      if (target) {
        const i = optionTexts.findIndex((o) => JT.groupOf(groups, o) === target);
        if (i >= 0) return i;
      }
    }
    const opts = optionTexts.map((o) => JT.normalizeChoice(o));
    for (const v of wanted.map((x) => JT.normalizeChoice(x))) {
      if (!v) continue;
      let i = opts.findIndex((o) => o === v);
      if (i < 0) i = opts.findIndex((o) => o.includes(v));
      if (i < 0) i = opts.findIndex((o) => o.length >= 2 && v.includes(o));
      if (i >= 0) return i;
    }
    return -1;
  };

  // ---------- DOM ----------
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const inPanel = (el) => !!(el.closest && el.closest(PANEL));

  const fire = (el, types) => {
    const view = el.ownerDocument.defaultView;
    for (const type of types) {
      const Ctor = type.startsWith('pointer') && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view, button: 0 }));
    }
  };

  const fireInput = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /** 原型上的 value setter：绕过 React 在实例上装的值追踪，之后的 input 事件才会被当成用户输入 */
  const setterFor = (el) => {
    const Ctor = { INPUT: HTMLInputElement, TEXTAREA: HTMLTextAreaElement, SELECT: HTMLSelectElement }[el.tagName];
    return Ctor && Object.getOwnPropertyDescriptor(Ctor.prototype, 'value').set;
  };

  JT.isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  /** 当前 frame 里所有可填的控件，按页面顺序排好 */
  JT.collectControls = (doc = document) => {
    const out = [];
    for (const w of doc.querySelectorAll(CUSTOM_SELECT)) {
      if (inPanel(w) || (w.parentElement && w.parentElement.closest(CUSTOM_SELECT)) || !JT.isVisible(w)) continue;
      if (w.matches('.is-disabled, .ant-select-disabled, .ivu-select-disabled, [aria-disabled="true"]')) continue;
      out.push({ kind: 'custom', el: w });
    }
    for (const range of doc.querySelectorAll(RANGE)) {
      if (inPanel(range) || !JT.isVisible(range)) continue;
      const inputs = [...range.querySelectorAll('input')];
      if (inputs.length === 2) {
        out.push({ kind: 'text', el: inputs[0], role: 'start' });
        out.push({ kind: 'text', el: inputs[1], role: 'end' });
      }
    }
    for (const el of doc.querySelectorAll('input, textarea, select, [contenteditable="true"]')) {
      if (inPanel(el) || el.closest(CUSTOM_SELECT) || el.closest(RANGE) || el.disabled) continue;
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (el.tagName === 'INPUT' && SKIP_TYPES.has(type)) continue;
      if (!JT.isVisible(el)) continue;
      let kind = 'text';
      if (el.tagName === 'SELECT') kind = 'select';
      else if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') kind = 'editable';
      out.push({ kind, el });
    }
    const groups = new Map();
    for (const r of doc.querySelectorAll('input[type="radio"]')) {
      if (inPanel(r) || r.disabled) continue;
      if (!JT.isVisible(r) && !JT.isVisible(r.closest('label') || r.parentElement)) continue;
      const key = r.name || JT.groupContainer(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const radios of groups.values()) out.push({ kind: 'radio', el: radios[0], radios });
    // eslint-disable-next-line no-bitwise
    return out.sort((a, b) => (a.el === b.el ? 0 : (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1)));
  };

  /** 控件里是不是已经有内容（默认只填空的） */
  JT.hasValue = (control) => {
    const { kind, el } = control;
    if (kind === 'radio') return control.radios.some((r) => r.checked);
    if (kind === 'select') {
      const o = el.options[el.selectedIndex];
      return !!o && o.value !== '' && !/请选择|select|choose/i.test(o.text);
    }
    if (kind === 'custom') {
      const shown = el.querySelector('.ant-select-selection-item, .el-select__selected-item:not(.is-transparent), .ivu-select-selected-value, .arco-select-view-value');
      if (shown && JT.textOf(shown)) return true;
      const input = el.querySelector('input');
      return !!(input && input.value.trim());
    }
    if (kind === 'editable') return !!el.textContent.trim();
    return !!String(el.value || '').trim();
  };

  JT.setText = (el, text) => {
    const set = setterFor(el);
    if (set) set.call(el, text);
    else el.value = text;
    fireInput(el);
  };

  /** 在光标处插入（点选填充用）；输入框为空或不支持选区时直接写入 */
  JT.insertText = (el, text) => {
    if (el.isContentEditable && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
      if (!el.ownerDocument.execCommand('insertText', false, text)) {
        el.textContent += text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    let start = null;
    let end = null;
    try {
      start = el.selectionStart;
      end = el.selectionEnd;
    } catch {
      // email / number 输入框不支持选区
    }
    if (typeof start === 'number' && typeof end === 'number' && el.value) {
      JT.setText(el, el.value.slice(0, start) + text + el.value.slice(end));
      try {
        el.setSelectionRange(start + text.length, start + text.length);
      } catch {
        // 忽略
      }
    } else {
      JT.setText(el, text);
    }
  };

  JT.setSelect = (el, want) => {
    const i = JT.chooseOption([...el.options].map((o) => o.text), want);
    if (i < 0) return false;
    const set = setterFor(el);
    if (set) set.call(el, el.options[i].value);
    else el.selectedIndex = i;
    fireInput(el);
    return true;
  };

  JT.radioText = (r) => JT.textOf(r.closest('label')) || JT.textOf(r.labels && r.labels[0]) || JT.textOf(r.nextElementSibling) || r.value || '';

  JT.setRadio = (radios, want) => {
    const i = JT.chooseOption(radios.map(JT.radioText), want);
    if (i < 0) return false;
    const r = radios[i];
    if (!r.checked) (r.closest('label') || r).click();
    if (!r.checked) {
      r.checked = true;
      fireInput(r);
    }
    return true;
  };

  const visibleOptions = (doc) => [...doc.querySelectorAll(OPTION)].filter((o) => !inPanel(o)
    && JT.isVisible(o)
    && !o.matches('.is-disabled, .ant-select-item-option-disabled, [aria-disabled="true"]'));

  /** 等下拉选项出现：优先返回新出现的选项，超时就返回当前所有可见选项 */
  async function waitForOptions(doc, before, timeout) {
    const end = Date.now() + timeout;
    for (;;) {
      const all = visibleOptions(doc);
      const fresh = all.filter((o) => !before.has(o));
      if (fresh.length) return fresh;
      if (Date.now() > end) return all;
      await sleep(60);
    }
  }

  /** Ant / Element / iView 等自定义下拉：点开 → 找选项 → 找不到就输入关键字再找 → 点选项；失败时关掉下拉 */
  JT.setCustomSelect = async (wrapper, want) => {
    const doc = wrapper.ownerDocument;
    const trigger = wrapper.querySelector('.ant-select-selector, .el-select__wrapper, .el-input__inner, .ivu-select-selection, .arco-select-view, .n-base-selection') || wrapper;
    const before = new Set(visibleOptions(doc));
    fire(trigger, CLICK);
    let options = await waitForOptions(doc, before, 800);
    let i = JT.chooseOption(options.map((o) => JT.textOf(o)), want);
    const search = wrapper.querySelector('input:not([readonly])');
    if (i < 0 && search && want.values[0]) {
      const seen = new Set(options);
      JT.setText(search, want.values[0]);
      await sleep(300);
      options = await waitForOptions(doc, seen, 1500);
      i = JT.chooseOption(options.map((o) => JT.textOf(o)), want);
    }
    if (i >= 0) {
      fire(options[i], CLICK);
      await sleep(120);
      return true;
    }
    (search || trigger).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    fire(doc.body, ['mousedown', 'mouseup', 'click']);
    await sleep(80);
    return false;
  };

  /** 按控件类型写入；返回 true / false，或 'truncated'（超过 maxlength 被截断，需要核对） */
  JT.applyValue = async (control, value, field) => {
    const { kind, el } = control;
    const want = { groups: field.groups, values: [value.text, value.alt].filter(Boolean) };
    if (kind === 'select') return JT.setSelect(el, want);
    if (kind === 'radio') return JT.setRadio(control.radios, want);
    if (kind === 'custom') return JT.setCustomSelect(el, want);
    if (kind === 'editable') {
      el.textContent = value.text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (el.readOnly) return false; // 只读的日期框等：留给点选
    const isDate = ['date', 'month', 'range'].includes(field.kind);
    let text = isDate
      ? JT.formatDate(value.text, { type: (el.getAttribute('type') || 'text').toLowerCase(), placeholder: el.getAttribute('placeholder') || '' })
      : value.text;
    const max = Number(el.getAttribute('maxlength')) || 0;
    const truncated = max > 0 && text.length > max;
    if (truncated) text = text.slice(0, max);
    JT.setText(el, text);
    // 日期组件要按回车才确认；普通输入框不发，免得触发页面自己的提交逻辑
    if (el.closest(PICKER)) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    return truncated ? 'truncated' : true;
  };

  // 高亮记录放在 JT 上：重复注入脚本时不会丢，清除时能还原
  const marked = (JT.marked = JT.marked || new Map());

  JT.mark = (el, kind) => {
    if (!el || !el.style) return;
    if (!marked.has(el)) marked.set(el, [el.style.outline, el.style.outlineOffset]);
    el.style.outline = `2px solid ${COLORS[kind] || COLORS.manual}`;
    el.style.outlineOffset = '1px';
  };

  JT.clearMarks = () => {
    for (const [el, [outline, offset]] of marked) {
      el.style.outline = outline;
      el.style.outlineOffset = offset;
    }
    marked.clear();
  };
})();
