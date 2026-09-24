import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentScripts, plain } from './load.js';

const JT = loadContentScripts(['content/lib/fields.js', 'content/lib/match.js', 'content/lib/clip.js']);

test('拆标题：只在两边有空格的横线或竖线处拆，不拆 E-commerce', () => {
  assert.deepEqual(plain(JT.splitTitle('品牌管理培训生 - 示例公司校园招聘')), ['品牌管理培训生', '示例公司校园招聘']);
  assert.deepEqual(plain(JT.splitTitle('Brand Manager | Careers at Example')), ['Brand Manager', 'Careers at Example']);
  assert.deepEqual(plain(JT.splitTitle('E-commerce Manager')), ['E-commerce Manager']);
});

test('清理公司名里的招聘字样', () => {
  assert.equal(JT.cleanCompany('示例公司校园招聘'), '示例公司');
  assert.equal(JT.cleanCompany('Careers at Example'), 'Example');
  assert.equal(JT.cleanCompany('加入我们 | 示例公司'), '示例公司');
  assert.equal(JT.cleanCompany('Jobsity'), 'Jobsity');
  assert.equal(JT.cleanCompany('示例公司校园招聘门户'), '示例公司'); // 招聘门户：标题是「公司名 + 校园招聘门户」
});

test('从页面信息猜公司和岗位', () => {
  assert.deepEqual(plain(JT.guessFromPage({ title: '品牌管理培训生 - 示例公司校园招聘', h1: '品牌管理培训生', siteName: '' })), { position: '品牌管理培训生', company: '示例公司' });
  assert.deepEqual(plain(JT.guessFromPage({ title: 'Brand Manager | Example', h1: '', siteName: 'Example Inc' })), { position: 'Brand Manager', company: 'Example Inc' });
  assert.deepEqual(plain(JT.guessFromPage({ title: '示例公司', h1: '', siteName: '' })), { position: '', company: '示例公司' });
});

test('整理正文：去掉多余空行', () => {
  assert.equal(JT.tidyText('a  \n\n\n\nb\r\n'), 'a\n\nb');
});
