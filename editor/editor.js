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
    this.activeTopMenu = null;

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.initEditor();
    this.initEventListeners();
    await fileTree.init(this.renderFileTree.bind(this));
    await fileTree.restoreLastFolder();
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
        if (update.docChanged) {
          this.dirty = true;
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

    const currentDoc = this.view.state.doc.toString();
    const currentSelection = this.view.state.selection.main;
    const selectionAnchor = preserveSelection
      ? Math.min(currentSelection.anchor, currentDoc.length)
      : 0;

    const nextState = this.createState(currentDoc, this.currentLanguageExtension);
    this.view.setState(nextState);

    if (preserveSelection) {
      this.view.dispatch({
        selection: { anchor: selectionAnchor },
      });
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
    this.currentFileHandle = handle;
    const file = await handle.getFile();
    const content = await file.text();

    this.currentFileName = file.name;
    this.currentLanguage = this.getLanguageFromFileName(file.name);
    this.currentLanguageExtension = this.getLanguageExtension(file.name);

    const nextState = this.createState(content, this.currentLanguageExtension);
    this.view.setState(nextState);

    this.dirty = false;
    this.updateStatusBar();
    this.view.focus();
    this.saveRecentFile(path || file.name);
  }

  async saveCurrentFile() {
    if (!this.currentFileHandle) return;

    const content = this.view.state.doc.toString();
    const writable = await this.currentFileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    this.dirty = false;
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
    const files = await fileTree.getAllFiles();
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
      await this.openFile(matches[0].handle, matches[0].path);
      return;
    }

    const topMatches = matches.slice(0, 20);
    const options = topMatches
      .map((file, index) => `${index + 1}. ${file.path}`)
      .join('\n');
    const choice = prompt(`Selecione o numero do arquivo:\n${options}`);
    const index = Number(choice) - 1;

    if (Number.isInteger(index) && index >= 0 && index < topMatches.length) {
      await this.openFile(topMatches[index].handle, topMatches[index].path);
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
