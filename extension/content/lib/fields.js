// 网申表单字段字典：表单上的标签文字 → 档案里的哪个值。
// labels：单独出现就能确定；contextLabels：只在 scope 对应的分节里才算数。
// groups：选择类字段的选项分组，越具体的排越前（「预备党员」要在「党员」前面）。
(() => {
  const JT = (globalThis.JT = globalThis.JT || {});

  const GENDER = [
    { key: 'female', words: ['女', '女性', 'female', 'woman', 'f'] },
    { key: 'male', words: ['男', '男性', 'male', 'man', 'm'] },
  ];
  const DEGREE = [
    { key: 'phd', words: ['博士', 'phd', 'doctor', 'doctorate', 'doctoral'] },
    { key: 'master', words: ['硕士', '研究生', 'master', 'masters', "master's", 'ms', 'msc', 'ma', 'mba', 'mphil', 'meng', 'postgraduate', 'graduate'] },
    { key: 'bachelor', words: ['本科', '学士', 'bachelor', 'bachelors', "bachelor's", 'bs', 'bsc', 'ba', 'undergraduate'] },
    { key: 'associate', words: ['大专', '专科', '高职', 'associate', 'diploma'] },
  ];
  const POLITICAL = [
    { key: 'probationary', words: ['预备党员'] },
    { key: 'party', words: ['中共党员', '党员'] },
    { key: 'league', words: ['共青团员', '团员'] },
    { key: 'democratic', words: ['民主党派'] },
    { key: 'masses', words: ['群众', '无党派'] },
  ];
  const YES_NO = [
    { key: 'no', words: ['否', '不接受', '不服从', '不愿意', 'no'] },
    { key: 'yes', words: ['是', '接受', '服从', '愿意', 'yes'] },
  ];
  const WORK_TYPE = [
    { key: 'intern', words: ['实习', 'internship', 'intern'] },
    { key: 'full', words: ['全职', 'full time'] },
    { key: 'part', words: ['兼职', 'part time'] },
  ];

  const START = ['开始时间', '开始日期', '起始时间', '起始日期', '开始年月', 'start date', 'start', 'from'];
  const END = ['结束时间', '结束日期', '结束年月', 'end date', 'end', 'to'];
  const RANGE = ['起止时间', '起止日期', '时间段', '时间', '日期', 'dates', 'duration', 'period', 'time period'];
  const DESC = ['描述', '内容', '说明', '介绍', '经历描述', '详细描述', 'description', 'details', 'responsibilities'];
  const NAME = ['名称', 'name', 'title'];
  const ROLE = ['角色', '职务', '职位', '担任', 'role', 'position', 'title'];

  const f = (key, source, labels, extra = {}) => ({
    key,
    source,
    labels,
    kind: 'text',
    contextLabels: [],
    scope: typeof source === 'object' ? source.list : null,
    ...extra,
  });
  const L = (list, field) => ({ list, field });

  JT.FIELDS = [
    // 基本信息
    f('name', 'basic.name', ['姓名', '名字', '真实姓名', '中文姓名', '中文名', '你的姓名', '您的姓名', 'name', 'full name', 'legal name', 'your name']),
    f('familyName', 'basic.familyName', ['姓', '姓氏', 'last name', 'family name', 'surname']),
    f('givenName', 'basic.givenName', ['名', 'first name', 'given name']),
    f('englishName', 'basic.preferredName', ['英文名', '英文名字', '英文姓名', 'english name', 'preferred name', 'nickname']),
    f('gender', 'basic.gender', ['性别', 'gender', 'sex'], { kind: 'choice', groups: GENDER }),
    f('birthDate', 'basic.birthDate', ['出生日期', '出生年月', '生日', 'date of birth', 'birth date', 'birthday'], { kind: 'date' }),
    f('phoneCode', 'basic.phoneCountryCode', ['区号', '国家区号', '国际区号', '手机区号', 'country code', 'phone code', 'country phone code', 'dialing code'], { kind: 'choice' }),
    f('phone', 'basic.phone', ['手机', '手机号', '手机号码', '联系电话', '电话', '电话号码', '移动电话', 'mobile', 'phone', 'phone number', 'mobile number', 'mobile phone', 'cell phone', 'telephone']),
    f('email', 'basic.email', ['邮箱', '电子邮箱', '邮箱地址', '邮件', '电子邮件', 'email', 'e-mail', 'email address']),
    f('wechat', 'basic.wechat', ['微信', '微信号', 'wechat', 'wechat id']),
    f('currentCity', 'basic.currentCity', ['现居住地', '现居住城市', '现居城市', '现居地', '居住地', '居住城市', '所在城市', '当前城市', '当前所在地', 'current city', 'current location', 'city of residence'], { scope: 'basic', contextLabels: ['城市', '所在地', 'city', 'location'] }),
    f('hometown', 'basic.hometown', ['籍贯', 'native place', 'hometown']),
    f('residence', 'basic.residence', ['户口所在地', '户籍所在地', '户籍', '户口', '生源地', 'hukou', 'household registration']),
    f('nationality', 'basic.nationality', ['国籍', 'nationality', 'citizenship'], { kind: 'choice' }),
    f('political', 'basic.politicalStatus', ['政治面貌', 'political status'], { kind: 'choice', groups: POLITICAL }),
    f('ethnicity', 'basic.ethnicity', ['民族', 'ethnicity'], { kind: 'choice' }),
    f('linkedin', 'basic.linkedin', ['linkedin', 'linkedin profile', '领英']),
    f('website', 'basic.website', ['个人网站', '个人主页', '作品集链接', 'website', 'personal website', 'portfolio']),
    // 求职意向
    f('intentPosition', 'intent.positions', ['意向岗位', '意向职位', '期望职位', '期望岗位', '求职意向', 'desired position']),
    f('intentCity', 'intent.cities', ['意向城市', '期望城市', '期望工作地点', '意向工作地点', '意向工作城市', 'preferred location', 'preferred city', 'preferred work location']),
    f('salary', 'intent.salary', ['期望薪资', '期望月薪', '期望薪酬', '期望年薪', 'expected salary', 'salary expectation']),
    f('available', 'intent.availableFrom', ['到岗时间', '最早到岗时间', '可到岗时间', '可入职时间', '最早入职时间', 'available start date', 'availability', 'earliest start date']),
    f('adjust', 'intent.acceptAdjustment', ['是否接受调剂', '是否服从调剂', '接受调剂', '服从调剂'], { kind: 'choice', groups: YES_NO }),
    // 教育经历
    f('edu.school', L('education', 'school'), ['学校', '学校名称', '毕业院校', '毕业学校', '院校', '院校名称', '就读院校', '就读学校', 'school', 'school name', 'university', 'school or university', 'college or university', 'institution']),
    f('edu.degree', L('education', 'degree'), ['学历', '学位', '学历层次', '最高学历', '学历学位', 'degree', 'degree type', 'education level', 'level of education'], { kind: 'choice', groups: DEGREE }),
    f('edu.major', L('education', 'major'), ['专业', '专业名称', '所学专业', '主修专业', 'major', 'field of study', 'discipline', 'area of study']),
    f('edu.college', L('education', 'college'), ['学院', '所在学院', '院系', '所在院系'], { contextLabels: ['department', 'faculty', '系'] }),
    f('edu.gpa', L('education', 'gpa'), ['gpa', '绩点', '平均绩点', '平均学分绩点', 'grade point average', 'cumulative gpa'], { contextLabels: ['成绩'] }),
    f('edu.gpaScale', L('education', 'gpaScale'), ['满分', 'gpa满分', '绩点满分', 'gpa scale', 'out of']),
    f('edu.rank', L('education', 'rank'), ['专业排名', '成绩排名', '年级排名', 'class rank'], { contextLabels: ['排名', 'rank', 'ranking'] }),
    f('edu.courses', L('education', 'courses'), ['主修课程', '主要课程', '相关课程', 'relevant coursework', 'coursework', 'courses']),
    f('edu.honors', L('education', 'honors'), ['在校荣誉', '在校获奖'], { contextLabels: ['荣誉', '获奖', 'honors'] }),
    f('edu.city', L('education', 'city'), ['学校所在地', '学校所在城市'], { contextLabels: ['城市', '所在城市', '所在地', 'city', 'location'] }),
    f('edu.start', L('education', 'start'), ['入学时间', '入学日期', '入学年月'], { kind: 'month', contextLabels: START }),
    f('edu.end', L('education', 'end'), ['毕业时间', '毕业日期', '毕业年月', '预计毕业时间', 'graduation date', 'expected graduation'], { kind: 'month', contextLabels: END }),
    f('edu.range', L('education', 'range'), ['在校时间', '就读时间', '在读时间'], { kind: 'range', contextLabels: RANGE }),
    // 实习 / 工作
    f('work.company', L('work', 'company'), ['公司', '公司名称', '实习单位', '实习公司', '工作单位', '单位名称', '企业名称', 'company', 'company name', 'employer', 'organization name']),
    f('work.title', L('work', 'title'), ['职位名称', '实习岗位', '实习职位', '担任职位', '岗位名称', 'job title'], { contextLabels: [...ROLE, '岗位'] }),
    f('work.department', L('work', 'department'), ['所在部门', '部门名称'], { contextLabels: ['部门', 'department', 'team'] }),
    f('work.type', L('work', 'type'), ['工作类型', '经历类型', '工作性质'], { kind: 'choice', groups: WORK_TYPE }),
    f('work.city', L('work', 'city'), ['工作城市', '工作地点', '实习城市', '实习地点'], { contextLabels: ['城市', '所在城市', '地点', '所在地', 'city', 'location'] }),
    f('work.start', L('work', 'start'), ['入职时间', '入职日期', '实习开始时间'], { kind: 'month', contextLabels: START }),
    f('work.end', L('work', 'end'), ['离职时间', '离职日期', '实习结束时间'], { kind: 'month', contextLabels: END }),
    f('work.range', L('work', 'range'), ['实习时间', '工作时间', '任职时间'], { kind: 'range', contextLabels: RANGE }),
    f('work.description', L('work', 'description'), ['工作内容', '工作描述', '实习内容', '实习描述', '工作职责', '主要职责', '职责描述', 'job description', 'work description'], { contextLabels: DESC }),
    // 项目
    f('proj.name', L('projects', 'name'), ['项目名称', '项目名', 'project name', 'project title'], { contextLabels: NAME }),
    f('proj.role', L('projects', 'role'), ['项目角色', '担任角色', '项目职务', 'project role'], { contextLabels: ROLE }),
    f('proj.start', L('projects', 'start'), [], { kind: 'month', contextLabels: START }),
    f('proj.end', L('projects', 'end'), [], { kind: 'month', contextLabels: END }),
    f('proj.range', L('projects', 'range'), ['项目时间', '项目周期'], { kind: 'range', contextLabels: RANGE }),
    f('proj.description', L('projects', 'description'), ['项目描述', '项目内容', '项目介绍', 'project description'], { contextLabels: DESC }),
    // 校园 / 社团
    f('act.org', L('activities', 'org'), ['组织名称', '社团名称', '学生组织', 'organization', 'club'], { contextLabels: [...NAME, '组织', '社团'] }),
    f('act.role', L('activities', 'role'), ['担任职务', '社团职务'], { contextLabels: ROLE }),
    f('act.start', L('activities', 'start'), [], { kind: 'month', contextLabels: START }),
    f('act.end', L('activities', 'end'), [], { kind: 'month', contextLabels: END }),
    f('act.range', L('activities', 'range'), ['活动时间'], { kind: 'range', contextLabels: RANGE }),
    f('act.description', L('activities', 'description'), ['经历描述', '活动描述', '活动内容'], { contextLabels: DESC }),
    // 获奖
    f('award.name', L('awards', 'name'), ['奖项名称', '获奖名称', '荣誉名称', '奖项', 'award name', 'award', 'honor'], { contextLabels: NAME }),
    f('award.date', L('awards', 'date'), ['获奖时间', '获奖日期', '获得时间'], { kind: 'month', contextLabels: ['时间', '日期', 'date'] }),
    f('award.description', L('awards', 'description'), ['获奖描述', '奖项描述', '获奖说明'], { contextLabels: DESC }),
    // 语言
    f('lang.language', L('languages', 'language'), ['语种', '语言种类', '外语语种', 'language'], { kind: 'choice' }),
    f('lang.level', L('languages', 'level'), ['熟练程度', '掌握程度', '语言水平', '外语水平', 'proficiency', 'language proficiency'], { kind: 'choice', contextLabels: ['水平', '程度', 'level'] }),
    f('lang.certificate', L('languages', 'certificate'), ['语言证书', '外语证书', '考试类型', '证书类型'], { contextLabels: ['证书', 'certificate'] }),
    f('lang.score', L('languages', 'score'), ['考试成绩', '语言成绩'], { contextLabels: ['成绩', '分数', 'score'] }),
    // 证书
    f('cert.name', L('certificates', 'name'), ['证书名称', '资格证书名称', 'certificate name', 'certification'], { contextLabels: NAME }),
    f('cert.date', L('certificates', 'date'), ['获证时间', '发证日期', '获得证书时间'], { kind: 'month', contextLabels: ['时间', '日期', 'date'] }),
    f('cert.score', L('certificates', 'score'), [], { contextLabels: ['成绩', '等级', '分数', 'score', 'level'] }),
    // 其他
    f('skills', 'skills', ['专业技能', '技能特长', '掌握技能', '个人技能', '技能', 'skills', 'technical skills']),
    f('selfIntro', 'selfIntro', ['自我评价', '自我介绍', '个人简介', '个人优势', '个人评价', '自我描述', 'self evaluation', 'self introduction', 'about me', 'personal statement', 'summary']),
    f('hobbies', 'hobbies', ['兴趣爱好', '爱好', '兴趣', '特长', 'hobbies', 'interests']),
  ];

  JT.SECTIONS = [
    { key: 'education', words: ['教育经历', '教育背景', '学历信息', '教育信息', '学习经历', '教育', 'education', 'academic background'] },
    { key: 'work', words: ['实习经历', '工作经历', '实习经验', '工作经验', '实践经历', '职业经历', '实习', 'work experience', 'employment', 'internship', 'internships', 'experience', 'professional experience'] },
    { key: 'projects', words: ['项目经历', '项目经验', '科研经历', '项目', 'project', 'projects', 'research'] },
    { key: 'activities', words: ['校园经历', '社团经历', '学生工作', '在校经历', '社会实践', '课外活动', '社团', 'activities', 'extracurricular', 'leadership', 'campus'] },
    { key: 'awards', words: ['获奖经历', '获奖情况', '荣誉奖励', '奖项', '获奖', '荣誉', 'award', 'awards', 'honors'] },
    { key: 'languages', words: ['语言能力', '外语能力', '语言', 'language', 'languages'] },
    { key: 'certificates', words: ['证书', '资格证书', '技能证书', 'certificate', 'certificates', 'certifications', 'licenses'] },
    { key: 'basic', words: ['基本信息', '个人信息', '联系方式', 'personal information', 'basic information', 'contact information', 'personal details', 'my information'] },
    { key: 'intent', words: ['求职意向', '应聘意向', '意向信息', 'job preference', 'preferences'] },
  ];
})();
