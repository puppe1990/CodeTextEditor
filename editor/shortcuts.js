import { fileTree } from './fileTree.js';

class Shortcuts {
  constructor() {
    this.editor = null;
  }

  init(editorInstance) {
    this.editor = editorInstance;
    this.registerShortcuts();
  }

  registerShortcuts() {
    document.addEventListener('keydown', (e) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;
      
      if (isCtrl && !isShift && !isAlt) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            this.save();
            break;
          case 'o':
            e.preventDefault();
            this.openFolder();
            break;
          case 'n':
            e.preventDefault();
            this.newFile();
            break;
          case 'p':
            e.preventDefault();
            this.quickOpen();
            break;
          case 'b':
            e.preventDefault();
            this.toggleSidebar();
            break;
          case '/':
            e.preventDefault();
            this.toggleComment();
            break;
          case 'd':
            e.preventDefault();
            this.duplicateLine();
            break;
        }
      }

      if (!isCtrl && !isShift && isAlt) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveLine(-1);
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveLine(1);
        }
      }
      
      if (isCtrl && isShift && !isAlt) {
        switch (e.key.toLowerCase()) {
          case 'p':
            e.preventDefault();
            this.commandPalette();
            break;
          case 'k':
            e.preventDefault();
            this.deleteLine();
            break;
        }
      }
    });
  }

  save() {
    if (this.editor && this.editor.saveCurrentFile) {
      this.editor.saveCurrentFile();
    }
  }

  async openFolder() {
    await fileTree.openFolder();
  }

  newFile() {
    if (fileTree && fileTree.createNewFile) {
      fileTree.createNewFile();
    }
  }

  quickOpen() {
    if (this.editor && this.editor.quickOpenFile) {
      this.editor.quickOpenFile();
    }
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
    }
  }

  commandPalette() {
    const command = prompt('Command (save, openFolder, newFile, toggleSidebar, toggleTheme):');
    if (command) {
      switch (command.toLowerCase()) {
        case 'save':
          this.save();
          break;
        case 'openfolder':
          this.openFolder();
          break;
        case 'newfile':
          this.newFile();
          break;
        case 'togglesidebar':
          this.toggleSidebar();
          break;
        case 'toggletheme':
          if (this.editor && this.editor.toggleTheme) {
            this.editor.toggleTheme();
          }
          break;
      }
    }
  }

  deleteLine() {
    if (this.editor && this.editor.deleteLine) {
      this.editor.deleteLine();
    }
  }

  duplicateLine() {
    if (this.editor && this.editor.duplicateLine) {
      this.editor.duplicateLine();
    }
  }

  moveLine(direction) {
    if (this.editor && this.editor.moveLine) {
      this.editor.moveLine(direction);
    }
  }

  toggleComment() {
    if (this.editor && this.editor.toggleComment) {
      this.editor.toggleComment();
    }
  }
}

export const shortcuts = new Shortcuts();
