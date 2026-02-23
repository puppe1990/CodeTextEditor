document.addEventListener('DOMContentLoaded', () => {
  const openEditorBtn = document.getElementById('openEditor');
  const themeSelect = document.getElementById('themeSelect');

  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { theme: 'dark', fontSize: 14, tabSize: 2 };
    themeSelect.value = settings.theme;
  });

  openEditorBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor/index.html') });
    window.close();
  });

  themeSelect.addEventListener('change', (e) => {
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || { theme: 'dark', fontSize: 14, tabSize: 2 };
      settings.theme = e.target.value;
      chrome.storage.local.set({ settings });
    });
  });
});
