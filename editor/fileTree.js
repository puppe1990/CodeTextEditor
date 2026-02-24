import { fileSystem } from './fileSystem.js';

class FileTree {
  constructor() {
    this.entries = [];
    this.renderCallback = null;
    this.selectedHandle = null;
    this.contextMenuTarget = null;
    this.gitignorePatterns = [];
  }

  async loadGitignore(rootHandle) {
    this.gitignorePatterns = [];
    try {
      const gitignoreHandle = await rootHandle.getFileHandle('.gitignore');
      const file = await gitignoreHandle.getFile();
      const content = await file.text();
      this.gitignorePatterns = this.parseGitignore(content);
    } catch (err) {
      // .gitignore não existe ou não pode ser lido
    }
  }

  parseGitignore(content) {
    const patterns = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const negated = trimmed.startsWith('!');
      const rawPattern = negated ? trimmed.slice(1).trim() : trimmed;
      if (!rawPattern) continue;
      patterns.push({ pattern: rawPattern, negated });
    }
    return patterns;
  }

  matchesGitignore(filePath, isDirectory = false) {
    const normalizedPath = filePath.replace(/^\.?\//, '').replace(/\/+$/, '');
    const fileName = normalizedPath.split('/').pop();
    let ignored = false;

    for (const rule of this.gitignorePatterns) {
      if (this.ruleMatchesPath(rule.pattern, normalizedPath, fileName, isDirectory)) {
        ignored = !rule.negated;
      }
    }

    return ignored;
  }

  ruleMatchesPath(pattern, normalizedPath, fileName, isDirectory) {
    const directoryOnly = pattern.endsWith('/');
    const cleanPattern = directoryOnly ? pattern.slice(0, -1) : pattern;
    const anchored = cleanPattern.startsWith('/');
    const relativePattern = anchored ? cleanPattern.slice(1) : cleanPattern;

    if (directoryOnly && !isDirectory) {
      return false;
    }

    const wildcardRegex = this.buildWildcardRegex(relativePattern);
    const basenameRegex = this.buildWildcardRegex(fileName ? relativePattern : '');

    if (anchored) {
      return wildcardRegex.test(normalizedPath);
    }

    if (!relativePattern.includes('/')) {
      return basenameRegex.test(fileName);
    }

    return wildcardRegex.test(normalizedPath) || wildcardRegex.test(`/${normalizedPath}`);
  }

  buildWildcardRegex(pattern) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  async init(renderCallback) {
    this.renderCallback = renderCallback;
    this.initContextMenu();
  }

  async openFolder() {
    const handle = await fileSystem.openDirectory();
    if (handle) {
      await this.loadGitignore(handle);
      await this.refresh();
      await fileSystem.clearSession();
    }
    return handle;
  }

  async restoreLastFolder() {
    const handle = await fileSystem.loadLastOpenedFolder();
    if (handle) {
      await this.loadGitignore(handle);
      await this.refresh();
    }
    return handle;
  }

  async refresh() {
    const rootHandle = fileSystem.getRootHandle();
    if (!rootHandle) {
      this.renderCallback([], document.getElementById('fileTree'));
      return;
    }

    const entries = await fileSystem.readDirectoryLevel(rootHandle, '');
    this.entries = entries;
    this.renderCallback(entries, document.getElementById('fileTree'));
  }

  createTreeItem(entry, currentFileHandle, onFileClick) {
    const item = document.createElement('div');
    item.className = entry.kind === 'directory' ? 'tree-folder' : 'tree-file';
    item.dataset.handleId = entry.handle.name;
    
    const itemContent = document.createElement('div');
    itemContent.className = 'tree-item';
    
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = entry.kind === 'directory' ? '📁' : this.getFileIcon(entry.name);
    
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    
    itemContent.appendChild(icon);
    itemContent.appendChild(name);
    item.appendChild(itemContent);
    
    if (entry.kind === 'file') {
      itemContent.addEventListener('click', async () => {
        if (currentFileHandle?.name === entry.handle.name) {
          return;
        }
        this.selectItem(itemContent);
        if (onFileClick) {
          await onFileClick(entry.handle, entry.path);
        }
      });
      
      itemContent.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, entry);
      });
    }
    
    if (entry.kind === 'directory') {
      itemContent.addEventListener('click', async () => {
        await this.toggleFolder(item, entry, currentFileHandle, onFileClick);
      });

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';
      item.appendChild(childrenContainer);
    }
    
    return item;
  }

  getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
      js: '📜',
      jsx: '⚛️',
      ts: '📘',
      tsx: '⚛️',
      html: '🌐',
      htm: '🌐',
      css: '🎨',
      scss: '🎨',
      less: '🎨',
      py: '🐍',
      json: '📋',
      md: '📝',
      mdx: '📝',
      sql: '🗃️',
      txt: '📄',
      gitignore: '',
      env: '🔐',
    };
    return icons[ext] || '📄';
  }

  async toggleFolder(folderElement, entry, currentFileHandle, onFileClick) {
    const children = folderElement.querySelector('.tree-children');
    if (!children) return;

    const isExpanded = folderElement.classList.contains('expanded');
    if (isExpanded) {
      children.style.display = 'none';
      folderElement.classList.remove('expanded');
      return;
    }

    if (!entry.childrenLoaded) {
      children.innerHTML = '';
      const childEntries = await fileSystem.readDirectoryLevel(entry.handle, entry.path);
      entry.children = childEntries;
      entry.childrenLoaded = true;

      childEntries.forEach((child) => {
        const childItem = this.createTreeItem(child, currentFileHandle, onFileClick);
        children.appendChild(childItem);
      });
    }

    children.style.display = 'block';
    folderElement.classList.add('expanded');
  }

  selectItem(itemElement) {
    document.querySelectorAll('.tree-item.selected').forEach((el) => {
      el.classList.remove('selected');
    });
    itemElement.classList.add('selected');
  }

  initContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    
    document.addEventListener('click', () => {
      contextMenu.classList.add('hidden');
    });
    
    contextMenu.querySelectorAll('li').forEach((item) => {
      item.addEventListener('click', async () => {
        const action = item.dataset.action;
        await this.handleContextMenuAction(action);
        contextMenu.classList.add('hidden');
      });
    });
  }

  showContextMenu(event, entry) {
    const contextMenu = document.getElementById('contextMenu');
    this.contextMenuTarget = entry;
    
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.classList.remove('hidden');
  }

  async handleContextMenuAction(action) {
    if (!this.contextMenuTarget) return;
    
    switch (action) {
      case 'rename':
        await this.renameEntry(this.contextMenuTarget);
        break;
      case 'delete':
        await this.deleteEntry(this.contextMenuTarget);
        break;
    }
  }

  async renameEntry(entry) {
    const newName = prompt('Enter new name:', entry.name);
    if (newName && newName !== entry.name) {
      await fileSystem.renameEntry(entry.handle, newName, entry.parentHandle);
      await this.refresh();
    }
  }

  async deleteEntry(entry) {
    const confirmed = confirm(`Are you sure you want to delete "${entry.name}"?`);
    if (confirmed) {
      await fileSystem.deleteEntry(entry.handle, entry.parentHandle);
      await this.refresh();
    }
  }

  async createNewFile() {
    const rootHandle = fileSystem.getRootHandle();
    if (!rootHandle) {
      await this.openFolder();
      return;
    }
    
    const fileName = prompt('Enter file name:');
    if (fileName) {
      await fileSystem.createFile(rootHandle, fileName);
      await this.refresh();
    }
  }

  async createNewFolder() {
    const rootHandle = fileSystem.getRootHandle();
    if (!rootHandle) {
      await this.openFolder();
      return;
    }
    
    const dirName = prompt('Enter folder name:');
    if (dirName) {
      await fileSystem.createDirectory(rootHandle, dirName);
      await this.refresh();
    }
  }

  async getAllFiles() {
    const rootHandle = fileSystem.getRootHandle();
    if (!rootHandle) return [];
    if (this.gitignorePatterns.length === 0) {
      await this.loadGitignore(rootHandle);
    }
    return this.collectAllFiles(rootHandle, '');
  }

  async collectAllFiles(directoryHandle, parentPath) {
    const files = [];
    const entries = await fileSystem.readDirectoryLevel(directoryHandle, parentPath);

    for (const entry of entries) {
      if (entry.kind === 'file') {
        if (!this.matchesGitignore(entry.path, false)) {
          files.push({ name: entry.name, path: entry.path, handle: entry.handle });
        }
      } else if (entry.kind === 'directory') {
        if (!this.matchesGitignore(entry.path, true)) {
          const nestedFiles = await this.collectAllFiles(entry.handle, entry.path);
          files.push(...nestedFiles);
        }
      }
    }

    return files;
  }
}

export const fileTree = new FileTree();
