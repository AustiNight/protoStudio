import type {
  SiteManifest,
  SiteManifestPage,
  VirtualFile,
  VfsMetadata,
} from '../../types/vfs';

interface VirtualFileSystemInit {
  metadata: VfsMetadata;
  templateId?: string;
  version?: number;
  files?: VirtualFile[] | Map<string, VirtualFile>;
}

const SECTION_REGEX = /<!--\s*(\/)?\s*PP:SECTION:([A-Za-z0-9_-]+)\s*-->/g;
const BLOCK_REGEX =
  /\/\*\s*===\s*(\/)?PP:BLOCK:([A-Za-z0-9_-]+)\s*===\s*\*\//g;
const FUNC_REGEX = /\/\/\s*===\s*(\/)?PP:FUNC:([A-Za-z0-9_-]+)\s*===/g;

export class VirtualFileSystem {
  files: Map<string, VirtualFile>;
  version: number;
  templateId?: string;
  metadata: VfsMetadata;

  constructor(init: VirtualFileSystemInit) {
    this.metadata = cloneMetadata(init.metadata);
    this.templateId = init.templateId;
    this.version = init.version ?? 1;

    const initialFiles = init.files
      ? init.files instanceof Map
        ? Array.from(init.files.values())
        : init.files
      : [];

    this.files = new Map(
      initialFiles.map((file) => [file.path, cloneFile(file)]),
    );
  }

  async addFile(path: string, content: string): Promise<VirtualFile> {
    const file = await buildFile(path, content);
    this.files.set(path, file);
    return cloneFile(file);
  }

  getFile(path: string): VirtualFile | null {
    const file = this.files.get(path);
    return file ? cloneFile(file) : null;
  }

  async updateFile(path: string, content: string): Promise<VirtualFile> {
    const file = await buildFile(path, content);
    this.files.set(path, file);
    return cloneFile(file);
  }

  deleteFile(path: string): boolean {
    return this.files.delete(path);
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  listFiles(): string[] {
    return Array.from(this.files.keys()).sort((a, b) => a.localeCompare(b));
  }

  getVersion(): number {
    return this.version;
  }

  incrementVersion(): number {
    this.version += 1;
    return this.version;
  }

  clone(): VirtualFileSystem {
    return new VirtualFileSystem({
      metadata: cloneMetadata(this.metadata),
      templateId: this.templateId,
      version: this.version,
      files: Array.from(this.files.values()).map((file) => cloneFile(file)),
    });
  }

  toManifest(): SiteManifest {
    const pages: SiteManifestPage[] = [];
    const cssBlocks: string[] = [];
    const jsFunctions: string[] = [];
    const blockSet = new Set<string>();
    const funcSet = new Set<string>();

    const files = Array.from(this.files.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );

    for (const file of files) {
      const path = file.path.toLowerCase();
      if (path.endsWith('.html')) {
        pages.push({
          path: file.path,
          sections: extractSectionNames(file.content),
        });
        continue;
      }

      if (path.endsWith('.css')) {
        for (const block of extractBlockNames(file.content)) {
          if (!blockSet.has(block)) {
            blockSet.add(block);
            cssBlocks.push(block);
          }
        }
        continue;
      }

      if (path.endsWith('.js')) {
        for (const func of extractFunctionNames(file.content)) {
          if (!funcSet.has(func)) {
            funcSet.add(func);
            jsFunctions.push(func);
          }
        }
      }
    }

    return {
      pages,
      cssBlocks,
      jsFunctions,
      theme: {
        colors: { ...this.metadata.colors },
        fonts: { ...this.metadata.fonts },
      },
    };
  }
}

async function buildFile(path: string, content: string): Promise<VirtualFile> {
  const hash = await hashContent(content);
  return {
    path,
    content,
    hash,
    lastModified: Date.now(),
  };
}

function cloneFile(file: VirtualFile): VirtualFile {
  return {
    path: file.path,
    content: file.content,
    hash: file.hash,
    lastModified: file.lastModified,
  };
}

function cloneMetadata(metadata: VfsMetadata): VfsMetadata {
  return {
    title: metadata.title,
    description: metadata.description,
    colors: { ...metadata.colors },
    fonts: { ...metadata.fonts },
  };
}

async function hashContent(content: string): Promise<string> {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef || !cryptoRef.subtle) {
    return fallbackHash(content);
  }

  const data = new TextEncoder().encode(content);
  const digest = await cryptoRef.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function fallbackHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return `fallback-${hash.toString(16).padStart(8, '0')}`;
}

function extractSectionNames(html: string): string[] {
  const sections: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(SECTION_REGEX)) {
    if (match[1]) {
      continue;
    }
    const name = match[2];
    if (!seen.has(name)) {
      seen.add(name);
      sections.push(name);
    }
  }

  return sections;
}

function extractBlockNames(css: string): string[] {
  const blocks: string[] = [];
  const seen = new Set<string>();

  for (const match of css.matchAll(BLOCK_REGEX)) {
    if (match[1]) {
      continue;
    }
    const name = match[2];
    if (!seen.has(name)) {
      seen.add(name);
      blocks.push(name);
    }
  }

  return blocks;
}

function extractFunctionNames(js: string): string[] {
  const funcs: string[] = [];
  const seen = new Set<string>();

  for (const match of js.matchAll(FUNC_REGEX)) {
    if (match[1]) {
      continue;
    }
    const name = match[2];
    if (!seen.has(name)) {
      seen.add(name);
      funcs.push(name);
    }
  }

  return funcs;
}
