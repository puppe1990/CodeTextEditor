document.addEventListener('DOMContentLoaded', () => {
  const openEditorBtn = document.getElementById('openEditor');
  const themeSelect = document.getElementById('themeSelect');
  const fontSizeInput = document.getElementById('fontSizeInput');
  const tabSizeInput = document.getElementById('tabSizeInput');

  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { theme: 'dark', fontSize: 14, tabSize: 2 };
    themeSelect.value = settings.theme;
    fontSizeInput.value = settings.fontSize;
    tabSizeInput.value = settings.tabSize;
  });

  openEditorBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor/index.html') });
    window.close();
  });

  themeSelect.addEventListener('change', (e) => {
    updateSettings({ theme: e.target.value });
  });

  fontSizeInput.addEventListener('change', (e) => {
    const fontSize = Number(e.target.value);
    if (!Number.isFinite(fontSize)) return;
    updateSettings({ fontSize: Math.min(28, Math.max(10, fontSize)) });
  });

  tabSizeInput.addEventListener('change', (e) => {
    const tabSize = Number(e.target.value);
    if (!Number.isFinite(tabSize)) return;
    updateSettings({ tabSize: Math.min(8, Math.max(1, tabSize)) });
  });
});

function updateSettings(partial) {
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { theme: 'dark', fontSize: 14, tabSize: 2 };
    chrome.storage.local.set({ settings: { ...settings, ...partial } });
  });
}
