import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import pricingConfigRaw from '../../../src/config/model-pricing.json';
import { CostTicker } from '../../../src/components/shared/CostTicker';
import type { PricingConfig } from '../../../src/types/pricing';

const pricingConfig = pricingConfigRaw as PricingConfig;

describe('CostTicker', () => {
  it('should display last-updated date in tooltip', () => {
    const markup = renderToStaticMarkup(<CostTicker totalCost={0} roles={[]} />);

    expect(markup).toContain(`Pricing updated: ${pricingConfig.lastUpdated}`);
  });

  it('shows tiny non-zero totals as visible non-zero values', () => {
    const markup = renderToStaticMarkup(
      <CostTicker
        totalCost={0.0025}
        roles={[
          {
            role: 'chat',
            cost: 0.0025,
            calls: 1,
            promptTokens: 1000,
            completionTokens: 1000,
            models: [
              {
                model: 'gpt-5.3-chat-latest',
                calls: 1,
                promptTokens: 1000,
                completionTokens: 1000,
                cost: 0.0025,
              },
            ],
          },
        ]}
      />,
    );

    expect(markup).toContain('&lt;$0.01');
    expect(markup).toContain('$0.0025');
  });
});
