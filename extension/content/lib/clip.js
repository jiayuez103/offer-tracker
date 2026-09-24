// 收藏岗位：从当前页面猜公司、岗位，取 JD 正文。纯函数在上，DOM 部分在下。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});
  const SEPARATORS = /\s+[-–—_·•]\s+|\s*[|｜]\s*/;
  const NOISE_ZH = /(校园招聘|校招|社会招聘|社招|招聘官网|招聘网站|招聘门户|人才门户|招聘|官网|门户|加入我们)/g;
  const NOISE_EN = /\b(careers?\s+at|careers?|jobs?\s+at|jobs?|recruiting|recruitment|hiring|join us)\b/gi; // 英文按整词，不误删 Jobsity
  const EDGE = /^[\s|｜\-–—_·•:：]+|[\s|｜\-–—_·•:：]+$/g;

  JT.splitTitle = (title) => String(title || '').split(SEPARATORS).map((s) => s.trim()).filter(Boolean);

  JT.cleanCompany = (s) => String(s || '').replace(NOISE_ZH, ' ').replace(NOISE_EN, ' ').replace(EDGE, '').replace(/\s{2,}/g, ' ').trim();

  /** 岗位优先用页面主标题，其次用标题第一段；公司优先用 og:site_name，其次用标题最后一段 */
  JT.guessFromPage = ({ title = '', h1 = '', siteName = '' } = {}) => {
    const parts = JT.splitTitle(title);
    const heading = h1 && h1.length <= 40 ? h1.trim() : '';
    const position = heading || (parts.length > 1 ? parts[0] : '');
    const company = JT.cleanCompany(siteName) || JT.cleanCompany(parts.length > 1 ? parts[parts.length - 1] : parts[0] || '');
    return { position: position.slice(0, 60), company: company.slice(0, 40) };
  };

  JT.tidyText = (s) => String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 30000);

  // ---------- DOM ----------
  const JOB_SELECTORS = [
    '[class*="job-detail"]', '[class*="jobDetail"]', '[class*="position-detail"]', '[class*="positionDetail"]',
    '[class*="job-description"]', '[class*="jobDescription"]', '[class*="post-detail"]', '[class*="jd-"]',
    'article', 'main', '[role="main"]',
  ];

  /** JD 正文：按选择器优先级找，同一级里取文字最多的；都没有就用整页文字 */
  JT.mainText = (doc = document) => {
    for (const sel of JOB_SELECTORS) {
      let top = null;
      for (const el of doc.querySelectorAll(sel)) {
        if (el.closest('#jt-panel-host')) continue;
        const len = (el.innerText || '').length;
        if (len > 150 && (!top || len > top.len)) top = { el, len };
      }
      if (top) return JT.tidyText(top.el.innerText);
    }
    return JT.tidyText(doc.body ? doc.body.innerText : '');
  };

  /** 页面主标题：跳过页头、导航里的 logo 文字 */
  JT.headingText = (doc = document) => {
    const el = [...doc.querySelectorAll('h1, h2')].find((h) => {
      const t = JT.textOf(h);
      return !h.closest('header, nav, footer, #jt-panel-host') && t.length >= 2 && t.length <= 40;
    });
    return el ? JT.textOf(el) : '';
  };

  JT.pageInfo = (doc = document) => {
    const meta = (p) => doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute('content') || '';
    const info = {
      url: doc.location ? doc.location.href : '',
      title: doc.title || '',
      siteName: meta('og:site_name'),
      h1: JT.headingText(doc),
      text: JT.mainText(doc),
    };
    return { ...info, ...JT.guessFromPage(info) };
  };
})();
