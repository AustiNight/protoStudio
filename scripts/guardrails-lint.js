const fs = require('fs');
const path = require('path');

const REVIEW_DATE = '2026-03-02';
const OFFICIAL_OPENAI_HOSTS = new Set(['platform.openai.com', 'developers.openai.com']);

const rootDir = path.join(__dirname, '..');
const srcRoot = path.join(rootDir, 'src');
const engineRoot = path.join(srcRoot, 'engine');
const settingsModalPath = path.join(srcRoot, 'components', 'shared', 'SettingsModal.tsx');
const modelPricingPath = path.join(srcRoot, 'config', 'model-pricing.json');

const reactPatterns = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom['"]/,
  /require\(['"]react['"]\)/,
  /import\s+React\b/,
];

const anyPatterns = [/\b:\s*any\b/, /\bas\s+any\b/, /<any>/];

const findings = [];

function listFiles(dir, extensionPattern) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, extensionPattern));
      continue;
    }
    if (entry.isFile() && extensionPattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function toProjectPath(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function addFinding(filePath, reason) {
  findings.push({ file: toProjectPath(filePath), reason });
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function isOpenAIModelId(modelId) {
  if (modelId.startsWith('gpt-')) {
    return true;
  }
  return /^o[0-9][a-z0-9-]*$/i.test(modelId);
}

function hasForbiddenConsoleLog(content) {
  return /\bconsole\.log\s*\(/.test(content);
}

function scanEngineBoundaries() {
  const files = listFiles(engineRoot, /\.(ts|tsx|js|jsx)$/);
  for (const file of files) {
    const content = readFile(file);

    for (const pattern of reactPatterns) {
      if (pattern.test(content)) {
        addFinding(file, 'React import in src/engine is forbidden.');
        break;
      }
    }

    for (const pattern of anyPatterns) {
      if (pattern.test(content)) {
        addFinding(file, 'any usage in src/engine is forbidden.');
        break;
      }
    }
  }
}

function scanConsoleLogs() {
  const files = listFiles(srcRoot, /\.(ts|tsx|js|jsx)$/);
  for (const file of files) {
    const content = readFile(file);
    if (hasForbiddenConsoleLog(content)) {
      addFinding(file, 'console.log is forbidden in src/** to avoid accidental secret logging.');
    }
  }
}

function scanSettingsSourceOfTruth() {
  if (!fs.existsSync(settingsModalPath)) {
    addFinding(settingsModalPath, 'SettingsModal.tsx is missing.');
    return;
  }

  const settingsModal = readFile(settingsModalPath);

  if (!/useSettingsStore/.test(settingsModal)) {
    addFinding(
      settingsModalPath,
      'SettingsModal must read/write runtime settings through useSettingsStore.',
    );
  }
  if (/localStorage/.test(settingsModal)) {
    addFinding(
      settingsModalPath,
      'SettingsModal cannot directly use localStorage; use useSettingsStore persistence actions.',
    );
  }
  if (/\b(?:encrypt|decrypt)\s*\(/.test(settingsModal)) {
    addFinding(
      settingsModalPath,
      'SettingsModal cannot directly call encrypt/decrypt; use useSettingsStore actions.',
    );
  }

  const srcFiles = listFiles(srcRoot, /\.(ts|tsx|js|jsx)$/);
  for (const file of srcFiles) {
    const projectPath = toProjectPath(file);
    const content = readFile(file);

    if (/settings-storage/.test(content)) {
      const allowed =
        projectPath === 'src/store/settings-store.ts' ||
        projectPath === 'src/persistence/settings-storage.ts';
      if (!allowed) {
        addFinding(
          file,
          'Only src/store/settings-store.ts may access settings-storage helpers.',
        );
      }
    }

    if (/studio\.settings\.v1/.test(content) && projectPath !== 'src/persistence/settings-storage.ts') {
      addFinding(
        file,
        'Only src/persistence/settings-storage.ts may reference the settings storage key literal.',
      );
    }
  }
}

function validateOpenAISourceUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return OFFICIAL_OPENAI_HOSTS.has(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function scanModelPricingMetadata() {
  if (!fs.existsSync(modelPricingPath)) {
    addFinding(modelPricingPath, 'model-pricing.json is missing.');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(readFile(modelPricingPath));
  } catch (error) {
    addFinding(modelPricingPath, 'model-pricing.json must be valid JSON.');
    return;
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.models !== 'object') {
    addFinding(modelPricingPath, 'model-pricing.json must include a models object.');
    return;
  }

  const models = parsed.models;
  for (const [modelId, pricing] of Object.entries(models)) {
    if (!isOpenAIModelId(modelId)) {
      continue;
    }
    if (!pricing || typeof pricing !== 'object') {
      addFinding(modelPricingPath, `Model ${modelId} must be an object.`);
      continue;
    }

    const sourceUrls = pricing.sourceUrls;
    if (!Array.isArray(sourceUrls) || sourceUrls.length === 0) {
      addFinding(
        modelPricingPath,
        `OpenAI model ${modelId} must include sourceUrls from official OpenAI docs.`,
      );
    } else {
      const invalidSource = sourceUrls.find((url) => !validateOpenAISourceUrl(url));
      if (invalidSource) {
        addFinding(
          modelPricingPath,
          `OpenAI model ${modelId} contains non-official source URL: ${invalidSource}`,
        );
      }
    }

    if (pricing.reviewedAt !== REVIEW_DATE) {
      addFinding(
        modelPricingPath,
        `OpenAI model ${modelId} must set reviewedAt to ${REVIEW_DATE}.`,
      );
    }
  }
}

function reportAndExit() {
  if (findings.length === 0) {
    console.log('Guardrail lint passed.');
    return;
  }

  console.error('Guardrail lint failed. Disallowed patterns found:');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.reason}`);
  }
  process.exit(1);
}

function main() {
  scanEngineBoundaries();
  scanConsoleLogs();
  scanSettingsSourceOfTruth();
  scanModelPricingMetadata();
  reportAndExit();
}

main();
