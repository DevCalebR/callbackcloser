import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('portfolio demo lead status actions are disabled in the UI and guarded on post', () => {
  const portfolioDemo = read('lib/portfolio-demo.ts');
  const leadActions = read('app/app/leads/actions.ts');
  const homeDashboard = read('components/home-dashboard.tsx');
  const leadDetailPage = read('app/app/leads/[leadId]/page.tsx');

  assert.match(portfolioDemo, /PORTFOLIO_DEMO_ACTIONS_DISABLED_MESSAGE = 'Demo mode only - actions are disabled\.'/);
  assert.match(leadActions, /isPortfolioDemoMode\(\)/);
  assert.match(leadActions, /PORTFOLIO_DEMO_ACTIONS_DISABLED_MESSAGE/);
  assert.match(leadActions, /updateLeadStatusForBusiness/);
  assert.match(leadActions, /if \(isPortfolioDemoMode\(\)\)[\s\S]*updateLeadStatusForBusiness/);

  assert.match(homeDashboard, /disabled=\{isDemoMode\} leadId=\{lead\.id\} label="Mark contacted"/);
  assert.match(homeDashboard, /disabled=\{isDemoMode\} leadId=\{lead\.id\} label="Mark booked"/);
  assert.match(homeDashboard, /title=\{PORTFOLIO_DEMO_ACTIONS_DISABLED_MESSAGE\}/);
  assert.match(homeDashboard, /isDemoMode \? <div className="rounded-md border bg-muted\/40 p-3 text-sm">/);

  assert.match(leadDetailPage, /disabled=\{demoMode\}/);
  assert.match(leadDetailPage, /label="Mark contacted"/);
  assert.match(leadDetailPage, /label="Mark booked"/);
  assert.match(leadDetailPage, /label="Mark lost"/);
  assert.match(leadDetailPage, /title=\{PORTFOLIO_DEMO_ACTIONS_DISABLED_MESSAGE\}/);
  assert.match(leadDetailPage, /demoMode \? <div className="rounded-md border bg-muted\/40 p-3 text-sm">/);
});

test('portfolio demo settings and billing actions cannot mutate real services', () => {
  const settingsPage = read('app/app/settings/page.tsx');
  const settingsActions = read('app/app/settings/actions.ts');
  const billingPage = read('app/app/billing/page.tsx');
  const stripeCheckoutRoute = read('app/api/stripe/checkout/route.ts');
  const stripePortalRoute = read('app/api/stripe/portal/route.ts');

  assert.match(settingsPage, /<fieldset disabled=\{demoMode\} className="contents">/);
  assert.match(settingsPage, /disabled=\{demoMode\}/);
  assert.match(settingsPage, /PORTFOLIO_DEMO_ACTIONS_DISABLED_MESSAGE/);
  assert.match(settingsActions, /isPortfolioDemoMode\(\)/);
  assert.match(settingsActions, /export async function saveBusinessSettingsAction[\s\S]*if \(isPortfolioDemoMode\(\)\)[\s\S]*averageJobValueCents/);

  assert.match(billingPage, /PORTFOLIO_DEMO_ACTIONS_DISABLED_MESSAGE/);
  assert.match(billingPage, /disabled=\{demoMode \|\| !starterPriceId\}/);
  assert.match(billingPage, /disabled=\{demoMode \|\| !growthPriceId\}/);
  assert.match(billingPage, /disabled=\{demoMode\}/);

  assert.match(stripeCheckoutRoute, /isPortfolioDemoMode\(\)/);
  assert.ok(stripeCheckoutRoute.indexOf('if (isPortfolioDemoMode())') < stripeCheckoutRoute.indexOf('stripe.checkout.sessions.create'));
  assert.match(stripePortalRoute, /isPortfolioDemoMode\(\)/);
  assert.ok(stripePortalRoute.indexOf('if (isPortfolioDemoMode())') < stripePortalRoute.indexOf('stripe.billingPortal.sessions.create'));
});
