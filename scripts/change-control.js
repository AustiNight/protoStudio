const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

function runGit(args, cwd = process.cwd()) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryRunGit(args, cwd = process.cwd()) {
  try {
    return runGit(args, cwd);
  } catch (error) {
    return null;
  }
}

function refExists(ref, cwd = process.cwd()) {
  return Boolean(
    tryRunGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
  );
}

function getParentRef(ref, cwd = process.cwd()) {
  return tryRunGit(['rev-parse', '--verify', '--quiet', `${ref}^`], cwd);
}

function resolveComparisonBaseRef(baseRef, headRef, cwd = process.cwd()) {
  if (!baseRef) {
    return { baseRef: null, warning: null };
  }

  if (refExists(baseRef, cwd)) {
    return { baseRef, warning: null };
  }

  const parentRef = getParentRef(headRef, cwd);
  if (parentRef) {
    return {
      baseRef: parentRef,
      warning: `Change control base "${baseRef}" is unavailable; falling back to "${parentRef}".`,
    };
  }

  return {
    baseRef: null,
    warning: `Change control base "${baseRef}" is unavailable; linting HEAD only.`,
  };
}

function isZeroSha(value) {
  return typeof value === 'string' && /^0+$/.test(value);
}

function getCommitSubjects(baseRef, headRef, cwd = process.cwd()) {
  const output = baseRef
    ? runGit(['log', '--format=%s', `${baseRef}..${headRef}`], cwd)
    : runGit(['log', '-1', '--format=%s', headRef], cwd);

  if (!output) {
    return [];
  }
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readPackageJsonAt(ref, cwd = process.cwd()) {
  try {
    const content = runGit(['show', `${ref}:package.json`], cwd);
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

function lintDependencyDecisions(baseRef, headRef, cwd = process.cwd()) {
  const errors = [];
  const packageJsonPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return errors;
  }

  const basePkg = baseRef ? readPackageJsonAt(baseRef, cwd) : null;
  if (!basePkg) {
    return errors;
  }

  const headPkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const addedDeps = getAddedDependencies(basePkg, headPkg);

  if (addedDeps.length === 0) {
    return errors;
  }

  let diffFiles = '';
  try {
    diffFiles = runGit(['diff', '--name-only', `${baseRef}..${headRef}`], cwd);
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

function collectChangeControlResult(options = {}) {
  const baseRefRaw =
    options.baseRefRaw ?? process.env.CHANGE_CONTROL_BASE ?? '';
  const headRef = options.headRef ?? process.env.CHANGE_CONTROL_HEAD ?? 'HEAD';
  const cwd = options.cwd ?? process.cwd();
  const baseRef = baseRefRaw && !isZeroSha(baseRefRaw) ? baseRefRaw : null;
  const errors = [];
  const warnings = [];
  const comparisonBase = resolveComparisonBaseRef(baseRef, headRef, cwd);

  if (!refExists(headRef, cwd)) {
    errors.push(`Change control head "${headRef}" is unavailable.`);
  }

  if (comparisonBase.warning) {
    warnings.push(comparisonBase.warning);
  }

  if (errors.length === 0) {
    try {
      errors.push(...lintDependencyDecisions(comparisonBase.baseRef, headRef, cwd));
    } catch (error) {
      errors.push('Dependency decision lint encountered an unexpected error.');
    }
  }

  return { errors, warnings };
}

function main() {
  const { errors, warnings } = collectChangeControlResult();

  for (const warning of warnings) {
    console.warn(warning);
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

if (require.main === module) {
  main();
}

module.exports = {
  collectChangeControlResult,
  getAddedDependencies,
  getCommitSubjects,
  getParentRef,
  isZeroSha,
  lintDependencyDecisions,
  readPackageJsonAt,
  refExists,
  resolveComparisonBaseRef,
};
