import type {
  SectionCategory,
  SectionValidationIssue,
  SectionValidationResult,
  SlotType,
} from '../../types/template';

const SECTION_CATEGORIES: SectionCategory[] = ['universal', 'near-universal', 'shared', 'unique'];
const SLOT_TYPES: SlotType[] = ['text', 'richtext', 'image', 'icon', 'link', 'list', 'embed'];

export function validateSectionDefinition(definition: unknown): SectionValidationResult {
  const issues: SectionValidationIssue[] = [];

  if (!isRecord(definition)) {
    return buildResult([issue('root', 'Section definition must be an object.')]);
  }

  const id = definition.id;
  if (!isNonEmptyString(id)) {
    issues.push(issue('id', 'id must be a non-empty string.'));
  }

  if (!isNonEmptyString(definition.name)) {
    issues.push(issue('name', 'name must be a non-empty string.'));
  }

  if (!isNonEmptyString(definition.description)) {
    issues.push(issue('description', 'description must be a non-empty string.'));
  }

  if (!isSectionCategory(definition.category)) {
    issues.push(issue('category', 'category must be a valid SectionCategory.'));
  }

  const dependencies = readStringArray(definition.dependencies, 'dependencies', issues);
  const conflicts = readStringArray(definition.conflicts, 'conflicts', issues);

  reportDuplicates('dependencies', dependencies, issues);
  reportDuplicates('conflicts', conflicts, issues);

  if (isNonEmptyString(id)) {
    if (dependencies.includes(id)) {
      issues.push(issue('dependencies', 'dependencies cannot include the section id.'));
    }
    if (conflicts.includes(id)) {
      issues.push(issue('conflicts', 'conflicts cannot include the section id.'));
    }
  }

  if (dependencies.length > 0) {
    const overlap = dependencies.filter((value) => conflicts.includes(value));
    if (overlap.length > 0) {
      issues.push(issue('conflicts', `conflicts cannot overlap dependencies: ${overlap.join(', ')}`));
    }
  }

  const slots = definition.slots;
  if (!Array.isArray(slots)) {
    issues.push(issue('slots', 'slots must be an array.'));
  } else {
    const slotIds: string[] = [];
    slots.forEach((slot, index) => {
      issues.push(...validateSectionSlot(slot, `slots[${index}]`));
      if (isRecord(slot) && isNonEmptyString(slot.id)) {
        slotIds.push(slot.id);
      }
    });
    reportDuplicates('slots', slotIds, issues);
  }

  const files = definition.files;
  if (!isRecord(files)) {
    issues.push(issue('files', 'files must be an object with html/css/js paths.'));
  } else {
    if (!isNonEmptyString(files.html)) {
      issues.push(issue('files.html', 'files.html must be a non-empty string.'));
    } else if (!files.html.endsWith('.html')) {
      issues.push(issue('files.html', 'files.html must end with .html.'));
    }

    if (!isNonEmptyString(files.css)) {
      issues.push(issue('files.css', 'files.css must be a non-empty string.'));
    } else if (!files.css.endsWith('.css')) {
      issues.push(issue('files.css', 'files.css must end with .css.'));
    }

    if (files.js !== undefined && !isNonEmptyString(files.js)) {
      issues.push(issue('files.js', 'files.js must be a non-empty string when provided.'));
    }
  }

  const anchors = definition.anchors;
  if (!isRecord(anchors)) {
    issues.push(issue('anchors', 'anchors must be an object.'));
  } else {
    if (!isNonEmptyString(anchors.sectionId)) {
      issues.push(issue('anchors.sectionId', 'anchors.sectionId must be a non-empty string.'));
    }
    if (!isNonEmptyString(anchors.cssBlockId)) {
      issues.push(issue('anchors.cssBlockId', 'anchors.cssBlockId must be a non-empty string.'));
    }
    if (anchors.jsFuncIds !== undefined) {
      const jsFuncIds = readStringArray(anchors.jsFuncIds, 'anchors.jsFuncIds', issues);
      reportDuplicates('anchors.jsFuncIds', jsFuncIds, issues);
    }
  }

  if (definition.seo !== undefined) {
    if (!isRecord(definition.seo)) {
      issues.push(issue('seo', 'seo must be an object.'));
    } else if (typeof definition.seo.injectBaseMeta !== 'boolean') {
      issues.push(issue('seo.injectBaseMeta', 'seo.injectBaseMeta must be a boolean.'));
    }
  }

  if (definition.position !== undefined) {
    issues.push(...validateSectionPosition(definition.position, 'position'));
  }

  return buildResult(issues);
}

