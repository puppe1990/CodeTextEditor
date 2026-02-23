import { fileTree } from './fileTree.js';
import { shortcuts } from './shortcuts.js';

console.log('CodeSnip Editor v1.0.2 loaded');

class SimpleEditorView {
  constructor(parent, { onChange, onCursorChange, fontSize, tabSize }) {
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'simple-editor-input';
    this.textarea.spellcheck = false;
    this.textarea.wrap = 'off';
    this.textarea.style.fontSize = `${fontSize}px`;
    this.textarea.style.tabSize = String(tabSize);

    this.onChange = onChange;
    this.onCursorChange = onCursorChange;

    this.textarea.addEventListener('input', () => {
      this.onChange?.();
    });

    this.textarea.addEventListener('click', () => {
      this.onCursorChange?.();
    });

    this.textarea.addEventListener('keyup', () => {
      this.onCursorChange?.();
    });

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const spaces = ' '.repeat(Math.max(1, Number(tabSize) || 2));
        const content = this.textarea.value;
        this.textarea.value = `${content.slice(0, start)}${spaces}${content.slice(end)}`;
        this.textarea.selectionStart = this.textarea.selectionEnd = start + spaces.length;
        this.onChange?.();
        this.onCursorChange?.();
      }
    });

    parent.innerHTML = '';
    parent.appendChild(this.textarea);
  }

  getContent() {
    return this.textarea.value;
  }

  setContent(content) {
    this.textarea.value = content;
    this.textarea.selectionStart = 0;
    this.textarea.selectionEnd = 0;
  }

  focus() {
    this.textarea.focus();
  }

  getSelection() {
    return {
      start: this.textarea.selectionStart,
      end: this.textarea.selectionEnd,
    };
  }

  setCursor(pos) {
    this.textarea.selectionStart = pos;
    this.textarea.selectionEnd = pos;
    this.onCursorChange?.();
  }

  replaceRange(from, to, insert) {
    const content = this.getContent();
    this.setContent(`${content.slice(0, from)}${insert}${content.slice(to)}`);
  }

  lineAt(pos) {
    const content = this.getContent();
    const safePos = Math.max(0, Math.min(pos, content.length));
    const before = content.slice(0, safePos);
    const lineNumber = before.split('\n').length;
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEndIdx = content.indexOf('\n', safePos);
    const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;

    return {
      number: lineNumber,
      from: lineStart,
      to: lineEnd,
      text: content.slice(lineStart, lineEnd),
    };
  }

  get lines() {
    const content = this.getContent();
    return content.length ? content.split('\n').length : 1;
  }
}

