import type {
  BuildPatch,
  CssAppend,
  CssReplaceBlock,
  FileCreate,
  FileDelete,
  JsAppend,
  JsReplaceFunction,
  MetadataUpdate,
  PatchOperation,
  PatchResult,
  SectionDelete,
  SectionInsert,
  SectionReplace,
} from '../../types/patch';
import type { VfsMetadata } from '../../types/vfs';
import { VirtualFileSystem } from '../vfs/vfs';

const CSS_INSERT_REGEX = /\/\*\s*PP:CSS_INSERT_POINT\s*\*\//;
const JS_INSERT_REGEX = /\/\/\s*PP:JS_INSERT_POINT/;
type OperationLike = PatchOperation | Record<string, unknown>;

export class PatchEngine {
  async apply(vfs: VirtualFileSystem, patch: BuildPatch): Promise<PatchResult> {
    if (!isValidPatch(patch)) {
      return failure('Invalid patch schema.');
    }

    const currentVersion = vfs.getVersion();
    if (patch.targetVersion !== currentVersion) {
      return failure(
        `Patch target version ${patch.targetVersion} does not match VFS version ${currentVersion}.`,
      );
    }

    const clone = vfs.clone();

    for (const op of patch.operations) {
      const normalizedOp = normalizeOperation(op, clone, currentVersion);
      const result = await applyOperation(clone, normalizedOp, currentVersion);
      if (!result.success) {
        return result;
      }
    }

    clone.incrementVersion();
    commitClone(vfs, clone);

    return { success: true, version: vfs.getVersion() };
  }
}

function normalizeOperation(
  op: OperationLike,
  vfs: VirtualFileSystem,
  expectedVersion: number,
): PatchOperation {
  const record = { ...(op as Record<string, unknown>) };
  const normalizedOp = normalizeOperationName(pickString(record, ['op']) ?? '');
  if (normalizedOp) {
    record.op = normalizedOp;
  }
  const opName = typeof record.op === 'string' ? record.op : '';

  const fileFromAlias = pickString(
    record,
    ['file', 'path', 'filePath', 'targetFile', 'targetPath', 'filename'],
  );
  const inferredFile = inferDefaultFile(opName, vfs);
  const normalizedFile = resolveOperationFilePath(opName, fileFromAlias, inferredFile, vfs);
  if (normalizedFile) {
    record.file = normalizedFile;
  }

  switch (opName) {
    case 'section.replace':
    case 'section.insert':
    case 'section.delete': {
      let sectionId = pickString(record, [
        'sectionId',
        'section',
        'targetSection',
        'sectionName',
        'id',
      ]);
      if (!sectionId && normalizedFile) {
        sectionId = inferFirstSectionId(vfs, normalizedFile);
      }
      if (sectionId) {
        record.sectionId = sectionId;
      }
      if (opName !== 'section.delete') {
        let html = pickString(record, [
          'html',
          'content',
          'markup',
          'innerHtml',
          'sectionHtml',
        ]);
        if (!html && normalizedFile && sectionId && opName === 'section.replace') {
          html = extractSectionBody(vfs, normalizedFile, sectionId);
        }
        if (!html && sectionId) {
          html = fallbackSectionMarkup(sectionId);
        }
        if (!html && sectionId && opName === 'section.insert') {
          html = [
            `<!-- PP:SECTION:${sectionId} -->`,
            `<section data-pp-section="${sectionId}"><h2>${sectionId}</h2></section>`,
            `<!-- /PP:SECTION:${sectionId} -->`,
          ].join('\n');
        }
        if (html) {
          if (sectionId && opName === 'section.insert') {
            record.html = ensureSectionAnchors(html, sectionId);
          } else if (sectionId && opName === 'section.replace') {
            record.html = stripSectionAnchors(html, sectionId);
          } else {
            record.html = html;
          }
        }
      }
      if (opName === 'section.insert') {
        const before = pickString(record, [
          'before',
          'insertBefore',
          'targetMarker',
          'marker',
        ]);
        const inferredBefore = normalizedFile
          ? inferFirstInsertMarkerId(vfs, normalizedFile)
          : null;
        record.before = before ?? inferredBefore ?? sectionId ?? 'footer';
      }
      break;
    }
    case 'css.append':
    case 'css.replace': {
      const blockId = pickString(record, ['blockId', 'block', 'targetBlock', 'id']);
      if (blockId) {
        record.blockId = blockId;
      }
      const css = pickString(record, ['css', 'content', 'code', 'styles']);
      if (css) {
        if (blockId && opName === 'css.append' && !hasBlockAnchors(css, blockId)) {
          record.css = ensureBlockAnchors(css, blockId);
        } else {
          record.css = css;
        }
      }
      break;
    }
    case 'js.append':
    case 'js.replace': {
      const funcId = pickString(record, ['funcId', 'functionId', 'function', 'targetFunction', 'id']);
      if (funcId) {
        record.funcId = funcId;
      }
      const js = pickString(record, ['js', 'content', 'code', 'script']);
      if (js) {
        if (funcId && opName === 'js.append' && !hasFuncAnchors(js, funcId)) {
          record.js = ensureFuncAnchors(js, funcId);
        } else {
          record.js = js;
        }
      }
      break;
    }
    case 'file.create': {
      const content = pickString(record, ['content', 'text', 'body']);
      if (content) {
        record.content = content;
      }
      break;
    }
    case 'meta.update': {
      const fields = record.fields;
      if (!fields || typeof fields !== 'object') {
        const alias = record.metadata ?? record.meta;
        if (alias && typeof alias === 'object') {
          record.fields = alias;
        }
      }
      break;
    }
    default:
      break;
  }

  if (requiresIfVersion(opName)) {
    const ifVersion = record.ifVersion;
    if (
      typeof ifVersion !== 'number' ||
      Number.isNaN(ifVersion) ||
      ifVersion !== expectedVersion
    ) {
      record.ifVersion = expectedVersion;
    }
  }

  if (opName === 'file.create') {
    if (typeof record.ifAbsent !== 'boolean') {
      record.ifAbsent = true;
    }
  }

  return record as unknown as PatchOperation;
}

