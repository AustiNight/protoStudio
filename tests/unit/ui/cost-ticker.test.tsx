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
});
