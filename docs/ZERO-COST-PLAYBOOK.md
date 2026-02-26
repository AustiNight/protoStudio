# ZERO-COST-PLAYBOOK.md - Hosting and Integrations

## Purpose
Provide a deterministic, zero-cost hosting strategy and a safe set of integrations for generated sites.

## Hosting Priority
Always select the first host with valid tokens:
1. GitHub Pages
2. Cloudflare Pages
3. Netlify
4. Vercel (hobby)

If no tokens exist, the deploy UI must stay disabled.

## Host Capabilities Matrix
| Host | Best For | Limits | Notes |
| --- | --- | --- | --- |
| GitHub Pages | simple static sites | static only | default choice when token available |
| Cloudflare Pages | static + fast edge | static only | good for larger assets |
| Netlify | static + forms | static only | use only if user consent for forms exists |
| Vercel (hobby) | static preview | static only | lowest priority |

## Zero-Cost Guardrails
- No paid services unless the user explicitly consents.
- No server-side code or databases.
- All functionality must run client-side.
- No third-party trackers or ads.

## Allowed Integrations (Default)
- Static embeds using iframe or simple script tags.
- Client-side interactions only.
- Optional embeds must be user-confirmed if they set cookies.

## Common Features and Approved Approaches
- Contact forms: use `mailto:` by default or Netlify Forms only with explicit consent.
- Calendars: embed using vendor-provided iframe (user consent required).
- Maps: use static map images or privacy-friendly embeds.
- Blog: static HTML pages, RSS XML generated at build time.
- Store: client-side cart with localStorage; external checkout link.

## Builder Guidance
When you need a feature that could require paid services, propose a zero-cost alternative first. If the user insists, push back twice, then comply with a caveat and mark the dependency clearly.
