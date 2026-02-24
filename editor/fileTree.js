import { fileSystem } from './fileSystem.js';

class FileTree {
  constructor() {
    this.entries = [];
    this.renderCallback = null;
    this.selectedHandle = null;
    this.contextMenuTarget = null;
  }

  async init(renderCallback) {
    this.renderCallback = renderCallback;
    this.initContextMenu();
  }

  async openFolder() {
    const handle = await fileSystem.openDirectory();
    if (handle) {
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
    
    const entries = await fileSystem.readDirectoryRecursive(rootHandle, 0, 3);
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
    
    if (entry.kind === 'directory' && entry.children) {
      itemContent.addEventListener('click', () => {
        this.toggleFolder(item);
      });
      
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';
      
      entry.children.forEach((child) => {
        const childItem = this.createTreeItem(child, currentFileHandle, onFileClick);
        childrenContainer.appendChild(childItem);
      });
      
      item.appendChild(childrenContainer);
      item.classList.add('expanded');
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

  toggleFolder(folderElement) {
    const children = folderElement.querySelector('.tree-children');
    if (children) {
      const isExpanded = folderElement.classList.contains('expanded');
      if (isExpanded) {
        children.style.display = 'none';
        folderElement.classList.remove('expanded');
      } else {
        children.style.display = 'block';
        folderElement.classList.add('expanded');
      }
    }
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
}

export const fileTree = new FileTree();
