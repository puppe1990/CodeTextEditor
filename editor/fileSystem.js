class FileSystem {
  constructor() {
    this.rootHandle = null;
    this.dbName = 'codesnip-editor-db';
    this.storeName = 'kv';
    this.lastFolderKey = 'lastFolderHandle';
  }

  async saveSession(currentFilePath) {
    const session = {
      folderName: this.rootHandle?.name || null,
      currentFilePath: currentFilePath || null,
      timestamp: Date.now(),
    };
    chrome.storage.local.set({ editorSession: session });
  }

  async loadSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['editorSession'], (result) => {
        resolve(result.editorSession || null);
      });
    });
  }

  async clearSession() {
    chrome.storage.local.remove(['editorSession']);
  }

  async openDirectory() {
    try {
      const handle = await window.showDirectoryPicker();
      this.rootHandle = handle;
      await this.saveLastOpenedFolder(handle);
      return handle;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error opening directory:', err);
      }
      return null;
    }
  }

  async readDirectory(handle) {
    const entries = [];
    for await (const entry of handle.values()) {
      entries.push({
        name: entry.name,
        kind: entry.kind,
        handle: entry,
      });
    }
    return entries.sort((a, b) => {
      if (a.kind === 'directory' && b.kind !== 'directory') return -1;
      if (a.kind !== 'directory' && b.kind === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readDirectoryLevel(handle, parentPath = '') {
    const entries = await this.readDirectory(handle);
    return entries.map((entry) => ({
      name: entry.name,
      kind: entry.kind,
      handle: entry.handle,
      parentHandle: handle,
      path: parentPath ? `${parentPath}/${entry.name}` : entry.name,
      children: null,
      childrenLoaded: false,
    }));
  }

  async readDirectoryRecursive(handle, depth = 0, maxDepth = 3, parentPath = '') {
    if (depth > maxDepth) return [];
    
    const entries = [];
    const dirEntries = await this.readDirectory(handle);
    
    for (const entry of dirEntries) {
      const entryInfo = {
        name: entry.name,
        kind: entry.kind,
        handle: entry.handle,
        parentHandle: handle,
        path: parentPath ? `${parentPath}/${entry.handle.name}` : entry.handle.name,
      };
      
      if (entry.kind === 'directory' && depth < maxDepth) {
        try {
          entryInfo.children = await this.readDirectoryRecursive(
            entry.handle,
            depth + 1,
            maxDepth,
            entryInfo.path
          );
        } catch (err) {
          console.warn(`Cannot read directory ${entry.name}:`, err);
          entryInfo.children = [];
        }
      }
      
      entries.push(entryInfo);
    }
    
    return entries;
  }

  async createFile(parentHandle, fileName) {
    try {
      const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write('');
      await writable.close();
      return fileHandle;
    } catch (err) {
      console.error('Error creating file:', err);
      return null;
    }
  }

  async createDirectory(parentHandle, dirName) {
    try {
      const dirHandle = await parentHandle.getDirectoryHandle(dirName, { create: true });
      return dirHandle;
    } catch (err) {
      console.error('Error creating directory:', err);
      return null;
    }
  }

  async deleteEntry(handle, parentHandle = null) {
    try {
      const parent = parentHandle || await this.getParentHandle(handle);
      if (!parent) return false;
      await parent.removeEntry(handle.name, { recursive: true });
      return true;
    } catch (err) {
      console.error('Error deleting entry:', err);
      return false;
    }
  }

  async renameEntry(handle, newName, parentHandle = null) {
    try {
      const parent = parentHandle || await this.getParentHandle(handle);
      if (!parent) return false;

      if (handle.kind === 'directory') {
        const targetDir = await parent.getDirectoryHandle(newName, { create: true });
        await this.copyDirectoryContents(handle, targetDir);
      } else {
        const sourceFile = await handle.getFile();
        const targetFile = await parent.getFileHandle(newName, { create: true });
        const writable = await targetFile.createWritable();
        await writable.write(await sourceFile.text());
        await writable.close();
      }

      await parent.removeEntry(handle.name, { recursive: true });
      return true;
    } catch (err) {
      console.error('Error renaming entry:', err);
      return false;
    }
  }

  async getParentHandle(targetHandle, currentHandle = this.rootHandle) {
    if (!currentHandle) return null;

    for await (const entry of currentHandle.values()) {
      let isMatch = entry.kind === targetHandle.kind && entry.name === targetHandle.name;
      if (typeof entry.isSameEntry === 'function') {
        try {
          isMatch = await entry.isSameEntry(targetHandle);
        } catch (err) {
          isMatch = entry.kind === targetHandle.kind && entry.name === targetHandle.name;
        }
      }

      if (isMatch) {
        return currentHandle;
      }

      if (entry.kind === 'directory') {
        const found = await this.getParentHandle(targetHandle, entry);
        if (found) return found;
      }
    }

    return null;
  }

  async getEntryPath(handle) {
    return handle.name;
  }

  async saveLastOpenedFolder(handle) {
    const serialized = await this.serializeHandle(handle);
    if (serialized) {
      chrome.storage.local.set({ lastOpenedFolder: serialized });
    }
    await this.persistHandle(this.lastFolderKey, handle);
  }

  async serializeHandle(handle) {
    try {
      return {
        name: handle.name,
        kind: handle.kind,
      };
    } catch (err) {
      return null;
    }
  }

  getRootHandle() {
    return this.rootHandle;
  }

  setRootHandle(handle) {
    this.rootHandle = handle;
  }

  async loadLastOpenedFolder() {
    const handle = await this.getPersistedHandle(this.lastFolderKey);
    if (!handle) return null;

    try {
      let permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (permission === 'granted') {
        this.rootHandle = handle;
        return handle;
      }
    } catch (err) {
      console.warn('Cannot restore last folder handle:', err);
    }

    return null;
  }

  async copyDirectoryContents(sourceDirHandle, targetDirHandle) {
    for await (const entry of sourceDirHandle.values()) {
      if (entry.kind === 'file') {
        const sourceFile = await entry.getFile();
        const targetFile = await targetDirHandle.getFileHandle(entry.name, { create: true });
        const writable = await targetFile.createWritable();
        await writable.write(await sourceFile.text());
        await writable.close();
      } else if (entry.kind === 'directory') {
        const nestedTarget = await targetDirHandle.getDirectoryHandle(entry.name, { create: true });
        await this.copyDirectoryContents(entry, nestedTarget);
      }
    }
  }

  async openDatabase() {
    if (!globalThis.indexedDB) return null;
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async persistHandle(key, handle) {
    const db = await this.openDatabase();
    if (!db) return;

    await new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  }

  async getPersistedHandle(key) {
    const db = await this.openDatabase();
    if (!db) return null;

    const value = await new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return value;
  }
}

export const fileSystem = new FileSystem();