export function validateSectionSlot(slot: unknown, path: string): SectionValidationIssue[] {
  const issues: SectionValidationIssue[] = [];

  if (!isRecord(slot)) {
    issues.push(issue(path, 'slot must be an object.'));
    return issues;
  }

  if (!isNonEmptyString(slot.id)) {
    issues.push(issue(`${path}.id`, 'slot id must be a non-empty string.'));
  }

  if (!isNonEmptyString(slot.label)) {
    issues.push(issue(`${path}.label`, 'slot label must be a non-empty string.'));
  }

  const slotType = isSlotType(slot.type) ? slot.type : null;
  if (!slotType) {
    issues.push(issue(`${path}.type`, 'slot type must be a valid SlotType.'));
  }

  if (typeof slot.required !== 'boolean') {
    issues.push(issue(`${path}.required`, 'slot required must be a boolean.'));
  }

  if (slot.maxItems !== undefined) {
    if (typeof slot.maxItems !== 'number' || !Number.isInteger(slot.maxItems) || slot.maxItems <= 0) {
      issues.push(issue(`${path}.maxItems`, 'slot maxItems must be a positive integer when provided.'));
    }
  }

  if (slot.defaultValue !== undefined) {
    if (slotType === 'list') {
      if (!Array.isArray(slot.defaultValue)) {
        issues.push(issue(`${path}.defaultValue`, 'list slot defaultValue must be an array of strings.'));
      } else {
        slot.defaultValue.forEach((entry, index) => {
          if (!isNonEmptyString(entry)) {
            issues.push(issue(`${path}.defaultValue[${index}]`, 'list slot defaultValue entries must be strings.'));
          }
        });
        if (typeof slot.maxItems === 'number' && slot.defaultValue.length > slot.maxItems) {
          issues.push(issue(`${path}.defaultValue`, 'list slot defaultValue exceeds maxItems.'));
        }
      }
    } else if (slotType) {
      if (Array.isArray(slot.defaultValue)) {
        issues.push(issue(`${path}.defaultValue`, 'slot defaultValue must be a string for non-list slots.'));
      } else if (!isNonEmptyString(slot.defaultValue)) {
        issues.push(issue(`${path}.defaultValue`, 'slot defaultValue must be a non-empty string.'));
      }
    }
  }

  if (slot.maxItems !== undefined && slotType && slotType !== 'list') {
    issues.push(issue(`${path}.maxItems`, 'maxItems is only valid for list slots.'));
  }

  return issues;
}

function validateSectionPosition(position: unknown, path: string): SectionValidationIssue[] {
  const issues: SectionValidationIssue[] = [];

  if (!isRecord(position)) {
    issues.push(issue(path, 'position must be an object.'));
    return issues;
  }

  const zone = position.zone;
  if (zone !== 'header' && zone !== 'main' && zone !== 'footer') {
    issues.push(issue(`${path}.zone`, 'position.zone must be header, main, or footer.'));
  }

  if (position.after !== undefined) {
    readStringArray(position.after, `${path}.after`, issues);
  }

  if (position.before !== undefined) {
    readStringArray(position.before, `${path}.before`, issues);
  }

  return issues;
}

function buildResult(issues: SectionValidationIssue[]): SectionValidationResult {
  return {
    valid: issues.length === 0,
    issues,
  };
}

function issue(path: string, message: string): SectionValidationIssue {
  return { path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSectionCategory(value: unknown): value is SectionCategory {
  return typeof value === 'string' && SECTION_CATEGORIES.includes(value as SectionCategory);
}

function isSlotType(value: unknown): value is SlotType {
  return typeof value === 'string' && SLOT_TYPES.includes(value as SlotType);
}

function readStringArray(
  value: unknown,
  path: string,
  issues: SectionValidationIssue[],
): string[] {
  if (!Array.isArray(value)) {
    issues.push(issue(path, 'expected an array of strings.'));
    return [];
  }

  const result: string[] = [];
  value.forEach((entry, index) => {
    if (isNonEmptyString(entry)) {
      result.push(entry);
    } else {
      issues.push(issue(`${path}[${index}]`, 'expected a non-empty string.'));
    }
  });

  return result;
}

function reportDuplicates(path: string, values: string[], issues: SectionValidationIssue[]): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.push(value);
    } else {
      seen.add(value);
    }
  }

  if (duplicates.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicates));
    issues.push(issue(path, `duplicate values: ${uniqueDuplicates.join(', ')}`));
  }
}