function resolveOperationFilePath(
  opName: string,
  requestedFile: string | null,
  inferredFile: string | null,
  vfs: VirtualFileSystem,
): string | null {
  if (requestedFile && vfs.hasFile(requestedFile)) {
    return requestedFile;
  }
  // Builder occasionally references template-relative paths that do not exist in current VFS.
  // Prefer canonical in-project files for append/replace ops when the requested path is missing.
  switch (opName) {
    case 'css.append':
    case 'css.replace':
    case 'js.append':
    case 'js.replace':
    case 'section.replace':
    case 'section.insert':
    case 'section.delete':
    case 'meta.update':
      return inferredFile ?? requestedFile;
    default:
      return requestedFile ?? inferredFile;
  }
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeOperationName(value: string): string {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'asset.create':
    case 'asset.add':
    case 'file.add':
      return 'file.create';
    case 'asset.delete':
    case 'asset.remove':
    case 'file.remove':
      return 'file.delete';
    case 'section.add':
      return 'section.insert';
    case 'section.update':
      return 'section.replace';
    case 'section.remove':
      return 'section.delete';
    case 'css.add':
      return 'css.append';
    case 'css.update':
      return 'css.replace';
    case 'js.add':
      return 'js.append';
    case 'js.update':
      return 'js.replace';
    case 'metadata.update':
    case 'meta.patch':
    case 'metadata.patch':
      return 'meta.update';
    default:
      return normalized;
  }
}

function requiresIfVersion(op: string): boolean {
  switch (op) {
    case 'section.replace':
    case 'section.insert':
    case 'section.delete':
    case 'css.append':
    case 'css.replace':
    case 'js.append':
    case 'js.replace':
    case 'file.delete':
      return true;
    default:
      return false;
  }
}

