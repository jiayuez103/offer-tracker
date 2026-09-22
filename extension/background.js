// 秋招助手后台：点图标或按快捷键打开侧边栏；处理侧边栏发来的消息。
import { createHandlers } from './bg/handlers.js';

const { handlers, toggle } = createHandlers({ chrome, fetch: (...args) => fetch(...args) });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender.tab ? sender.tab.id : undefined))
    .then(sendResponse, (e) => sendResponse({ error: (e && e.message) || String(e) }));
  return true; // 异步回复
});

async function openPanel(tab) {
  if (!tab || tab.id == null) return;
  try {
    await toggle(tab.id);
  } catch (e) {
    // chrome:// 页面、应用商店等不允许注入：在图标上提示一下
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: `秋招助手不能在这个页面使用：${e.message}` });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {}), 3000);
  }
}

chrome.action.onClicked.addListener(openPanel);
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-panel') openPanel(tab);
});
