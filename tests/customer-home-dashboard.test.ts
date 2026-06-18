import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  MAX_AVERAGE_JOB_VALUE,
  averageJobValueCentsToDollars,
  averageJobValueDollarsToCents,
  DEFAULT_AVERAGE_JOB_VALUE,
} from '../lib/business-settings.ts';
import { businessSettingsSchema } from '../lib/validators.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('average job value helpers round-trip whole-dollar business settings values', () => {
  assert.equal(averageJobValueDollarsToCents(undefined), null);
  assert.equal(averageJobValueDollarsToCents(750), 75_000);
  assert.equal(averageJobValueCentsToDollars(75_000), 750);
  assert.equal(averageJobValueCentsToDollars(null), null);
  assert.equal(DEFAULT_AVERAGE_JOB_VALUE, 500);
});

test('business settings schema accepts a blank average job value and rejects invalid values', () => {
  const blank = businessSettingsSchema.safeParse({
    name: 'Northside Plumbing',
    phoneSetupPath: 'NEW_TWILIO_NUMBER',
    publicBusinessPhone: '',
    forwardingNumber: '+15125550111',
    notifyPhone: '+15125550199',
    ownerEmail: 'owner@example.com',
    timezone: 'America/Chicago',
    missedCallSeconds: 20,
    averageJobValue: '',
    serviceLabel1: 'Repair',
    serviceLabel2: 'Install',
    serviceLabel3: 'Maintenance',
    notifySms: 'true',
    notifyEmail: 'true',
    notifyInApp: 'true',
    urgentOnly: 'false',
  });

  assert.equal(blank.success, true);
  if (blank.success) {
    assert.equal(blank.data.averageJobValue, undefined);
  }

  const configured = businessSettingsSchema.safeParse({
    name: 'Northside Plumbing',
    phoneSetupPath: 'NEW_TWILIO_NUMBER',
    publicBusinessPhone: '',
    forwardingNumber: '+15125550111',
    notifyPhone: '+15125550199',
    ownerEmail: 'owner@example.com',
    timezone: 'America/Chicago',
    missedCallSeconds: 20,
    averageJobValue: '750',
    serviceLabel1: 'Repair',
    serviceLabel2: 'Install',
    serviceLabel3: 'Maintenance',
    notifySms: 'true',
    notifyEmail: 'true',
    notifyInApp: 'true',
    urgentOnly: 'false',
  });

  assert.equal(configured.success, true);
  if (configured.success) {
    assert.equal(configured.data.averageJobValue, 750);
  }

  const invalid = businessSettingsSchema.safeParse({
    name: 'Northside Plumbing',
    phoneSetupPath: 'NEW_TWILIO_NUMBER',
    publicBusinessPhone: '',
    forwardingNumber: '+15125550111',
    notifyPhone: '+15125550199',
    ownerEmail: 'owner@example.com',
    timezone: 'America/Chicago',
    missedCallSeconds: 20,
    averageJobValue: String(MAX_AVERAGE_JOB_VALUE + 1),
    serviceLabel1: 'Repair',
    serviceLabel2: 'Install',
    serviceLabel3: 'Maintenance',
    notifySms: 'true',
    notifyEmail: 'true',
    notifyInApp: 'true',
    urgentOnly: 'false',
  });

  assert.equal(invalid.success, false);
});

test('customer home dashboard focuses on owner lead follow-up', () => {
  const appHomePage = read('app/app/page.tsx');
  const homeDashboard = read('components/home-dashboard.tsx');

  assert.match(appHomePage, /listAllDashboardLeadsForBusiness\(business\.id\)/);
  assert.match(appHomePage, /label: 'New leads'/);
  assert.match(appHomePage, /label: 'Needs follow-up'/);
  assert.match(appHomePage, /label: 'Booked leads'/);
  assert.match(appHomePage, /label: 'Missed calls today'/);
  assert.match(appHomePage, /statusItems=\{getStatusItems\(\{ ownerAlertsReady, systemStatus \}\)\}/);
  assert.match(homeDashboard, /Missed-call leads/);
  assert.match(homeDashboard, /Leads needing attention/);
  assert.match(homeDashboard, /Recent leads/);
  assert.match(homeDashboard, /System status/);
  assert.match(homeDashboard, /Call now/);
  assert.match(homeDashboard, /Mark contacted/);
  assert.match(homeDashboard, /Mark booked/);
  assert.match(homeDashboard, /Test recovery flow/);
  assert.match(homeDashboard, /xl:grid-cols-\[minmax\(0,1fr\)_340px\]/);
  assert.match(homeDashboard, /xl:sticky xl:top-6 xl:self-start/);
  assert.match(homeDashboard, /variant="outline"/);
  assert.doesNotMatch(homeDashboard, /Run test missed call/);
  assert.doesNotMatch(homeDashboard, /Run demo lead/);
  assert.doesNotMatch(homeDashboard, /Test demo flow/);
  assert.doesNotMatch(homeDashboard, /Finish activation/);
  assert.doesNotMatch(homeDashboard, /Recovery numbers|AI Summary|command center|Estimated revenue saved/);
  assert.doesNotMatch(appHomePage, /twilio-setup-flow|Texting activation/);
});

test('business settings UI and action wire average job value persistence into the dashboard', () => {
  const settingsPage = read('app/app/settings/page.tsx');
  const settingsAction = read('app/app/settings/actions.ts');

  assert.match(settingsPage, /Average job value/);
  assert.match(settingsPage, /Used to estimate recovered revenue on your dashboard\./);
  assert.match(settingsPage, /name="averageJobValue"/);
  assert.match(settingsAction, /averageJobValueCents: averageJobValueDollarsToCents\(parsed\.data\.averageJobValue\)/);
  assert.match(settingsAction, /revalidatePath\('\/app'\)/);
});