function inferDefaultFile(
  op: string,
  vfs: VirtualFileSystem,
): string | null {
  const candidates = (() => {
    switch (op) {
      case 'section.replace':
      case 'section.insert':
      case 'section.delete':
      case 'meta.update':
        return ['index.html', 'index.htm', 'pages/index.html'];
      case 'css.append':
      case 'css.replace':
        return ['styles.css', 'style.css', 'assets/styles.css'];
      case 'js.append':
      case 'js.replace':
        return ['main.js', 'script.js', 'assets/main.js'];
      default:
        return [] as string[];
    }
  })();

  for (const candidate of candidates) {
    if (vfs.hasFile(candidate)) {
      return candidate;
    }
  }
  const extensions = (() => {
    switch (op) {
      case 'section.replace':
      case 'section.insert':
      case 'section.delete':
      case 'meta.update':
        return ['.html'];
      case 'css.append':
      case 'css.replace':
        return ['.css'];
      case 'js.append':
      case 'js.replace':
        return ['.js', '.mjs'];
      default:
        return [] as string[];
    }
  })();
  if (extensions.length > 0) {
    const file = vfs
      .listFiles()
      .sort()
      .find((path) =>
        extensions.some((extension) => path.toLowerCase().endsWith(extension)),
      );
    if (file) {
      return file;
    }
  }
  return null;
}

