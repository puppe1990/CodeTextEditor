class FileSystem {
  constructor() {
    this.rootHandle = null;
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

  async readDirectoryRecursive(handle, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return [];
    
    const entries = [];
    const dirEntries = await this.readDirectory(handle);
    
    for (const entry of dirEntries) {
      const entryInfo = {
        name: entry.name,
        kind: entry.kind,
        handle: entry.handle,
        path: entry.handle.name,
      };
      
      if (entry.kind === 'directory' && depth < maxDepth) {
        try {
          entryInfo.children = await this.readDirectoryRecursive(entry.handle, depth + 1, maxDepth);
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

  async deleteEntry(handle) {
    try {
      const parent = await this.getParentHandle(handle);
      await parent.removeEntry(handle.name, { recursive: true });
      return true;
    } catch (err) {
      console.error('Error deleting entry:', err);
      return false;
    }
  }

  async renameEntry(handle, newName) {
    try {
      const parent = await this.getParentHandle(handle);
      
      if (handle.kind === 'directory') {
        await parent.getDirectoryHandle(newName, { create: true });
      } else {
        await parent.getFileHandle(newName, { create: true });
      }
      
      await parent.removeEntry(handle.name, { recursive: true });
      return true;
    } catch (err) {
      console.error('Error renaming entry:', err);
      return false;
    }
  }

  async getParentHandle(handle) {
    const entries = await this.rootHandle.values();
    for await (const entry of entries) {
      if (entry.kind === handle.kind && entry.name === handle.name) {
        return this.rootHandle;
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
}

export const fileSystem = new FileSystem();
