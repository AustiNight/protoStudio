export type LlmKeyGuideId = 'openai' | 'anthropic' | 'google';
export type DeployTokenGuideId = 'github' | 'cloudflare' | 'netlify' | 'vercel';

export interface TokenGuide<TId extends string> {
  id: TId;
  title: string;
  steps: [string, string, string];
  urls: string[];
  securityNotes: string[];
  lastVerified: string;
}

export const LLM_KEY_GUIDES: TokenGuide<LlmKeyGuideId>[] = [
  {
    id: 'openai',
    title: 'OpenAI key guide',
    steps: [
      'Open the OpenAI dashboard and select API keys.',
      'Create a new key with least privilege.',
      'Paste it into the OpenAI field and click Ping.',
    ],
    urls: ['https://platform.openai.com/settings/organization/api-keys'],
    securityNotes: [
      'Store API keys in encrypted local settings only.',
      'Do not paste keys into chat or commit them to source control.',
    ],
    lastVerified: '2026-03-02',
  },
  {
    id: 'anthropic',
    title: 'Anthropic key guide',
    steps: [
      'Open the Anthropic console and create a new API key.',
      'Copy the key and keep it somewhere safe.',
      'Paste it into the Anthropic field and click Ping.',
    ],
    urls: ['https://console.anthropic.com/settings/keys'],
    securityNotes: [
      'Rotate keys on suspected exposure.',
      'Use separate keys for development and production where possible.',
    ],
    lastVerified: '2026-03-02',
  },
  {
    id: 'google',
    title: 'Google key guide',
    steps: [
      'Open Google AI Studio and generate an API key.',
      'Restrict the key to allowed origins if possible.',
      'Paste it into the Google field and click Ping.',
    ],
    urls: ['https://aistudio.google.com/app/apikey'],
    securityNotes: [
      'Apply origin restrictions where supported.',
      'Regenerate keys that are copied into untrusted environments.',
    ],
    lastVerified: '2026-03-02',
  },
];

export const DEPLOY_TOKEN_GUIDES: TokenGuide<DeployTokenGuideId>[] = [
  {
    id: 'github',
    title: 'GitHub Pages token guide',
    steps: [
      'Create a classic or fine-grained token with repo permissions.',
      'Enable workflow and Pages permissions for the repo.',
      'Paste the token into the GitHub field and ping it.',
    ],
    urls: ['https://github.com/settings/tokens'],
    securityNotes: [
      'Grant minimum scopes required for deployment.',
      'Prefer fine-grained tokens scoped to a single repository.',
    ],
    lastVerified: '2026-03-02',
  },
  {
    id: 'cloudflare',
    title: 'Cloudflare Pages token guide',
    steps: [
      'Create an API token with Pages and account access.',
      'Copy the token and store it securely.',
      'Paste it into the Cloudflare field and ping it.',
    ],
    urls: ['https://dash.cloudflare.com/profile/api-tokens'],
    securityNotes: [
      'Use token templates with least privilege.',
      'Avoid broad account-wide edit permissions when possible.',
    ],
    lastVerified: '2026-03-02',
  },
  {
    id: 'netlify',
    title: 'Netlify token guide',
    steps: [
      'Generate a personal access token in the Netlify UI.',
      'Grant it access to deploy and manage sites.',
      'Paste it into the Netlify field and ping it.',
    ],
    urls: ['https://app.netlify.com/user/applications#personal-access-tokens'],
    securityNotes: [
      'Limit token reuse across unrelated projects.',
      'Revoke tokens that are no longer in use.',
    ],
    lastVerified: '2026-03-02',
  },
  {
    id: 'vercel',
    title: 'Vercel token guide',
    steps: [
      'Create a token in your Vercel account settings.',
      'Scope it to the projects you plan to use.',
      'Paste it into the Vercel field and ping it.',
    ],
    urls: ['https://vercel.com/account/tokens'],
    securityNotes: [
      'Use separate tokens for personal and team scopes.',
      'Rotate tokens on contributor offboarding.',
    ],
    lastVerified: '2026-03-02',
  },
];
