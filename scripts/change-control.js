const fs = require('fs');
const { execSync } = require('child_process');

const allowedModules = new Set([
  'chat',
  'preview',
  'backlog',
  'builder',
  'deploy',
  'vfs',
  'templates',
  'settings',
  'store',
  'ci',
  'docs',
]);

function run(command) {
  return execSync(command, { encoding: 'utf8' }).trim();
}

function isZeroSha(value) {
  return typeof value === 'string' && /^0+$/.test(value);
}

function getCommitSubjects(baseRef, headRef) {
  const range = baseRef ? `${baseRef}..${headRef}` : null;
  const logCommand = baseRef
    ? `git log --format=%s ${range}`
    : `git log -1 --format=%s ${headRef}`;

  const output = run(logCommand);
  if (!output) {
    return [];
  }
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function lintCommitMessages(subjects) {
  const errors = [];
  const pattern = /^(feat|fix)\(([^)]+)\): (.+)$/;

  for (const subject of subjects) {
    const match = subject.match(pattern);
    if (!match) {
      errors.push(`Commit message does not match required format: "${subject}"`);
      continue;
    }

    const moduleName = match[2];
    if (!allowedModules.has(moduleName)) {
      errors.push(`Commit module "${moduleName}" is not allowed in: "${subject}"`);
    }
  }

  return errors;
}

function readPackageJsonAt(ref) {
  try {
    const content = run(`git show ${ref}:package.json`);
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function collectDependencies(pkg) {
  if (!pkg) {
    return new Set();
  }
  const sections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];
  const deps = new Set();
  for (const section of sections) {
    const block = pkg[section] || {};
    for (const name of Object.keys(block)) {
      deps.add(name);
    }
  }
  return deps;
}

function getAddedDependencies(basePkg, headPkg) {
  const baseDeps = collectDependencies(basePkg);
  const headDeps = collectDependencies(headPkg);
  const added = [];
  for (const dep of headDeps) {
    if (!baseDeps.has(dep)) {
      added.push(dep);
    }
  }
  return added;
}

function lintDependencyDecisions(baseRef, headRef) {
  const errors = [];
  if (!fs.existsSync('package.json')) {
    return errors;
  }

  const basePkg = baseRef ? readPackageJsonAt(baseRef) : null;
  if (!basePkg) {
    return errors;
  }

  const headPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const addedDeps = getAddedDependencies(basePkg, headPkg);

  if (addedDeps.length === 0) {
    return errors;
  }

  let diffFiles = '';
  try {
    diffFiles = run(`git diff --name-only ${baseRef}..${headRef}`);
  } catch (error) {
    errors.push('Unable to determine changed files for dependency decision check.');
    return errors;
  }

  const changed = diffFiles.split('\n').filter(Boolean);
  const decisionsUpdated = changed.includes('docs/DECISIONS.md');

  if (!decisionsUpdated) {
    errors.push(
      `New dependencies detected (${addedDeps.join(
        ', '
      )}) but docs/DECISIONS.md was not updated.`
    );
  }

  return errors;
}

function main() {
  const baseRefRaw = process.env.CHANGE_CONTROL_BASE || '';
  const headRef = process.env.CHANGE_CONTROL_HEAD || 'HEAD';
  const baseRef = baseRefRaw && !isZeroSha(baseRefRaw) ? baseRefRaw : null;
  const errors = [];

  try {
    const subjects = getCommitSubjects(baseRef, headRef);
    errors.push(...lintCommitMessages(subjects));
  } catch (error) {
    errors.push('Unable to read commit messages for change-control lint.');
  }

  try {
    errors.push(...lintDependencyDecisions(baseRef, headRef));
  } catch (error) {
    errors.push('Dependency decision lint encountered an unexpected error.');
  }

  if (errors.length > 0) {
    console.error('Change control checks failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Change control checks passed.');
}

main();
