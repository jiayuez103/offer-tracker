// 招聘官网域名 → 公司名、公司类型。新建投递和插件收藏岗位时用来自动识别。
// 主机名等于该域名，或以 "." + 域名 结尾，都算命中。

export const COMPANY_DOMAINS = [
  // 快消 / 消费 / 外企
  ['pgcareers.com', '宝洁', '外企'], ['pg.com.cn', '宝洁', '外企'], ['pg.com', '宝洁', '外企'],
  ['unilever.com', '联合利华', '外企'], ['unilever.com.cn', '联合利华', '外企'],
  ['nestle.com', '雀巢', '外企'], ['nestle.com.cn', '雀巢', '外企'],
  ['loreal.com', '欧莱雅', '外企'], ['loreal.com.cn', '欧莱雅', '外企'], ['lorealchina.com', '欧莱雅', '外企'],
  ['mars.com', '玛氏', '外企'],
  ['pepsico.com', '百事', '外企'], ['pepsico.com.cn', '百事', '外企'], ['pepsicojobs.com', '百事', '外企'],
  ['coca-colacompany.com', '可口可乐', '外企'], ['coca-cola.com.cn', '可口可乐', '外企'], ['swirecocacola.com', '太古可口可乐', '外企'],
  ['danone.com', '达能', '外企'], ['danone.com.cn', '达能', '外企'],
  ['mondelezinternational.com', '亿滋', '外企'],
  ['jnj.com', '强生', '外企'],
  ['elcompanies.com', '雅诗兰黛', '外企'],
  ['shiseido.com.cn', '资生堂', '外企'],
  ['ab-inbev.com', '百威', '外企'], ['budweiserapac.com', '百威亚太', '外企'],
  ['heineken.com', '喜力', '外企'], ['diageo.com', '帝亚吉欧', '外企'], ['pernod-ricard.com', '保乐力加', '外企'],
  ['lvmh.com', 'LVMH', '外企'], ['kering.com', '开云', '外企'],
  ['kimberly-clark.com', '金佰利', '外企'], ['reckitt.com', '利洁时', '外企'], ['colgatepalmolive.com', '高露洁', '外企'],
  ['kraftheinz.com', '卡夫亨氏', '外企'], ['generalmills.com', '通用磨坊', '外企'], ['ferrero.com', '费列罗', '外企'],
  ['yumchina.com', '百胜中国', '外企'], ['mcdonalds.com.cn', '麦当劳', '外企'], ['starbucks.com.cn', '星巴克', '外企'],
  ['jlr.com', '捷豹路虎', '外企'], ['jaguarlandrover.com', '捷豹路虎', '外企'], ['bmw.com.cn', '宝马', '外企'],
  ['mercedes-benz.com.cn', '奔驰', '外企'], ['siemens.com', '西门子', '外企'], ['bosch.com.cn', '博世', '外企'],
  ['jobs.apple.com', 'Apple', '外企'], ['careers.microsoft.com', '微软', '外企'], ['careers.google.com', 'Google', '外企'],
  ['amazon.jobs', '亚马逊', '外企'],
  // 互联网大厂
  ['jobs.bytedance.com', '字节跳动', '大厂'], ['bytedance.com', '字节跳动', '大厂'],
  ['join.qq.com', '腾讯', '大厂'], ['careers.tencent.com', '腾讯', '大厂'],
  ['talent.alibaba.com', '阿里巴巴', '大厂'], ['campus-talent.alibaba.com', '阿里巴巴', '大厂'], ['talent-holding.alibaba.com', '阿里巴巴', '大厂'],
  ['talent.antgroup.com', '蚂蚁集团', '大厂'],
  ['zhaopin.meituan.com', '美团', '大厂'], ['campus.meituan.com', '美团', '大厂'],
  ['campus.jd.com', '京东', '大厂'], ['zhaopin.jd.com', '京东', '大厂'],
  ['talent.baidu.com', '百度', '大厂'],
  ['campus.163.com', '网易', '大厂'], ['hr.163.com', '网易', '大厂'],
  ['campus.kuaishou.cn', '快手', '大厂'], ['zhaopin.kuaishou.cn', '快手', '大厂'],
  ['careers.pddglobalhr.com', '拼多多', '大厂'],
  ['job.xiaohongshu.com', '小红书', '大厂'],
  ['jobs.bilibili.com', '哔哩哔哩', '大厂'],
  ['talent.didiglobal.com', '滴滴', '大厂'],
  ['career.huawei.com', '华为', '大厂'],
  ['hr.xiaomi.com', '小米', '大厂'],
  ['careers.trip.com', '携程', '大厂'], ['job.ctrip.com', '携程', '大厂'],
  ['jobs.mihoyo.com', '米哈游', '大厂'],
  ['careers.oppo.com', 'OPPO', '大厂'], ['hr-campus.vivo.com', 'vivo', '大厂'],
  // 新能源车
  ['nio.com', '蔚来', '民企'], ['lixiang.com', '理想汽车', '民企'], ['xiaopeng.com', '小鹏汽车', '民企'], ['job.byd.com', '比亚迪', '民企'],
];

// 招聘系统（ATS）：公司代号在子域名、路径或参数里
const ATS = [
  { host: 'mokahr.com', from: 'path' },          // app.mokahr.com/campus-recruitment/<代号>/…
  { host: 'myworkdayjobs.com', from: 'sub' },    // <代号>.wd3.myworkdayjobs.com
  { host: 'zhiye.com', from: 'sub' },            // <代号>.zhiye.com（北森）
  { host: 'jobs.feishu.cn', from: 'sub' },       // <代号>.jobs.feishu.cn
  { host: 'avature.net', from: 'sub' },
  { host: 'hotjob.cn', from: 'sub' },            // 大易
  { host: 'successfactors.com', from: 'query' }, // ?company=<代号>
  { host: 'successfactors.eu', from: 'query' },
];

const BY_LENGTH = [...COMPANY_DOMAINS].sort((a, b) => b[0].length - a[0].length);
const GENERIC_SLUGS = new Set(['www', 'app', 'careers', 'jobs', 'campus']);

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** 从链接猜公司：返回 { company, companyType } 或 null。ATS 只能拿到英文代号，companyType 为空 */
export function guessCompanyFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const hit = BY_LENGTH.find(([domain]) => hostMatches(host, domain));
  if (hit) return { company: hit[1], companyType: hit[2] };
  for (const ats of ATS) {
    if (!hostMatches(host, ats.host)) continue;
    let slug = '';
    if (ats.from === 'sub') slug = host.slice(0, -(ats.host.length + 1)).split('.')[0];
    if (ats.from === 'path') {
      const segs = u.pathname.split('/').filter(Boolean);
      const i = segs.findIndex((seg) => /recruitment|apply/.test(seg));
      slug = i >= 0 ? segs[i + 1] || '' : '';
    }
    if (ats.from === 'query') slug = u.searchParams.get('company') || '';
    if (slug && !GENERIC_SLUGS.has(slug)) return { company: slug, companyType: '' };
  }
  return null;
}
