import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  toggleComment,
} from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { commentKeymap } from '@codemirror/comment';
import { fileTree } from './fileTree.js';
import { fileSystem } from './fileSystem.js';
import { shortcuts } from './shortcuts.js';

const LANGUAGE_EXTENSIONS = {
  js: javascript({ jsx: true, typescript: false }),
  ts: javascript({ jsx: false, typescript: true }),
  jsx: javascript({ jsx: true, typescript: false }),
  tsx: javascript({ jsx: true, typescript: true }),
  html: html(),
  htm: html(),
  css: css(),
  scss: css(),
  less: css(),
  py: python(),
  python: python(),
  json: json(),
  md: markdown(),
  mdx: markdown(),
  sql: sql(),
};

const LIGHT_THEME = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#333333',
  },
  '.cm-content': {
    caretColor: '#000000',
  },
  '.cm-cursor': {
    borderLeftColor: '#000000',
  },
  '.cm-activeLine': {
    backgroundColor: '#f0f0f0',
  },
  '.cm-gutters': {
    backgroundColor: '#f8f8f8',
    color: '#6e6e6e',
    borderRight: '1px solid #d4d4d4',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#e8e8e8',
  },
}, { dark: false });

class CodeEditor {
  constructor() {
    this.view = null;
    this.currentFileHandle = null;
    this.currentFileName = 'No file open';
    this.currentLanguage = 'Plain Text';
    this.currentLanguageExtension = [];
    this.dirty = false;
    this.settings = {
      theme: 'dark',
      fontSize: 14,
      tabSize: 2,
    };
    this.openTabs = [];
    this.activeTabId = null;
    this.activeTopMenu = null;
    this.quickOpen = {
      open: false,
      entries: [],
      selectedIndex: 0,
      files: [],
      commands: [],
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.initEditor();
    this.initEventListeners();
    await fileTree.init(this.renderFileTree.bind(this));
    await fileTree.restoreLastFolder();
    await this.restoreSession();
    this.initQuickOpen();
    this.renderTabs();
    this.updateStatusBar();
  }

  async restoreSession() {
    const session = await fileSystem.loadSession();
    if (!session || !session.currentFilePath) return;
    
    const rootHandle = fileSystem.getRootHandle();
    if (!rootHandle) return;
    
    try {
      const fileHandle = await this.findFileByPath(rootHandle, session.currentFilePath);
      if (fileHandle) {
        await this.openFile(fileHandle, session.currentFilePath);
      }
    } catch (err) {
      console.warn('Cannot restore last session:', err);
    }
  }

  async findFileByPath(dirHandle, targetPath) {
    const parts = targetPath.split('/');
    let currentHandle = dirHandle;
    
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      
      if (isLast) {
        return await currentHandle.getFileHandle(name);
      } else {
        currentHandle = await currentHandle.getDirectoryHandle(name);
      }
    }
    return null;
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

  getLanguageExtension(fileName) {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    return LANGUAGE_EXTENSIONS[ext] || [];
  }

  getEditorExtensions(languageExtension) {
    const uiTheme = EditorView.theme({
      '&': {
        fontSize: `${this.settings.fontSize}px`,
      },
      '.cm-content': {
        fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
      },
    });

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorState.tabSize.of(this.settings.tabSize),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...commentKeymap,
        indentWithTab,
        {
          key: 'Mod-s',
          run: () => {
            this.saveCurrentFile();
            return true;
          },
        },
        {
          key: 'Mod-d',
          run: () => {
            this.duplicateLine();
            return true;
          },
        },
        {
          key: 'Mod-Shift-k',
          run: () => {
            this.deleteLine();
            return true;
          },
        },
        {
          key: 'Alt-ArrowUp',
          run: () => {
            this.moveLine(-1);
            return true;
          },
        },
        {
          key: 'Alt-ArrowDown',
          run: () => {
            this.moveLine(1);
            return true;
          },
        },
      ]),
      languageExtension,
      EditorView.updateListener.of((update) => {
        const activeTab = this.getActiveTab();
        if (activeTab) {
          activeTab.state = update.state;
        }
        if (update.docChanged) {
          if (activeTab) {
            activeTab.dirty = true;
          }
          this.dirty = true;
          this.renderTabs();
          this.updateStatusBar();
        }
        if (update.selectionSet) {
          this.updateStatusBar();
        }
      }),
      uiTheme,
    ];

    if (this.settings.theme === 'dark') {
      extensions.push(oneDark);
    } else {
      extensions.push(LIGHT_THEME);
    }

    return extensions;
  }

  createState(doc, languageExtension) {
    return EditorState.create({
      doc,
      extensions: this.getEditorExtensions(languageExtension),
    });
  }

  initEditor() {
    const editorElement = document.getElementById('editor');
    this.currentLanguageExtension = [];

    this.view = new EditorView({
      state: this.createState('', this.currentLanguageExtension),
      parent: editorElement,
    });

    this.updateThemeUI();
  }

  rebuildEditorState({ preserveSelection = true } = {}) {
    if (!this.view) return;

    const activeTab = this.getActiveTab();
    const currentSelection = this.view.state.selection.main;

    this.openTabs = this.openTabs.map((tab) => {
      const baseState = tab.id === this.activeTabId ? this.view.state : tab.state;
      const doc = baseState.doc.toString();
      const nextState = this.createState(doc, tab.languageExtension);
      if (tab.id === this.activeTabId && preserveSelection) {
        const anchor = Math.min(currentSelection.anchor, doc.length);
        return {
          ...tab,
          state: nextState.update({ selection: { anchor } }).state,
        };
      }
      return { ...tab, state: nextState };
    });

    if (activeTab) {
      const nextActive = this.getActiveTab();
      this.view.setState(nextActive.state);
    }

    this.updateStatusBar();
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
    this.rebuildEditorState();
  }

  async openFile(handle, path = handle?.name || '') {
    const file = await handle.getFile();
    const tabId = path || handle.name;
    const existing = this.openTabs.find((tab) => tab.id === tabId);

    if (existing) {
      this.setActiveTab(existing.id);
      this.view.focus();
      await fileSystem.saveSession(existing.path || existing.name);
      return;
    }

    const language = this.getLanguageFromFileName(file.name);
    const languageExtension = this.getLanguageExtension(file.name);
    const state = this.createState(await file.text(), languageExtension);

    const tab = {
      id: tabId,
      name: file.name,
      path: path || file.name,
      handle,
      language,
      languageExtension,
      state,
      dirty: false,
    };

    this.openTabs.push(tab);
    this.setActiveTab(tab.id);
    this.view.focus();
    this.saveRecentFile(tab.path);
    await fileSystem.saveSession(tab.path);
  }

  async saveCurrentFile() {
    const activeTab = this.getActiveTab();
    if (!activeTab) return;

    const content = this.view.state.doc.toString();
    const writable = await activeTab.handle.createWritable();
    await writable.write(content);
    await writable.close();
    activeTab.dirty = false;
    activeTab.state = this.view.state;
    this.dirty = false;
    this.renderTabs();
    this.updateStatusBar();
  }

  duplicateLine() {
    if (!this.view) return;

    const { from } = this.view.state.selection.main;
    const line = this.view.state.doc.lineAt(from);
    const insert = `\n${line.text}`;

    this.view.dispatch({
      changes: { from: line.to, to: line.to, insert },
      selection: { anchor: line.to + insert.length },
    });
  }

  deleteLine() {
    if (!this.view) return;

    const { from } = this.view.state.selection.main;
    const line = this.view.state.doc.lineAt(from);

    let fromPos = line.from;
    let toPos = line.to;

    const content = this.view.state.doc.toString();
    if (toPos < content.length && content[toPos] === '\n') {
      toPos += 1;
    } else if (fromPos > 0 && content[fromPos - 1] === '\n') {
      fromPos -= 1;
    }

    this.view.dispatch({
      changes: { from: fromPos, to: toPos, insert: '' },
      selection: { anchor: fromPos },
    });
  }

  moveLine(direction) {
    if (!this.view) return;

    const doc = this.view.state.doc.toString();
    const lines = doc.split('\n');
    const { from } = this.view.state.selection.main;
    const currentLine = this.view.state.doc.lineAt(from);
    const currentIdx = currentLine.number - 1;
    const targetIdx = currentIdx + direction;

    if (targetIdx < 0 || targetIdx >= lines.length) return;

    [lines[currentIdx], lines[targetIdx]] = [lines[targetIdx], lines[currentIdx]];
    const nextDoc = lines.join('\n');

    const anchor = lines.slice(0, targetIdx).join('\n').length + (targetIdx > 0 ? 1 : 0);

    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: nextDoc },
      selection: { anchor },
    });
  }

  toggleComment() {
    if (!this.view) return;
    toggleComment(this.view);
  }

  getActiveTab() {
    return this.openTabs.find((tab) => tab.id === this.activeTabId) || null;
  }

  setActiveTab(tabId) {
    const tab = this.openTabs.find((item) => item.id === tabId);
    if (!tab) return;

    this.activeTabId = tab.id;
    this.currentFileHandle = tab.handle;
    this.currentFileName = tab.name;
    this.currentLanguage = tab.language;
    this.currentLanguageExtension = tab.languageExtension;
    this.dirty = Boolean(tab.dirty);

    this.view.setState(tab.state);
    this.renderTabs();
    this.updateStatusBar();
  }

  closeTab(tabId) {
    const idx = this.openTabs.findIndex((tab) => tab.id === tabId);
    if (idx === -1) return;

    const wasActive = this.activeTabId === tabId;
    this.openTabs.splice(idx, 1);

    if (!this.openTabs.length) {
      this.activeTabId = null;
      this.currentFileHandle = null;
      this.currentFileName = 'No file open';
      this.currentLanguage = 'Plain Text';
      this.currentLanguageExtension = [];
      this.dirty = false;
      this.view.setState(this.createState('', []));
      fileSystem.clearSession();
      this.renderTabs();
      this.updateStatusBar();
      return;
    }

    if (wasActive) {
      const nextIdx = Math.max(0, idx - 1);
      this.setActiveTab(this.openTabs[nextIdx].id);
      fileSystem.saveSession(this.openTabs[nextIdx].path);
    } else {
      this.renderTabs();
    }
  }

  renderTabs() {
    const tabsEl = document.getElementById('tabs');
    if (!tabsEl) return;

    tabsEl.innerHTML = '';

    this.openTabs.forEach((tab) => {
      const item = document.createElement('div');
      item.className = `tab-item${tab.id === this.activeTabId ? ' active' : ''}`;
      item.dataset.tabId = tab.id;

      const name = document.createElement('span');
      name.className = 'tab-item-name';
      name.textContent = tab.name;

      const dirty = document.createElement('span');
      dirty.className = 'tab-item-dirty';
      dirty.textContent = tab.dirty ? '•' : '';

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tab-item-close';
      close.textContent = '×';
      close.title = `Close ${tab.name}`;
      close.dataset.tabClose = tab.id;

      item.appendChild(name);
      item.appendChild(dirty);
      item.appendChild(close);
      tabsEl.appendChild(item);
    });
  }

  updateStatusBar() {
    const fileNameEl = document.getElementById('fileName');
    const cursorEl = document.getElementById('cursorPosition');
    const languageEl = document.getElementById('language');

    const activeTab = this.getActiveTab();
    if (activeTab) {
      this.currentFileName = activeTab.name;
      this.currentLanguage = activeTab.language;
      this.dirty = Boolean(activeTab.dirty);
    }

    if (fileNameEl) {
      fileNameEl.textContent = this.dirty
        ? `${this.currentFileName} •`
        : this.currentFileName;
    }

    if (cursorEl && this.view) {
      const pos = this.view.state.selection.main.head;
      const line = this.view.state.doc.lineAt(pos);
      const col = pos - line.from + 1;
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

  async quickOpenFile() {
    await this.openQuickOpen();
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

    document.getElementById('tabs')?.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-tab-close]');
      if (closeBtn) {
        e.stopPropagation();
        this.closeTab(closeBtn.dataset.tabClose);
        return;
      }

      const tabEl = e.target.closest('.tab-item');
      if (tabEl?.dataset.tabId) {
        this.setActiveTab(tabEl.dataset.tabId);
      }
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
        { label: 'Toggle Comment', run: () => this.toggleComment() },
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

  initQuickOpen() {
    const overlay = document.getElementById('quickOpenOverlay');
    const input = document.getElementById('quickOpenInput');
    const list = document.getElementById('quickOpenList');

    if (!overlay || !input || !list) return;

    this.quickOpen.overlay = overlay;
    this.quickOpen.input = input;
    this.quickOpen.list = list;

    this.quickOpen.commands = [
      { label: 'Open folder', meta: 'Cmd/Ctrl+O', icon: '📂', run: async () => fileTree.openFolder() },
      { label: 'New file', meta: 'Cmd/Ctrl+N', icon: '📄', run: async () => fileTree.createNewFile() },
      { label: 'New folder', meta: 'UI', icon: '📁', run: async () => fileTree.createNewFolder() },
      { label: 'Save file', meta: 'Cmd/Ctrl+S', icon: '💾', run: async () => this.saveCurrentFile() },
      { label: 'Toggle sidebar', meta: 'Cmd/Ctrl+B', icon: '🧭', run: () => shortcuts.toggleSidebar() },
      { label: 'Toggle theme', meta: 'UI', icon: '🌓', run: () => this.toggleTheme() },
    ];

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeQuickOpen();
      }
    });

    input.addEventListener('input', () => {
      this.updateQuickOpenEntries(input.value);
      this.renderQuickOpenEntries();
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveQuickOpenSelection(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveQuickOpenSelection(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.confirmQuickOpenSelection();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeQuickOpen();
      }
    });
  }

  async openQuickOpen() {
    if (!this.quickOpen.overlay || !this.quickOpen.input || !this.quickOpen.list) return;

    this.quickOpen.files = await fileTree.getAllFiles();
    this.quickOpen.open = true;
    this.quickOpen.overlay.classList.remove('hidden');
    this.quickOpen.input.value = '';
    this.updateQuickOpenEntries('');
    this.renderQuickOpenEntries();
    this.quickOpen.input.focus();
  }

  closeQuickOpen() {
    if (!this.quickOpen.open) return;
    this.quickOpen.open = false;
    this.quickOpen.overlay.classList.add('hidden');
    this.quickOpen.entries = [];
    this.quickOpen.selectedIndex = 0;
    this.view?.focus();
  }

  updateQuickOpenEntries(query) {
    const q = query.trim().toLowerCase();

    const commandEntries = this.quickOpen.commands
      .filter((cmd) => !q || cmd.label.toLowerCase().includes(q))
      .map((cmd) => ({
        type: 'command',
        label: cmd.label,
        meta: cmd.meta,
        icon: cmd.icon,
        run: cmd.run,
      }));

    const fileEntries = this.quickOpen.files
      .filter((file) => !q || file.path.toLowerCase().includes(q))
      .slice(0, 80)
      .map((file) => ({
        type: 'file',
        label: file.path,
        meta: 'file',
        icon: '🟢',
        run: async () => this.openFile(file.handle, file.path),
      }));

    this.quickOpen.entries = [...commandEntries, ...fileEntries].slice(0, 100);
    this.quickOpen.selectedIndex = 0;
  }

  renderQuickOpenEntries() {
    const { list, entries, selectedIndex } = this.quickOpen;
    if (!list) return;

    list.innerHTML = '';

    if (!entries.length) {
      list.innerHTML = '<div class="quick-open-empty">No results.</div>';
      return;
    }

    entries.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `quick-open-item${index === selectedIndex ? ' active' : ''}`;
      const main = document.createElement('span');
      main.className = 'quick-open-item-main';

      const icon = document.createElement('span');
      icon.className = 'quick-open-icon';
      icon.textContent = entry.icon;

      const label = document.createElement('span');
      label.className = 'quick-open-label';
      label.textContent = entry.label;

      const meta = document.createElement('span');
      meta.className = 'quick-open-meta';
      meta.textContent = entry.meta;

      main.appendChild(icon);
      main.appendChild(label);
      button.appendChild(main);
      button.appendChild(meta);

      button.addEventListener('mousemove', () => {
        if (this.quickOpen.selectedIndex !== index) {
          this.quickOpen.selectedIndex = index;
          this.renderQuickOpenEntries();
        }
      });

      button.addEventListener('click', async () => {
        this.quickOpen.selectedIndex = index;
        await this.confirmQuickOpenSelection();
      });

      list.appendChild(button);
    });
  }

  moveQuickOpenSelection(direction) {
    const total = this.quickOpen.entries.length;
    if (!total) return;

    const next = (this.quickOpen.selectedIndex + direction + total) % total;
    this.quickOpen.selectedIndex = next;
    this.renderQuickOpenEntries();

    const el = this.quickOpen.list?.children[next];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  async confirmQuickOpenSelection() {
    const entry = this.quickOpen.entries[this.quickOpen.selectedIndex];
    if (!entry) return;
    await entry.run();
    this.closeQuickOpen();
  }

  saveRecentFile(filePath) {
    chrome.storage.local.get(['recentFiles'], (result) => {
      const list = Array.isArray(result.recentFiles) ? result.recentFiles : [];
      const next = [filePath, ...list.filter((item) => item !== filePath)].slice(0, 20);
      chrome.storage.local.set({ recentFiles: next });
    });
  }
}

const editor = new CodeEditor();
window.editor = editor;
