const fs = require('fs');
const path = require('path');

const OFFICIAL_OPENAI_HOSTS = new Set(['platform.openai.com', 'developers.openai.com']);
const DEFAULT_MAX_STALE_DAYS = 45;
const DEFAULT_TIMEOUT_MS = 15_000;

const argv = process.argv.slice(2);
const options = {
  maxStaleDays: readNumberFlag('--max-stale-days', DEFAULT_MAX_STALE_DAYS),
  timeoutMs: readNumberFlag('--timeout-ms', DEFAULT_TIMEOUT_MS),
  verifySources: argv.includes('--verify-sources'),
  checkCatalog: argv.includes('--check-catalog'),
  failOnMissingCatalog: argv.includes('--fail-on-missing-catalog'),
};

const rootDir = path.join(__dirname, '..');
const pricingPath = path.join(rootDir, 'src', 'config', 'model-pricing.json');

async function main() {
  const findings = [];
  const warnings = [];
  const now = new Date();
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
  } catch (error) {
    console.error('Failed to parse model-pricing.json');
    process.exit(1);
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.models !== 'object') {
    findings.push('model-pricing.json must contain a top-level models object.');
    return report(findings);
  }

  if (!isIsoDate(parsed.lastUpdated)) {
    findings.push('lastUpdated must be YYYY-MM-DD.');
  } else {
    const age = daysSince(parsed.lastUpdated, now);
    if (age === null) {
      findings.push(`lastUpdated is invalid: ${parsed.lastUpdated}`);
    } else if (age > options.maxStaleDays) {
      findings.push(
        `lastUpdated is ${age} days old (max ${options.maxStaleDays}).`,
      );
    }
  }

  const uniqueUrls = new Set();
  for (const [modelId, entry] of Object.entries(parsed.models)) {
    if (!isOpenAIModelId(modelId)) {
      continue;
    }
    if (!entry || typeof entry !== 'object') {
      findings.push(`OpenAI model ${modelId} must be an object.`);
      continue;
    }
    const sourceUrls = entry.sourceUrls;
    if (!Array.isArray(sourceUrls) || sourceUrls.length === 0) {
      findings.push(`OpenAI model ${modelId} must define sourceUrls.`);
    } else {
      for (const url of sourceUrls) {
        if (!isOfficialSourceUrl(url)) {
          findings.push(`OpenAI model ${modelId} has invalid source URL: ${String(url)}`);
        } else {
          uniqueUrls.add(url);
        }
      }
    }

    if (!isIsoDate(entry.reviewedAt)) {
      findings.push(`OpenAI model ${modelId} reviewedAt must be YYYY-MM-DD.`);
      continue;
    }
    const age = daysSince(entry.reviewedAt, now);
    if (age === null) {
      findings.push(`OpenAI model ${modelId} reviewedAt is invalid: ${entry.reviewedAt}`);
    } else if (age > options.maxStaleDays) {
      findings.push(
        `OpenAI model ${modelId} reviewedAt is ${age} days old (max ${options.maxStaleDays}).`,
      );
    }
  }

  if (options.verifySources && uniqueUrls.size > 0) {
    for (const url of uniqueUrls) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await pingUrl(url, options.timeoutMs);
      if (!ok) {
        findings.push(`Could not verify official source URL: ${url}`);
      }
    }
  }

  if (options.checkCatalog) {
    const catalogReport = await runCatalogCoverageChecks(parsed.models, options.timeoutMs);
    warnings.push(...catalogReport.warnings);
    if (options.failOnMissingCatalog) {
      findings.push(...catalogReport.missingFindings);
    } else if (catalogReport.missingFindings.length > 0) {
      warnings.push(...catalogReport.missingFindings);
    }
  }

  report(findings, warnings);
}

function readNumberFlag(flag, fallback) {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return fallback;
  }
  const raw = argv[index + 1];
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isOpenAIModelId(modelId) {
  if (modelId.startsWith('gpt-')) {
    return true;
  }
  return /^o[0-9][a-z0-9-]*$/i.test(modelId);
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysSince(value, now) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return 0;
  }
  return Math.floor(diffMs / 86_400_000);
}

function isOfficialSourceUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && OFFICIAL_OPENAI_HOSTS.has(parsed.hostname);
  } catch (error) {
    return false;
  }
}

