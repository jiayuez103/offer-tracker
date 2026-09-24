// 每个 frame 里的执行者：一键填写、在焦点处插入、找上传框、放入文件、读页面信息。
// 由后台注入（可以重复注入：库函数会更新，这个对象只建一次），通过 window.__jtAgent 调用。
(() => {
  const JT = globalThis.JT;
  if (!JT || window.__jtAgent) return;

  const LISTS = ['education', 'work', 'projects', 'activities', 'awards', 'languages', 'certificates'];
  const CAPTCHA = /验证码|校验码|captcha|verification code/i;
  const NOT_TEXT = new Set(['password', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color']); // 密码框永远不碰
  const FILE_GOOD = /简历|履历|resume|\bcv\b|附件|attachment|上传/i;
  const FILE_STRONG = /简历|履历|resume|\bcv\b/i;
  const FILE_BAD = /照片|头像|证件照|photo|avatar|图片|作品集|portfolio|成绩单|transcript|证书/i;

  /** 档案里某字段的值：{ text, alt }（alt 是另一种语言）；多段经历缺第 index 段时返回 { missing: true } */
  function valueFor(field, profile, index, lang, role) {
    const src = field.source;
    let raw;
    if (typeof src === 'string') {
      raw = src.split('.').reduce((o, k) => (o == null ? o : o[k]), profile);
    } else if (src.extra) {
      raw = ((profile.extras || []).find((e) => e.id === src.extra) || {}).value;
    } else {
      const entry = (profile[src.list] || [])[index];
      if (!entry) return { missing: true };
      raw = src.field === 'range' ? entry[role === 'end' ? 'end' : 'start'] : entry[src.field];
    }
    const bi = JT.asBi(raw);
    const other = lang === 'zh' ? 'en' : 'zh';
    const text = bi[lang] || bi[other] || '';
    return { text, alt: bi[other] && bi[other] !== text ? bi[other] : '' };
  }

  /** 一键填写本 frame 的表单；返回 { filled, uncertain, manual, skipped, missing } */
  async function fillAll({ profile, options = {} }) {
    const opts = { lang: 'auto', overwrite: false, reverse: false, ...options };
    const prof = { ...profile };
    if (opts.reverse) for (const k of LISTS) prof[k] = [...(profile[k] || [])].reverse();
    const extras = (profile.extras || [])
      .filter((e) => e.label)
      .map((e) => ({ key: `extra.${e.id}`, source: { extra: e.id }, labels: [e.label], contextLabels: [], kind: 'text', scope: null }));
    const pageLang = JT.pageLang(document);
    const counters = {};
    const used = {};
    const summary = { filled: 0, uncertain: 0, manual: 0, skipped: 0, missing: {}, todo: [] };
    JT.clearMarks();

    for (const control of JT.collectControls(document)) {
      const label = control.kind === 'radio' ? JT.groupLabelOf(control.el) : JT.labelOf(control.el);
      if (CAPTCHA.test(label)) continue;
      const box = control.kind === 'radio' ? JT.groupContainer(control.el) : control.el;
      const match = JT.findField(label, JT.sectionOf(control.el), JT.hintsOf(control.el), extras);
      if (!match || (match.field.kind === 'range' && !control.role)) {
        if (!JT.hasValue(control) && JT.isRequired(control.el, label)) {
          JT.mark(box, 'manual');
          summary.manual += 1;
        }
        continue;
      }
      const { field } = match;
      const list = typeof field.source === 'object' ? field.source.list : null;
      let index = 0;
      if (list) {
        // 同一分节里同一字段第 k 次出现 → 第 k 段经历；日期范围的「结束」和「开始」算同一段
        if (control.role === 'end') index = counters[field.key] ?? 0;
        else index = counters[field.key] = (counters[field.key] ?? -1) + 1;
        used[list] = Math.max(used[list] ?? -1, index);
      }
      const lang = opts.lang === 'auto' ? JT.labelLang(label, pageLang) : opts.lang;
      const value = valueFor(field, prof, index, lang, control.role);
      if (value.missing || !value.text) continue;
      if (!opts.overwrite && JT.hasValue(control)) {
        summary.skipped += 1;
        continue;
      }
      let result = false;
      try {
        result = await JT.applyValue(control, value, field);
      } catch {
        result = false;
      }
      let status = 'filled';
      if (!result) status = 'manual';
      else if (result === 'truncated' || match.confidence === 'low') status = 'uncertain';
      JT.mark(box, status);
      summary[status] += 1;
      // 填不进去的（只读日期框这类）把该填的值报上去，省得用户回 Tracker 翻
      if (!result && summary.todo.length < 12) summary.todo.push({ label: label.slice(0, 20), text: value.text.slice(0, 40) });
    }

    for (const k of LISTS) {
      if (used[k] == null) continue;
      const extra = (prof[k] || []).length - (used[k] + 1);
      if (extra > 0) summary.missing[k] = extra;
    }
    return summary;
  }

  function deepActive(doc) {
    let el = doc.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  /** 点选填充：只有拥有焦点、且焦点在可输入的框里的 frame 才会插入 */
  function insertFocused(text) {
    if (!document.hasFocus()) return false;
    const el = deepActive(document);
    if (!el || el === document.body || el.id === 'jt-panel-host') return false;
    const root = el.getRootNode ? el.getRootNode() : null;
    if (root && root.host && root.host.id === 'jt-panel-host') return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const editable = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NOT_TEXT.has(type)) || el.isContentEditable;
    if (!editable || el.disabled || el.readOnly) return false;
    JT.insertText(el, text);
    JT.mark(el, 'filled');
    return true;
  }

  function fileContext(input) {
    const item = input.closest(JT.FORM_ITEM_SELECTOR) || input.parentElement;
    return [JT.labelOf(input), input.getAttribute('accept') || '', input.name || '', input.id || '', JT.textOf(item).slice(0, 80)].join(' ');
  }

  /** 找上传简历的地方：按文字打分，排除只收图片的、照片 / 头像 / 作品集 */
  function findFileInputs() {
    return [...document.querySelectorAll('input[type="file"]')]
      .map((input, index) => {
        if (input.disabled || input.closest('#jt-panel-host')) return null;
        const accept = (input.getAttribute('accept') || '').toLowerCase();
        if (accept && /image\//.test(accept) && !/pdf|doc|\*/.test(accept)) return null;
        const text = fileContext(input);
        let score = 1;
        if (FILE_GOOD.test(text)) score += 4;
        if (FILE_STRONG.test(text)) score += 6;
        if (FILE_BAD.test(text)) score -= 10;
        if (/pdf|doc/.test(accept)) score += 2;
        return score > 0 ? { index, score, label: (JT.labelOf(input) || '上传').slice(0, 30) } : null;
      })
      .filter(Boolean);
  }

  /** 把后台传来的文件（base64）放进第 index 个文件框 */
  function attachFile(index, { name, type, b64 }) {
    const input = document.querySelectorAll('input[type="file"]')[index];
    if (!input) return false;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    JT.mark(input.closest(JT.FORM_ITEM_SELECTOR) || input.parentElement, 'filled');
    return true;
  }

  window.__jtAgent = {
    fillAll,
    insertFocused,
    findFileInputs,
    attachFile,
    clearMarks: () => JT.clearMarks(),
    pageInfo: () => JT.pageInfo(document),
    pageLang: () => JT.pageLang(document),
  };
})();
