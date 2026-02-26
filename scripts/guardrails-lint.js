const fs = require('fs');
const path = require('path');

const engineRoot = path.join(__dirname, '..', 'src', 'engine');

const reactPatterns = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom['"]/,
  /require\(['"]react['"]\)/,
  /import\s+React\b/,
];

const anyPatterns = [/\b:\s*any\b/, /\bas\s+any\b/, /<any>/];

function listFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  for (const pattern of reactPatterns) {
    if (pattern.test(content)) {
      violations.push('react-import');
      break;
    }
  }

  for (const pattern of anyPatterns) {
    if (pattern.test(content)) {
      violations.push('any-type');
      break;
    }
  }

  return violations;
}

const files = listFiles(engineRoot);
const findings = [];

for (const file of files) {
  const violations = scanFile(file);
  if (violations.length > 0) {
    findings.push({ file, violations });
  }
}

if (findings.length > 0) {
  console.error('Guardrail lint failed. Disallowed patterns found:');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.violations.join(', ')}`);
  }
  process.exit(1);
}

console.log('Guardrail lint passed.');