async function pingUrl(url, timeoutMs) {
  if (typeof fetch !== 'function') {
    return false;
  }

  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timeout =
    controller === null
      ? null
      : setTimeout(() => {
          controller.abort();
        }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller ? controller.signal : undefined,
    });
    if (response.status >= 200 && response.status < 500) {
      return true;
    }
  } catch (error) {
    return false;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
  return false;
}

function report(findings, warnings = []) {
  if (warnings.length > 0) {
    console.warn('Pricing calibration warnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }
  if (findings.length === 0) {
    console.log('Pricing calibration check passed.');
    return;
  }
  console.error('Pricing calibration check failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

async function runCatalogCoverageChecks(models, timeoutMs) {
  const known = new Set(Object.keys(models));
  const warnings = [];
  const missingFindings = [];

  const openAIKey = (process.env.OPENAI_API_KEY ?? '').trim();
  if (openAIKey) {
    const ids = await fetchOpenAIModelIds(openAIKey, timeoutMs);
    if (ids) {
      const missing = ids.filter((id) => isOpenAIModelId(id) && !known.has(id));
      if (missing.length > 0) {
        missingFindings.push(
          `OpenAI catalog has ${missing.length} models missing from pricing config (examples: ${missing
            .slice(0, 6)
            .join(', ')}).`,
        );
      }
    } else {
      warnings.push('OpenAI model catalog check failed (request/parsing).');
    }
  } else {
    warnings.push('OPENAI_API_KEY not set; skipped OpenAI catalog coverage check.');
  }

  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (anthropicKey) {
    const ids = await fetchAnthropicModelIds(anthropicKey, timeoutMs);
    if (ids) {
      const missing = ids.filter((id) => !known.has(id));
      if (missing.length > 0) {
        missingFindings.push(
          `Anthropic catalog has ${missing.length} models missing from pricing config (examples: ${missing
            .slice(0, 6)
            .join(', ')}).`,
        );
      }
    } else {
      warnings.push('Anthropic model catalog check failed (request/parsing).');
    }
  } else {
    warnings.push('ANTHROPIC_API_KEY not set; skipped Anthropic catalog coverage check.');
  }

  const googleKey = (process.env.GOOGLE_API_KEY ?? '').trim();
  if (googleKey) {
    const ids = await fetchGoogleModelIds(googleKey, timeoutMs);
    if (ids) {
      const normalizedIds = ids.map((id) => id.replace(/^models\//, ''));
      const missing = normalizedIds.filter((id) => !known.has(id));
      if (missing.length > 0) {
        missingFindings.push(
          `Google catalog has ${missing.length} models missing from pricing config (examples: ${missing
            .slice(0, 6)
            .join(', ')}).`,
        );
      }
    } else {
      warnings.push('Google model catalog check failed (request/parsing).');
    }
  } else {
    warnings.push('GOOGLE_API_KEY not set; skipped Google catalog coverage check.');
  }

  return { warnings, missingFindings };
}

async function fetchOpenAIModelIds(apiKey, timeoutMs) {
  const result = await getJson('https://api.openai.com/v1/models', timeoutMs, {
    Authorization: `Bearer ${apiKey}`,
  });
  if (!result || !Array.isArray(result.data)) {
    return null;
  }
  return result.data
    .map((entry) => (typeof entry?.id === 'string' ? entry.id : null))
    .filter((id) => typeof id === 'string');
}

async function fetchAnthropicModelIds(apiKey, timeoutMs) {
  const result = await getJson('https://api.anthropic.com/v1/models', timeoutMs, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  });
  if (!result || !Array.isArray(result.data)) {
    return null;
  }
  return result.data
    .map((entry) => (typeof entry?.id === 'string' ? entry.id : null))
    .filter((id) => typeof id === 'string');
}

async function fetchGoogleModelIds(apiKey, timeoutMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    apiKey,
  )}`;
  const result = await getJson(url, timeoutMs);
  if (!result || !Array.isArray(result.models)) {
    return null;
  }
  return result.models
    .map((entry) => (typeof entry?.name === 'string' ? entry.name : null))
    .filter((id) => typeof id === 'string');
}

async function getJson(url, timeoutMs, headers = {}) {
  if (typeof fetch !== 'function') {
    return null;
  }
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timeout =
    controller === null
      ? null
      : setTimeout(() => {
          controller.abort();
        }, timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller?.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    return null;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

void main();