function inferFirstSectionId(vfs: VirtualFileSystem, file: string): string | null {
  const content = vfs.getFile(file)?.content;
  if (!content) {
    return null;
  }
  const anchor = content.match(/<!--\s*PP:SECTION:([a-zA-Z0-9_-]+)\s*-->/);
  if (anchor?.[1]) {
    return anchor[1];
  }
  const dataAttr = content.match(/data-pp-section=["']([a-zA-Z0-9_-]+)["']/i);
  if (dataAttr?.[1]) {
    return dataAttr[1];
  }
  const sectionId = content.match(/<section[^>]*\sid=["']([a-zA-Z0-9_-]+)["']/i);
  if (sectionId?.[1]) {
    return sectionId[1];
  }
  return null;
}

function extractSectionBody(
  vfs: VirtualFileSystem,
  file: string,
  sectionId: string,
): string | null {
  const content = vfs.getFile(file)?.content;
  if (!content) {
    return null;
  }
  const escaped = sectionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<!--\\s*PP:SECTION:${escaped}\\s*-->([\\s\\S]*?)<!--\\s*\\/PP:SECTION:${escaped}\\s*-->`,
    'm',
  );
  const match = content.match(regex);
  const body = match?.[1]?.trim();
  return body && body.length > 0 ? body : null;
}

function inferFirstInsertMarkerId(vfs: VirtualFileSystem, file: string): string | null {
  const content = vfs.getFile(file)?.content;
  if (!content) {
    return null;
  }
  const match = content.match(/<!--\s*PP:INSERT_BEFORE:([a-zA-Z0-9_-]+)\s*-->/);
  return match?.[1] ?? null;
}

function ensureSectionAnchors(html: string, sectionId: string): string {
  if (hasSectionAnchors(html, sectionId)) {
    return html;
  }
  return [
    `<!-- PP:SECTION:${sectionId} -->`,
    html.trim(),
    `<!-- /PP:SECTION:${sectionId} -->`,
  ].join('\n');
}

function stripSectionAnchors(html: string, sectionId: string): string {
  const escaped = escapeRegExp(sectionId);
  const regex = new RegExp(
    `<!--\\s*PP:SECTION:${escaped}\\s*-->([\\s\\S]*?)<!--\\s*\\/PP:SECTION:${escaped}\\s*-->`,
    'm',
  );
  const match = html.match(regex);
  if (match?.[1]) {
    return match[1].trim();
  }
  return html.trim();
}

function ensureBlockAnchors(css: string, blockId: string): string {
  if (hasBlockAnchors(css, blockId)) {
    return css;
  }
  return [
    `/* === PP:BLOCK:${blockId} === */`,
    css.trim(),
    `/* === /PP:BLOCK:${blockId} === */`,
  ].join('\n');
}

function ensureFuncAnchors(js: string, funcId: string): string {
  if (hasFuncAnchors(js, funcId)) {
    return js;
  }
  return [
    `// === PP:FUNC:${funcId} ===`,
    js.trim(),
    `// === /PP:FUNC:${funcId} ===`,
  ].join('\n');
}

function fallbackSectionMarkup(sectionId: string): string {
  return `<section data-pp-section="${sectionId}"><h2>${sectionId}</h2></section>`;
}

function isValidPatch(patch: BuildPatch): boolean {
  if (!patch || typeof patch !== 'object') {
    return false;
  }
  if (typeof patch.workItemId !== 'string') {
    return false;
  }
  if (typeof patch.targetVersion !== 'number') {
    return false;
  }
  if (!Array.isArray(patch.operations)) {
    return false;
  }
  return true;
}

function commitClone(target: VirtualFileSystem, clone: VirtualFileSystem): void {
  target.files = clone.files;
  target.version = clone.version;
  target.templateId = clone.templateId;
  target.metadata = clone.metadata;
}

async function applyOperation(
  vfs: VirtualFileSystem,
  op: PatchOperation,
  expectedVersion: number,
): Promise<PatchResult> {
  switch (op.op) {
    case 'section.replace':
      return applySectionReplace(vfs, op, expectedVersion);
    case 'section.insert':
      return applySectionInsert(vfs, op, expectedVersion);
    case 'section.delete':
      return applySectionDelete(vfs, op, expectedVersion);
    case 'css.append':
      return applyCssAppend(vfs, op, expectedVersion);
    case 'css.replace':
      return applyCssReplace(vfs, op, expectedVersion);
    case 'js.append':
      return applyJsAppend(vfs, op, expectedVersion);
    case 'js.replace':
      return applyJsReplace(vfs, op, expectedVersion);
    case 'file.create':
      return applyFileCreate(vfs, op);
    case 'file.delete':
      return applyFileDelete(vfs, op, expectedVersion);
    case 'meta.update':
      return applyMetadataUpdate(vfs, op);
    default: {
      const unknownOp = op as PatchOperation;
      return failure(`Unknown patch operation "${String(unknownOp.op)}".`, unknownOp);
    }
  }
}

function applySectionReplace(
  vfs: VirtualFileSystem,
  op: SectionReplace,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.sectionId, 'sectionId', op) ||
    validateStringField(op.html, 'html', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  const file = vfs.getFile(op.file);
  if (!file) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  const sectionRegex = buildSectionRegex(op.sectionId);
  const match = file.content.match(sectionRegex);
  if (!match) {
    return Promise.resolve(
      failure(`Section ${op.sectionId} not found in ${op.file}.`, op),
    );
  }

  const replacement = `${match[1]}\n${op.html}\n${match[3]}`;
  const updated = file.content.replace(sectionRegex, replacement);

  return vfs.updateFile(op.file, updated).then(() => ({ success: true }));
}

function applySectionInsert(
  vfs: VirtualFileSystem,
  op: SectionInsert,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.sectionId, 'sectionId', op) ||
    validateStringField(op.before, 'before', op) ||
    validateStringField(op.html, 'html', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  if (!hasSectionAnchors(op.html, op.sectionId)) {
    return Promise.resolve(
      failure(`Inserted section ${op.sectionId} is missing anchors.`, op),
    );
  }

  const file = vfs.getFile(op.file);
  if (!file) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  const markerRegex = buildInsertRegex(op.before);
  if (!markerRegex.test(file.content)) {
    return Promise.resolve(
      failure(`Insert marker ${op.before} not found in ${op.file}.`, op),
    );
  }

  const updated = file.content.replace(markerRegex, (marker) => {
    return `${op.html}\n${marker}`;
  });

  return vfs.updateFile(op.file, updated).then(() => ({ success: true }));
}

function applySectionDelete(
  vfs: VirtualFileSystem,
  op: SectionDelete,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.sectionId, 'sectionId', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  const file = vfs.getFile(op.file);
  if (!file) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  const sectionRegex = buildSectionRegex(op.sectionId);
  if (!sectionRegex.test(file.content)) {
    return Promise.resolve(
      failure(`Section ${op.sectionId} not found in ${op.file}.`, op),
    );
  }

  const updated = file.content.replace(sectionRegex, '');
  return vfs.updateFile(op.file, updated).then(() => ({ success: true }));
}

function applyCssAppend(
  vfs: VirtualFileSystem,
  op: CssAppend,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.blockId, 'blockId', op) ||
    validateStringField(op.css, 'css', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  if (!hasBlockAnchors(op.css, op.blockId)) {
    return Promise.resolve(
      failure(`CSS block ${op.blockId} is missing anchors.`, op),
    );
  }

  const file = vfs.getFile(op.file);
  if (!file) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  if (!CSS_INSERT_REGEX.test(file.content)) {
    return Promise.resolve(
      failure(`CSS insert point not found in ${op.file}.`, op),
    );
  }

  const updated = file.content.replace(CSS_INSERT_REGEX, (marker) => {
    return `${op.css}\n${marker}`;
  });

  return vfs.updateFile(op.file, updated).then(() => ({ success: true }));
}

function applyCssReplace(
  vfs: VirtualFileSystem,
  op: CssReplaceBlock,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.blockId, 'blockId', op) ||
    validateStringField(op.css, 'css', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  const file = vfs.getFile(op.file);
  if (!file) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  const blockRegex = buildBlockRegex(op.blockId);
  const match = file.content.match(blockRegex);
  if (!match) {
    return Promise.resolve(
      failure(`CSS block ${op.blockId} not found in ${op.file}.`, op),
    );
  }

  const body = extractBlockBody(op.css, op.blockId);
  const replacement = `${match[1]}\n${body}\n${match[3]}`;
  const updated = file.content.replace(blockRegex, replacement);

  return vfs.updateFile(op.file, updated).then(() => ({ success: true }));
}

function applyJsAppend(
  vfs: VirtualFileSystem,
  op: JsAppend,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.funcId, 'funcId', op) ||
    validateStringField(op.js, 'js', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  if (!hasFuncAnchors(op.js, op.funcId)) {
    return Promise.resolve(
      failure(`JS function ${op.funcId} is missing anchors.`, op),
    );
  }

  const file = vfs.getFile(op.file);
  if (!file) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  if (!JS_INSERT_REGEX.test(file.content)) {
    return Promise.resolve(
      failure(`JS insert point not found in ${op.file}.`, op),
    );
  }

  const updated = file.content.replace(JS_INSERT_REGEX, (marker) => {
    return `${op.js}\n${marker}`;
  });

  return vfs.updateFile(op.file, updated).then(() => ({ success: true }));
}

function applyJsReplace(
  vfs: VirtualFileSystem,
  op: JsReplaceFunction,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.funcId, 'funcId', op) ||
    validateStringField(op.js, 'js', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  const file = vfs.getFile(op.file);
  if (!file) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  const funcRegex = buildFuncRegex(op.funcId);
  const match = file.content.match(funcRegex);
  if (!match) {
    return Promise.resolve(
      failure(`JS function ${op.funcId} not found in ${op.file}.`, op),
    );
  }

  const body = extractFuncBody(op.js, op.funcId);
  const replacement = `${match[1]}\n${body}\n${match[3]}`;
  const updated = file.content.replace(funcRegex, replacement);

  return vfs.updateFile(op.file, updated).then(() => ({ success: true }));
}

function applyFileCreate(
  vfs: VirtualFileSystem,
  op: FileCreate,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op) ||
    validateStringField(op.content, 'content', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  if (typeof op.ifAbsent !== 'boolean') {
    return Promise.resolve(
      failure('Invalid ifAbsent on patch operation.', op),
    );
  }
  const exists = vfs.hasFile(op.file);
  if (exists && op.ifAbsent) {
    return Promise.resolve(
      failure(`File already exists and ifAbsent is true: ${op.file}.`, op),
    );
  }

  if (exists) {
    return vfs.updateFile(op.file, op.content).then(() => ({ success: true }));
  }

  return vfs.addFile(op.file, op.content).then(() => ({ success: true }));
}

function applyFileDelete(
  vfs: VirtualFileSystem,
  op: FileDelete,
  expectedVersion: number,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  const versionError = validateIfVersion(op.ifVersion, expectedVersion, op);
  if (versionError) {
    return Promise.resolve(versionError);
  }

  if (!vfs.hasFile(op.file)) {
    return Promise.resolve(failure(`File not found: ${op.file}.`, op));
  }

  vfs.deleteFile(op.file);
  return Promise.resolve({ success: true });
}

function applyMetadataUpdate(
  vfs: VirtualFileSystem,
  op: MetadataUpdate,
): Promise<PatchResult> {
  const fieldError = validateStringField(op.file, 'file', op);
  if (fieldError) {
    return Promise.resolve(fieldError);
  }
  if (!op.fields || typeof op.fields !== 'object') {
    return Promise.resolve(failure('Invalid fields on patch operation.', op));
  }
  vfs.metadata = updateMetadata(vfs.metadata, op.fields);
  return Promise.resolve({ success: true });
}

function updateMetadata(
  metadata: VfsMetadata,
  fields: Partial<VfsMetadata>,
): VfsMetadata {
  const next: VfsMetadata = {
    title: metadata.title,
    description: metadata.description,
    colors: { ...metadata.colors },
    fonts: { ...metadata.fonts },
  };

  if (typeof fields.title === 'string') {
    next.title = fields.title;
  }
  if (typeof fields.description === 'string') {
    next.description = fields.description;
  }
  if (fields.colors) {
    next.colors = { ...next.colors, ...fields.colors };
  }
  if (fields.fonts) {
    next.fonts = { ...next.fonts, ...fields.fonts };
  }

  return next;
}

function validateIfVersion(
  ifVersion: number,
  expectedVersion: number,
  op: PatchOperation,
): PatchResult | null {
  if (typeof ifVersion !== 'number' || Number.isNaN(ifVersion)) {
    return failure('Invalid ifVersion on patch operation.', op);
  }
  if (ifVersion !== expectedVersion) {
    return failure(
      `Version mismatch for ${op.op}: expected ${expectedVersion}, got ${ifVersion}.`,
      op,
    );
  }
  return null;
}

function validateStringField(
  value: string,
  field: string,
  op: PatchOperation,
): PatchResult | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return failure(`Invalid ${field} on patch operation.`, op);
  }
  return null;
}

function buildSectionRegex(sectionId: string): RegExp {
  const escaped = escapeRegExp(sectionId);
  return new RegExp(
    `(<!--\\s*PP:SECTION:${escaped}\\s*-->)([\\s\\S]*?)(<!--\\s*\\/PP:SECTION:${escaped}\\s*-->)`,
    'm',
  );
}

function buildInsertRegex(markerId: string): RegExp {
  const escaped = escapeRegExp(markerId);
  return new RegExp(`<!--\\s*PP:INSERT_BEFORE:${escaped}\\s*-->`, 'm');
}

function buildBlockRegex(blockId: string): RegExp {
  const escaped = escapeRegExp(blockId);
  return new RegExp(
    `(\\/\\*\\s*===\\s*PP:BLOCK:${escaped}\\s*===\\s*\\*\\/)([\\s\\S]*?)(\\/\\*\\s*===\\s*\\/PP:BLOCK:${escaped}\\s*===\\s*\\*\\/)`,
    'm',
  );
}

function buildFuncRegex(funcId: string): RegExp {
  const escaped = escapeRegExp(funcId);
  return new RegExp(
    `(\\/\\/\\s*===\\s*PP:FUNC:${escaped}\\s*===)([\\s\\S]*?)(\\/\\/\\s*===\\s*\\/PP:FUNC:${escaped}\\s*===)`,
    'm',
  );
}

function hasSectionAnchors(html: string, sectionId: string): boolean {
  const escaped = escapeRegExp(sectionId);
  const open = new RegExp(`<!--\\s*PP:SECTION:${escaped}\\s*-->`);
  const close = new RegExp(`<!--\\s*\\/PP:SECTION:${escaped}\\s*-->`);
  return open.test(html) && close.test(html);
}

function hasBlockAnchors(css: string, blockId: string): boolean {
  const escaped = escapeRegExp(blockId);
  const open = new RegExp(
    `\\/\\*\\s*===\\s*PP:BLOCK:${escaped}\\s*===\\s*\\*\\/`,
  );
  const close = new RegExp(
    `\\/\\*\\s*===\\s*\\/PP:BLOCK:${escaped}\\s*===\\s*\\*\\/`,
  );
  return open.test(css) && close.test(css);
}

function hasFuncAnchors(js: string, funcId: string): boolean {
  const escaped = escapeRegExp(funcId);
  const open = new RegExp(`\\/\\/\\s*===\\s*PP:FUNC:${escaped}\\s*===`);
  const close = new RegExp(`\\/\\/\\s*===\\s*\\/PP:FUNC:${escaped}\\s*===`);
  return open.test(js) && close.test(js);
}

function extractBlockBody(css: string, blockId: string): string {
  const match = css.match(buildBlockRegex(blockId));
  return match ? match[2] : css;
}

function extractFuncBody(js: string, funcId: string): string {
  const match = js.match(buildFuncRegex(funcId));
  return match ? match[2] : js;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function failure(message: string, failedOp?: PatchOperation): PatchResult {
  return {
    success: false,
    error: message,
    failedOp,
  };
}
