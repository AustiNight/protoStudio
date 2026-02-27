import type { TemplateConfig } from '../../types/template';

import blogConfig from './configs/blog.json';
import bookingsConfig from './configs/bookings.json';
import formToEmailConfig from './configs/form-to-email.json';
import marketingConfig from './configs/marketing.json';
import portfolioConfig from './configs/portfolio.json';
import saasLandingConfig from './configs/saas-landing.json';
import simpleStoreConfig from './configs/simple-store.json';
import smallBusinessConfig from './configs/small-business.json';

export const TEMPLATE_CATALOG: TemplateConfig[] = [
  marketingConfig as TemplateConfig,
  portfolioConfig as TemplateConfig,
  smallBusinessConfig as TemplateConfig,
  blogConfig as TemplateConfig,
  saasLandingConfig as TemplateConfig,
  simpleStoreConfig as TemplateConfig,
  bookingsConfig as TemplateConfig,
  formToEmailConfig as TemplateConfig,
];

export function getTemplateById(
  templateId: string,
  catalog: TemplateConfig[] = TEMPLATE_CATALOG,
): TemplateConfig | null {
  const match = catalog.find((template) => template.id === templateId);
  return match ?? null;
}
