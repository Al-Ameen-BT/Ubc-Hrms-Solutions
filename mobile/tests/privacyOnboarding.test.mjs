import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('PrivacyOnboarding requires explicit unchecked affirmations and 18+ affirmation', () => {
  const code = readFileSync(resolve(__dirname, '../src/screens/PrivacyOnboarding.tsx'), 'utf8');

  // Must initialize all checkboxes to false (unselected by default)
  assert.ok(code.includes('termsAgreed, setTermsAgreed] = useState(false)'));
  assert.ok(code.includes('privacyAgreed, setPrivacyAgreed] = useState(false)'));
  assert.ok(code.includes('ageAffirmed, setAgeAffirmed] = useState(false)'));

  // Continues only when all affirmations are true
  assert.ok(code.includes('canContinue = termsAgreed && privacyAgreed && ageAffirmed'));

  // Renders document bodies and 18+ affirmation copy
  assert.ok(code.includes('18 years of age or older'));
  assert.ok(code.includes('/public/dpdp'));
  assert.ok(code.includes('effectiveAt: string'));
  assert.ok(code.includes('<ScrollView style={local.documentBodyBox}'));
  assert.ok(code.includes('bundle.terms.effectiveAt'));
});

test('AuthScreen renders PrivacyOnboarding before scanner and captures acceptedDocumentIds', () => {
  const code = readFileSync(resolve(__dirname, '../src/screens/Auth.tsx'), 'utf8');

  // PrivacyOnboarding gate before scanner
  assert.ok(code.includes('PrivacyOnboardingScreen'));
  assert.ok(code.includes('!platformAcceptedDocIds'));

  // Link preview call on QR scan
  assert.ok(code.includes('/mobile/link/preview'));

  // Accepted documents passed to claim
  assert.ok(code.includes('acceptedDocumentIds: docIdsToSubmit'));
  assert.ok(code.includes('<ScrollView style={local.noticeBodyBox}'));
  assert.ok(code.includes('notice.effectiveAt'));
});
