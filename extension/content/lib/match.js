// 标签清洗、语言判断、字段匹配（纯函数），以及从 DOM 里取标签、分节、提示词。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});
  const CJK = /[㐀-鿿]/;

  JT.FORM_ITEM_SELECTOR = [
    '.ant-form-item', '.el-form-item', '.ivu-form-item', '.arco-form-item', '.n-form-item',
    '.form-item', '.form-group', '[class*="form-item"]', '[class*="formItem"]', '[class*="FormItem"]',
    '[data-automation-id^="formField"]',
  ].join(', ');
  const LABEL_SELECTOR = [
    '.ant-form-item-label', '.el-form-item__label', '.ivu-form-item-label', '.arco-form-label-item', '.n-form-item-label',
    'label', 'legend', '[class*="label"]', '[class*="Label"]',
  ].join(', ');
  const HEADING_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'legend', '[role="heading"]',
    '[class*="title"]', '[class*="Title"]', '[class*="header"]', '[class*="Header"]', '[data-automation-id*="Header"]',
  ].join(', ');

  JT.hasCJK = (s) => CJK.test(s || '');

  /** 标签清洗：去掉括号里的说明、星号、冒号，合并空白，英文转小写 */
  JT.normalize = (s) => String(s || '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[*＊:：?？!！]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  /** 选项和值的比较：保留括号里的内容（「China (+86)」），去掉点号（M.S. → ms） */
  JT.normalizeChoice = (s) => String(s || '').replace(/[()（）[\]【】]/g, ' ').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  JT.tokens = (s) => String(s || '').split(/[^a-z0-9'+㐀-鿿]+/).filter(Boolean);

  const phraseIn = (tokens, phrase) => phrase.length > 0
    && tokens.some((_, i) => phrase.every((p, j) => tokens[i + j] === p));
  JT.phraseIn = phraseIn;

  /** 关键词在（已清洗的）标签里的得分：完全相同 100+，包含 50+，否则 0；关键词越长分越高 */
  JT.keywordScore = (label, kw) => {
    const k = JT.normalize(kw);
    if (!label || !k) return 0;
    if (label === k) return 100 + k.length;
    if (JT.hasCJK(k)) {
      if (k.length < 2 || !label.includes(k)) return 0;
      return label.length <= k.length + 8 ? 50 + k.length : 0;
    }
    const lt = JT.tokens(label);
    const kt = JT.tokens(k);
    if (lt.length > kt.length + 5) return 0;
    return phraseIn(lt, kt) ? 50 + k.length : 0;
  };

  const best = (label, words) => words.reduce((m, w) => Math.max(m, JT.keywordScore(label, w)), 0);

  /** name / id / data-automation-id 的最后一段，驼峰拆词：legalNameSection_firstName → "first name" */
  JT.hintWords = (hints) => {
    const last = String(hints || '').split(/[\s_\-.[\]/]+/).filter(Boolean).pop() || '';
    return last.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  };

  /**
   * 找字段：返回 { field, score, confidence } 或 null
   * section：控件所在分节（education / work / … / basic），extras：档案里的自定义字段
   */
  JT.findField = (rawLabel, section, hints = '', extras = []) => {
    const label = JT.normalize(rawLabel);
    const all = [...JT.FIELDS, ...extras];
    let top = null;
    if (label) {
      for (const field of all) {
        let score = best(label, field.labels);
        if (field.scope && section === field.scope) {
          score = Math.max(score, best(label, field.contextLabels || []));
          if (score) score += 20;
        } else if (field.scope && section && section !== field.scope && typeof field.source === 'object') {
          score -= 30; // 在别的分节里：降权但不排除，防止分节认错
        }
        if (score >= 50 && score > (top?.score ?? 0)) top = { field, score, confidence: score >= 100 ? 'high' : 'medium' };
      }
    }
    if (top) return top;
    const hint = JT.hintWords(hints);
    if (!hint) return null;
    for (const field of all) {
      const score = best(hint, field.labels.filter((w) => !JT.hasCJK(w)));
      if (score >= 50 && score > (top?.score ?? 0)) top = { field, score, confidence: 'low' };
    }
    return top;
  };

  JT.matchSection = (text) => {
    const t = JT.normalize(text);
    if (!t || t.length > 40) return null;
    let hit = null;
    for (const s of JT.SECTIONS) {
      const score = best(t, s.words);
      if (score && (!hit || score > hit.score)) hit = { key: s.key, score };
    }
    return hit ? hit.key : null;
  };

  /** 标签有中文用中文值，纯英文用英文值，都没有就看页面语言 */
  JT.labelLang = (label, pageLang = 'zh') => {
    if (JT.hasCJK(label)) return 'zh';
    if (/[a-z]/i.test(label || '')) return 'en';
    return pageLang;
  };

  JT.asBi = (v) => (v && typeof v === 'object'
    ? { zh: v.zh || '', en: v.en || '' }
    : { zh: typeof v === 'string' ? v : '', en: '' });

  /** 取指定语言的值，缺了就退回另一种 */
  JT.pickLang = (v, lang) => {
    const bi = JT.asBi(v);
    return bi[lang] || bi[lang === 'zh' ? 'en' : 'zh'] || '';
  };

  // ---------- DOM ----------
  const textOf = (node) => (node ? (node.innerText ?? node.textContent ?? '') : '').replace(/\s+/g, ' ').trim();
  JT.textOf = textOf;

  /** 从近到远最多 3 层表单项容器（Ant 的 .ant-form-item-control 类名里也带 form-item，要继续往外找） */
  const formItems = (el) => {
    const out = [];
    let item = el.closest(JT.FORM_ITEM_SELECTOR);
    while (item && out.length < 3) {
      out.push(item);
      item = item.parentElement ? item.parentElement.closest(JT.FORM_ITEM_SELECTOR) : null;
    }
    return out;
  };

  /** label 自己的文字：去掉里面的输入框、下拉框（否则会把所有选项文字也算进来） */
  const ownText = (label) => {
    if (!label) return '';
    const copy = label.cloneNode(true);
    copy.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
  };

  JT.pageLang = (doc = document) => {
    const sample = (doc.body?.innerText || '').slice(0, 4000);
    const cjk = (sample.match(/[㐀-鿿]/g) || []).length;
    if (cjk > 50) return 'zh';
    const lang = (doc.documentElement.getAttribute('lang') || '').toLowerCase();
    if (lang.startsWith('zh')) return 'zh';
    return cjk > 10 ? 'zh' : 'en';
  };

  /** 控件的标签文字：aria → label[for] → 外层 label → UI 库表单项标签 → aria-label → 前面的文字 → placeholder */
  JT.labelOf = (el) => {
    const doc = el.ownerDocument;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => textOf(doc.getElementById(id))).join(' ').trim();
      if (t) return t;
    }
    if (el.id) {
      const l = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (ownText(l)) return ownText(l);
    }
    const wrap = el.closest('label');
    if (wrap && ownText(wrap)) return ownText(wrap);
    for (const item of formItems(el)) {
      const lab = [...item.querySelectorAll(LABEL_SELECTOR)].find((n) => !n.contains(el) && ownText(n));
      if (lab && ownText(lab).length <= 60) return ownText(lab);
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    // 前面的文字只在它本身不含输入控件时才算标签，避免拿到上一个字段整块的文字
    const pureText = (node) => (node && !node.querySelector('input, select, textarea') ? textOf(node) : '');
    let prev = el.previousElementSibling;
    for (let i = 0; prev && i < 3; i += 1, prev = prev.previousElementSibling) {
      const t = pureText(prev);
      if (t && t.length <= 40) return t;
    }
    const cell = el.closest('td');
    const cellLabel = cell ? pureText(cell.previousElementSibling) : '';
    if (cellLabel && cellLabel.length <= 40) return cellLabel;
    const parentPrev = pureText(el.parentElement && el.parentElement.previousElementSibling);
    if (parentPrev && parentPrev.length <= 40) return parentPrev;
    return el.getAttribute('placeholder') || el.getAttribute('title') || '';
  };

  /** 单选组的整体标签（不是某个选项的文字） */
  JT.groupContainer = (radio) => radio.closest('[role="radiogroup"], .ant-radio-group, .el-radio-group, .ivu-radio-group, fieldset')
    || radio.closest('label')?.parentElement
    || radio.parentElement;

  JT.groupLabelOf = (radio) => {
    for (const item of formItems(radio)) {
      const lab = [...item.querySelectorAll(LABEL_SELECTOR)].find((n) => !n.querySelector('input[type="radio"]') && !n.closest('.ant-radio-wrapper, .el-radio') && ownText(n));
      if (lab) return ownText(lab);
    }
    const box = JT.groupContainer(radio);
    const legend = box.querySelector?.('legend');
    if (legend) return textOf(legend);
    let text = textOf(box);
    for (const r of box.querySelectorAll('input[type="radio"]')) {
      const option = textOf(r.closest('label')) || textOf(r.nextElementSibling);
      if (option) text = text.replace(option, ' ');
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text.length <= 30 ? text : textOf(box.previousElementSibling);
  };

  const headingOf = (node) => {
    if (node.matches?.(HEADING_SELECTOR)) {
      const t = textOf(node);
      return t.length <= 40 ? t : '';
    }
    if (textOf(node).length <= 40) {
      const h = node.querySelector?.(HEADING_SELECTOR);
      if (h) return textOf(h);
    }
    return '';
  };

  /** 往上找最近的分节标题（只看标题类元素，避免把字段标签当成分节） */
  JT.sectionOf = (el) => {
    let node = el;
    for (let depth = 0; node && node !== node.ownerDocument.body && depth < 15; depth += 1) {
      let sib = node.previousElementSibling;
      for (let hops = 0; sib && hops < 10; hops += 1, sib = sib.previousElementSibling) {
        const s = JT.matchSection(headingOf(sib));
        if (s) return s;
      }
      node = node.parentElement;
    }
    return null;
  };

  JT.hintsOf = (el) => [el.getAttribute('data-automation-id'), el.getAttribute('autocomplete'), el.name, el.id]
    .filter(Boolean)
    .join(' ');

  JT.isRequired = (el, label) => el.required
    || el.getAttribute('aria-required') === 'true'
    || /\*/.test(label || '')
    || !!el.closest('.is-required, .ant-form-item-required, .ivu-form-item-required')
    || formItems(el).some((item) => item.matches('.is-required') || !!item.querySelector('.ant-form-item-required, .is-required, .ivu-form-item-required'));
})();
