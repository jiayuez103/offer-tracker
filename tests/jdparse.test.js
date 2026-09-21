import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJD } from '../shared/jdparse.js';
import { guessCompanyFromUrl } from '../shared/companies.js';

const NOW = new Date('2026-09-21T18:00:00Z');

test('从常见官网域名识别公司', () => {
  assert.deepEqual(guessCompanyFromUrl('https://www.pgcareers.com/global/en/job/123'), { company: '宝洁', companyType: '外企' });
  assert.deepEqual(guessCompanyFromUrl('https://jobs.bytedance.com/campus/position/123/detail'), { company: '字节跳动', companyType: '大厂' });
  assert.deepEqual(guessCompanyFromUrl('https://join.qq.com/post_detail.html?postid=1'), { company: '腾讯', companyType: '大厂' });
});

test('从招聘系统域名取公司代号', () => {
  assert.deepEqual(guessCompanyFromUrl('https://loreal.wd3.myworkdayjobs.com/en-US/careers/job/123'), { company: 'loreal', companyType: '' });
  assert.deepEqual(guessCompanyFromUrl('https://app.mokahr.com/campus-recruitment/mihoyo/12345#/job/1'), { company: 'mihoyo', companyType: '' });
  assert.deepEqual(guessCompanyFromUrl('https://pepsico.zhiye.com/campus/detail?jobAdId=1'), { company: 'pepsico', companyType: '' });
  assert.equal(guessCompanyFromUrl('https://docs.google.com/document/d/1'), null);
  assert.equal(guessCompanyFromUrl('not a url'), null);
});

test('中文 JD：标签式字段', () => {
  const jd = [
    '市场部管理培训生',
    '公司名称：雀巢（中国）有限公司',
    '工作地点：上海、北京',
    '岗位职责：',
    '1. 参与品牌策略制定',
    '网申截止时间：2026年10月15日',
  ].join('\n');
  assert.deepEqual(parseJD(jd, '', NOW), {
    company: '雀巢（中国）有限公司', companyType: '', position: '市场部管理培训生', cities: '上海/北京', deadline: '2026-10-15',
  });
});

test('英文 JD + 官网链接：官网的公司名优先', () => {
  const jd = 'Job Title: Brand Management Trainee\nLocation: Hong Kong\nApplication deadline: 10/31';
  assert.deepEqual(parseJD(jd, 'https://www.pgcareers.com/job/1', NOW), {
    company: '宝洁', companyType: '外企', position: 'Brand Management Trainee', cities: 'Hong Kong', deadline: '2026-10-31',
  });
});

test('招聘系统代号会被 JD 里的公司名覆盖', () => {
  const jd = '公司：百事食品（中国）\n岗位：市场管培生';
  assert.equal(parseJD(jd, 'https://pepsico.zhiye.com/x', NOW).company, '百事食品（中国）');
});

test('没写年份且日期已过很久 → 算明年', () => {
  assert.equal(parseJD('截止日期：3月1日', '', NOW).deadline, '2027-03-01');
});

test('什么都拆不出来时全部留空', () => {
  assert.deepEqual(parseJD('随便一段话', '', NOW), { company: '', companyType: '', position: '', cities: '', deadline: '' });
});
