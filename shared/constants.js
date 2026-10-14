// 全局常量：网页、服务端、以后的线上后端共用

export const STAGES = [
  { key: 'wishlist', label: '待投递' },
  { key: 'applied', label: '已投递' },
  { key: 'assessment', label: '测评/笔试' },
  { key: 'interview', label: '面试' },
  { key: 'final', label: '终面' },
  { key: 'offer', label: 'Offer' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export const STATUSES = [
  { key: 'active', label: '进行中' },
  { key: 'rejected', label: '挂了' },
  { key: 'withdrawn', label: '放弃' },
  { key: 'accepted', label: '已接受' },
  { key: 'declined', label: '已拒绝' },
];
export const STATUS_KEYS = STATUSES.map((s) => s.key);
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));
// 进「已结束」列的状态；accepted / declined 留在 Offer 列
export const CLOSED_STATUSES = ['rejected', 'withdrawn'];

export const EVENT_TYPES = ['测评', '笔试', 'AI面', '群面', '面试', '终面', 'HR面', 'Offer', '其他'];
// 结束后需要写复盘的日程类型
export const INTERVIEW_EVENT_TYPES = ['AI面', '群面', '面试', '终面', 'HR面'];
// 添加这类日程时，建议把投递推进到的阶段
export const EVENT_STAGE = {
  测评: 'assessment', 笔试: 'assessment', AI面: 'assessment',
  群面: 'interview', 面试: 'interview',
  终面: 'final', HR面: 'final',
  Offer: 'offer',
};

export const COMPANY_TYPES = ['外企', '大厂', '国企', '民企', '其他'];
export const TRACKS = ['产品', '市场', '其他'];
export const BATCHES = ['提前批', '秋招正式批', '补录', '其他'];
export const CHANNELS = ['官网', '内推', '宣讲会', '招聘平台', '邮件', 'LinkedIn', '其他'];
export const INDUSTRY_SUGGESTIONS = ['快消', '互联网', '汽车', '咨询', '奢侈品', '美妆', '食品饮料', '零售', '金融', '医药', '科技'];

export const ANSWER_CATEGORIES = ['自我介绍', 'Why 公司', 'Why 岗位', '领导力', '团队合作', '挑战/失败', '创新', '职业规划', '优缺点', '其他'];

export const DEFAULT_SETTINGS = {
  staleDays: 14,
  weeklyGoal: 10,
  homeTz: 'America/Los_Angeles',
  homeTzLabel: '洛杉矶',
  targetTz: 'Asia/Shanghai',
  targetTzLabel: '北京',
  eventInputTz: 'Asia/Shanghai',
  // 用户自备的模型服务。apiKey 只存在本机，服务端读，绝不返回给网页
  ai: { format: 'openai', baseUrl: '', model: '', apiKey: '', forbidden: [], enabled: false },
};

export const COLLECTIONS = ['applications', 'answers', 'resumes'];
export const ID_PREFIX = { applications: 'app', answers: 'ans', resumes: 'res' };