class CodeEditor {
  constructor() {
    this.view = null;
    this.currentFileHandle = null;
    this.currentFileName = 'No file open';
    this.currentLanguage = 'Plain Text';
    this.dirty = false;
    this.settings = {
      theme: 'dark',
      fontSize: 14,
      tabSize: 2,
    };
    this.activeTopMenu = null;

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.initEditor();
    this.initEventListeners();
    await fileTree.init(this.renderFileTree.bind(this));
    this.updateStatusBar();
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        if (result.settings) {
          this.settings = { ...this.settings, ...result.settings };
        }
        resolve();
      });
    });
  }

  getLanguageFromFileName(fileName) {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    const langMap = {
      js: 'JavaScript',
      jsx: 'JavaScript (JSX)',
      ts: 'TypeScript',
      tsx: 'TypeScript (TSX)',
      html: 'HTML',
      htm: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      less: 'LESS',
      py: 'Python',
      json: 'JSON',
      md: 'Markdown',
      mdx: 'Markdown (MDX)',
      sql: 'SQL',
    };
    return langMap[ext] || 'Plain Text';
  }

  initEditor() {
    const editorElement = document.getElementById('editor');
    this.view = new SimpleEditorView(editorElement, {
      fontSize: this.settings.fontSize,
      tabSize: this.settings.tabSize,
      onChange: () => {
        this.dirty = true;
        this.updateStatusBar();
      },
      onCursorChange: () => {
        this.updateStatusBar();
      },
    });

    this.updateThemeUI();
  }

  updateThemeUI() {
    document.documentElement.setAttribute('data-theme', this.settings.theme);
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      themeBtn.textContent = this.settings.theme === 'dark' ? '🌓' : '🌙';
    }
  }

  toggleTheme() {
    this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
    chrome.storage.local.set({ settings: this.settings });
    this.updateThemeUI();
  }

  async openFile(handle) {
    this.currentFileHandle = handle;
    const file = await handle.getFile();
    const content = await file.text();

    this.view.setContent(content);

    this.currentFileName = file.name;
    this.currentLanguage = this.getLanguageFromFileName(file.name);
    this.dirty = false;
    this.updateStatusBar();
    this.view.focus();
  }

  async saveCurrentFile() {
    if (!this.currentFileHandle) return;

    const content = this.view.getContent();
    const writable = await this.currentFileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    this.dirty = false;
    this.updateStatusBar();
  }

  duplicateLine() {
    if (!this.view) return;

    const { start } = this.view.getSelection();
    const line = this.view.lineAt(start);
    const insert = `\n${line.text}`;
    this.view.replaceRange(line.to, line.to, insert);
    this.view.setCursor(line.to + insert.length);
    this.dirty = true;
    this.updateStatusBar();
  }

  deleteLine() {
    if (!this.view) return;

    const { start } = this.view.getSelection();
    const line = this.view.lineAt(start);

    let fromPos = line.from;
    let toPos = line.to;

    const content = this.view.getContent();
    if (toPos < content.length && content[toPos] === '\n') {
      toPos += 1;
    } else if (fromPos > 0 && content[fromPos - 1] === '\n') {
      fromPos -= 1;
    }

    this.view.replaceRange(fromPos, toPos, '');
    this.view.setCursor(fromPos);
    this.dirty = true;
    this.updateStatusBar();
  }

  moveLine(direction) {
    if (!this.view) return;

    const { start } = this.view.getSelection();
    const current = this.view.lineAt(start);
    const content = this.view.getContent();
    const lines = content.split('\n');
    const currentIdx = current.number - 1;
    const targetIdx = currentIdx + direction;

    if (targetIdx < 0 || targetIdx >= lines.length) return;

    [lines[currentIdx], lines[targetIdx]] = [lines[targetIdx], lines[currentIdx]];
    this.view.setContent(lines.join('\n'));

    const newPos = lines.slice(0, targetIdx).join('\n').length + (targetIdx > 0 ? 1 : 0);
    this.view.setCursor(newPos);
    this.dirty = true;
    this.updateStatusBar();
  }

  updateStatusBar() {
    const fileNameEl = document.getElementById('fileName');
    const cursorEl = document.getElementById('cursorPosition');
    const languageEl = document.getElementById('language');

    if (fileNameEl) {
      fileNameEl.textContent = this.dirty
        ? `${this.currentFileName} •`
        : this.currentFileName;
    }

    if (cursorEl && this.view) {
      const { start } = this.view.getSelection();
      const line = this.view.lineAt(start);
      const col = start - line.from + 1;
      cursorEl.textContent = `Ln ${line.number}, Col ${col}`;
    }

    if (languageEl) {
      languageEl.textContent = this.currentLanguage;
    }
  }

  renderFileTree(entries, container) {
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Click no botao de pasta para abrir um diretorio</p></div>';
      return;
    }

    entries.forEach((entry) => {
      const item = fileTree.createTreeItem(entry, this.currentFileHandle, this.openFile.bind(this));
      container.appendChild(item);
    });
  }

  collectFiles(entries, parentPath = '') {
    const files = [];

    entries.forEach((entry) => {
      const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        files.push({ name: entry.name, path: currentPath, handle: entry.handle });
      }
      if (entry.kind === 'directory' && Array.isArray(entry.children)) {
        files.push(...this.collectFiles(entry.children, currentPath));
      }
    });

    return files;
  }

  async quickOpenFile() {
    const files = this.collectFiles(fileTree.entries || []);
    if (!files.length) {
      alert('Abra uma pasta primeiro (Cmd/Ctrl+O).');
      return;
    }

    const query = prompt('Quick Open (Cmd/Ctrl+P): digite parte do nome do arquivo');
    if (!query) return;

    const normalizedQuery = query.trim().toLowerCase();
    const matches = files.filter((file) => file.path.toLowerCase().includes(normalizedQuery));

    if (!matches.length) {
      alert('Nenhum arquivo encontrado.');
      return;
    }

    if (matches.length === 1) {
      await this.openFile(matches[0].handle);
      return;
    }

    const topMatches = matches.slice(0, 20);
    const options = topMatches
      .map((file, index) => `${index + 1}. ${file.path}`)
      .join('\n');
    const choice = prompt(`Selecione o numero do arquivo:\n${options}`);
    const index = Number(choice) - 1;

    if (Number.isInteger(index) && index >= 0 && index < topMatches.length) {
      await this.openFile(topMatches[index].handle);
    }
  }

  initEventListeners() {
    this.initTopMenus();

    document.getElementById('themeToggle')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    document.getElementById('openFolderBtn')?.addEventListener('click', async () => {
      await fileTree.openFolder();
    });

    document.getElementById('newFileBtn')?.addEventListener('click', async () => {
      await fileTree.createNewFile();
    });

    document.getElementById('newFolderBtn')?.addEventListener('click', async () => {
      await fileTree.createNewFolder();
    });

    document.getElementById('refreshBtn')?.addEventListener('click', async () => {
      await fileTree.refresh();
    });

    shortcuts.init(this);
  }

  initTopMenus() {
    const menuButtons = document.querySelectorAll('.menu-item');
    const menuDefs = {
      file: [
        { label: 'Open Folder', run: async () => fileTree.openFolder() },
        { label: 'New File', run: async () => fileTree.createNewFile() },
        { label: 'New Folder', run: async () => fileTree.createNewFolder() },
        { label: 'Save', run: async () => this.saveCurrentFile() },
      ],
      edit: [
        { label: 'Duplicate Line', run: () => this.duplicateLine() },
        { label: 'Delete Line', run: () => this.deleteLine() },
      ],
      view: [
        { label: 'Toggle Sidebar', run: () => shortcuts.toggleSidebar() },
        { label: 'Toggle Theme', run: () => this.toggleTheme() },
      ],
    };

    menuButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menuName = btn.dataset.action;
        const items = menuDefs[menuName] || [];
        this.toggleTopMenu(btn, menuName, items);
        this.openMenuFallbackPrompt(menuName);
      });
    });

    document.addEventListener('click', () => {
      this.hideTopMenu();
    });
  }

  toggleTopMenu(anchorEl, menuName, items) {
    if (this.activeTopMenu && this.activeTopMenu.name === menuName) {
      this.hideTopMenu();
      return;
    }

    this.hideTopMenu();

    const menu = document.createElement('div');
    menu.className = 'top-menu-popup';

    items.forEach((itemDef) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'top-menu-item';
      item.textContent = itemDef.label;
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        await itemDef.run();
        this.hideTopMenu();
      });
      menu.appendChild(item);
    });

    const anchorRect = anchorEl.getBoundingClientRect();
    menu.style.left = `${anchorRect.left}px`;
    menu.style.top = `${anchorRect.bottom + 4}px`;
    document.body.appendChild(menu);

    this.activeTopMenu = { name: menuName, element: menu };
  }

  hideTopMenu() {
    if (!this.activeTopMenu) return;
    this.activeTopMenu.element.remove();
    this.activeTopMenu = null;
  }

  async openMenuFallbackPrompt(menuName) {
    const actions = {
      file: ['open', 'newfile', 'newfolder', 'save'],
      edit: ['duplicate', 'delete'],
      view: ['sidebar', 'theme'],
    };

    const chosen = prompt(
      `Menu ${menuName.toUpperCase()} - escolha: ${actions[menuName].join(', ')}`
    );

    if (!chosen) return;
    const value = chosen.trim().toLowerCase();

    if (menuName === 'file') {
      if (value === 'open') await fileTree.openFolder();
      if (value === 'newfile') await fileTree.createNewFile();
      if (value === 'newfolder') await fileTree.createNewFolder();
      if (value === 'save') await this.saveCurrentFile();
    }

    if (menuName === 'edit') {
      if (value === 'duplicate') this.duplicateLine();
      if (value === 'delete') this.deleteLine();
    }

    if (menuName === 'view') {
      if (value === 'sidebar') shortcuts.toggleSidebar();
      if (value === 'theme') this.toggleTheme();
    }
  }
}

const editor = new CodeEditor();
window.editor = editor;
