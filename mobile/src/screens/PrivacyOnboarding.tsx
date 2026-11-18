import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Api } from '../api';
import { Action, Card, colors, ErrorText, Loading, Page, radius, ScreenHeading, styles } from '../ui';

export type PublicDpdpDoc = {
  id: number;
  type: string;
  title: string;
  body: string;
  version: string;
  effectiveAt: string;
};

export type PublicDpdpBundle = {
  terms: PublicDpdpDoc | null;
  platformPrivacy: PublicDpdpDoc | null;
};

export function PrivacyOnboardingScreen({
  api,
  onAccepted,
}: {
  api: Api;
  onAccepted: (acceptedDocIds: number[]) => void;
}) {
  const [bundle, setBundle] = useState<PublicDpdpBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 3 explicit, unselected affirmative checkboxes
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [ageAffirmed, setAgeAffirmed] = useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<PublicDpdpBundle>('/public/dpdp')
      .then(res => {
        if (!active) return;
        setBundle(res);
        setError('');
      })
      .catch(err => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not load legal documents.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api]);

  const canContinue = termsAgreed && privacyAgreed && ageAffirmed && bundle?.terms?.id && bundle?.platformPrivacy?.id;

  const handleContinue = () => {
    if (!canContinue || !bundle?.terms?.id || !bundle?.platformPrivacy?.id) return;
    onAccepted([bundle.terms.id, bundle.platformPrivacy.id]);
  };

  if (loading) {
    return (
      <Page>
        <ScreenHeading
          eyebrow="Privacy & Terms"
          title="Digital Personal Data Protection"
          description="Loading terms and privacy governance documents…"
        />
        <Loading rows={4} />
      </Page>
    );
  }

  return (
    <Page>
      <View style={local.brandRow}>
        <View style={local.brandMark}>
          <Text style={local.brandMarkText}>§</Text>
        </View>
        <View>
          <Text style={local.brand}>DATA PRIVACY</Text>
          <Text style={styles.muted}>DPDP Act, 2023 Compliance</Text>
        </View>
      </View>

      <ScreenHeading
        eyebrow="Step 1 of 2: Legal Affirmations"
        title="Privacy & terms of service"
        description="Please review our terms of use, privacy policy, and confirm your age eligibility before connecting your mobile device."
      />

      <ErrorText message={error} />

      {bundle?.terms && (
        <Card title={`${bundle.terms.title} (v${bundle.terms.version})`}>
          <Text style={styles.muted}>Effective from: {bundle.terms.effectiveAt}</Text>
          <ScrollView style={local.documentBodyBox} nestedScrollEnabled>
            <Text style={styles.body}>{bundle.terms.body}</Text>
          </ScrollView>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I have read and agree to the Terms of Service"
            accessibilityState={{ checked: termsAgreed }}
            onPress={() => setTermsAgreed(!termsAgreed)}
            style={[local.checkRow, termsAgreed && local.checkRowSelected]}
          >
            <Text style={[local.checkMark, termsAgreed && local.checkMarkSelected]}>
              {termsAgreed ? '✓' : ''}
            </Text>
            <Text style={[styles.body, { flex: 1, fontWeight: termsAgreed ? '700' : '400' }]}>
              I have read and agree to the Platform Terms of Service.
            </Text>
          </Pressable>
        </Card>
      )}

      {bundle?.platformPrivacy && (
        <Card title={`${bundle.platformPrivacy.title} (v${bundle.platformPrivacy.version})`}>
          <Text style={styles.muted}>Effective from: {bundle.platformPrivacy.effectiveAt}</Text>
          <ScrollView style={local.documentBodyBox} nestedScrollEnabled>
            <Text style={styles.body}>{bundle.platformPrivacy.body}</Text>
          </ScrollView>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I have read and agree to the Privacy Policy"
            accessibilityState={{ checked: privacyAgreed }}
            onPress={() => setPrivacyAgreed(!privacyAgreed)}
            style={[local.checkRow, privacyAgreed && local.checkRowSelected]}
          >
            <Text style={[local.checkMark, privacyAgreed && local.checkMarkSelected]}>
              {privacyAgreed ? '✓' : ''}
            </Text>
            <Text style={[styles.body, { flex: 1, fontWeight: privacyAgreed ? '700' : '400' }]}>
              I understand how my personal data is processed under the DPDP Act.
            </Text>
          </Pressable>
        </Card>
      )}

      <Card title="Age Eligibility Affirmation">
        <Text style={styles.body}>
          Under the Digital Personal Data Protection Act, 2023, access to employee mobile banking and workforce services is restricted to individuals of 18 years of age or older.
        </Text>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="I confirm that I am 18 years of age or older"
          accessibilityState={{ checked: ageAffirmed }}
          onPress={() => setAgeAffirmed(!ageAffirmed)}
          style={[local.checkRow, ageAffirmed && local.checkRowSelected]}
        >
          <Text style={[local.checkMark, ageAffirmed && local.checkMarkSelected]}>
            {ageAffirmed ? '✓' : ''}
          </Text>
          <Text style={[styles.body, { flex: 1, fontWeight: ageAffirmed ? '700' : '400' }]}>
            I affirm that I am 18 years of age or older.
          </Text>
        </Pressable>
      </Card>

      <Action
        title="Continue to scan portal QR code"
        disabled={!canContinue}
        onPress={handleContinue}
      />
    </Page>
  );
}

const local = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 22, fontWeight: '900' },
  brand: { color: colors.ink, fontSize: 15, fontWeight: '900', letterSpacing: 0.8 },
  documentBodyBox: {
    maxHeight: 140,
    backgroundColor: colors.pale,
    borderRadius: radius.sm,
    padding: 12,
    marginVertical: 6,
  },
  checkRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginTop: 6,
    backgroundColor: colors.white,
  },
  checkRowSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.pale,
  },
  checkMark: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.muted,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 24,
    color: colors.blue,
    fontWeight: '900',
    backgroundColor: colors.white,
  },
  checkMarkSelected: {
    borderColor: colors.blue,
  },
});
