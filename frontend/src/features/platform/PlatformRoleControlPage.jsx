import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { RoleFeatureControlCard } from './RoleFeatureControlCard';

export function PlatformRoleControlPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState(params.get('orgId') || '');
  const [disableFeatureTarget, setDisableFeatureTarget] = useState(null);

  const { data: orgsData, isLoading: orgsLoading } = useQuery({
    queryKey: ['organisations'],
    queryFn: () => platformApi.organizations(),
  });

  const organisations = orgsData?.rows || [];

  useEffect(() => {
    if (!selectedOrgId && organisations.length > 0) {
      const firstId = String(organisations[0].id);
      setSelectedOrgId(firstId);
    }
  }, [organisations, selectedOrgId]);

  const handleOrgChange = (nextId) => {
    setSelectedOrgId(nextId);
    if (nextId) setParams({ orgId: nextId });
    else setParams({});
  };

  const { data: featuresData, refetch: refetchFeatures } = useQuery({
    queryKey: ['organization-features', selectedOrgId],
    queryFn: () => platformApi.organizationFeatures(selectedOrgId),
    enabled: !!selectedOrgId,
  });

  const toggleFeatureMutation = useMutation({
    mutationFn: ({ featureCode, enabled }) =>
      platformApi.updateOrganizationFeature(selectedOrgId, featureCode, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-features', selectedOrgId] });
      refetchFeatures();
      toast.add('Feature access updated.', 'success');
      setDisableFeatureTarget(null);
    },
    onError: (err) => toast.add(err.message || 'Could not update feature.', 'error'),
  });

  const features = featuresData?.rows || [];
  const selectedOrg = organisations.find((o) => String(o.id) === String(selectedOrgId));

  return (
    <div className="page">
      <header className="page-header">
        <div className="org-structure-heading">
          <div>
            <h1>Role &amp; Feature Control</h1>
            <p>Configure enabled modules, operational powers, and role permissions per organisation.</p>
          </div>
          {selectedOrgId && (
            <Link className="org-profile-link" to={`/organisations/${selectedOrgId}`}>
              Open {selectedOrg?.code || 'Organisation'} Details
            </Link>
          )}
        </div>
      </header>

      <Card title="Select Organisation">
        {orgsLoading ? (
          <p className="form-note">Loading organisations…</p>
        ) : !organisations.length ? (
          <p className="form-note">No organisations onboarded yet.</p>
        ) : (
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <div className="field">
              <label className="field-label" htmlFor="platform-role-org-select">Organisation</label>
              <select
                id="platform-role-org-select"
                className="input"
                value={selectedOrgId}
                onChange={(e) => handleOrgChange(e.target.value)}
              >
                {organisations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.code}) · {org.status}
                  </option>
                ))}
              </select>
            </div>
            {selectedOrg && (
              <div className="field">
                <span className="field-label">Bank Class &amp; Plan</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '38px' }}>
                  <Badge variant="info">{selectedOrg.bankClassLabel || selectedOrg.bankClass || 'Standard'}</Badge>
                  <Badge variant={selectedOrg.status === 'ACTIVE' ? 'success' : 'default'}>{selectedOrg.status}</Badge>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {selectedOrgId && (
        <>
          <RoleFeatureControlCard organizationId={selectedOrgId} />

          <Card
            title="Module &amp; Feature Access"
            actions={
              <Badge variant="info">
                {features.filter((f) => f.enabled).length} / {features.length} Enabled
              </Badge>
            }
          >
            <p className="form-note" style={{ marginBottom: 'var(--space-4)' }}>
              Enable or disable application modules for this bank. Changes take effect across web and mobile sessions immediately.
            </p>
            <div className="feature-toggle-grid">
              {features.map((feat) => (
                <div
                  key={feat.code}
                  className={`feature-toggle-card ${feat.enabled ? 'enabled' : 'disabled'}`}
                >
                  <div className="feature-toggle-card-header">
                    <h4 className="feature-toggle-title">{feat.name}</h4>
                    <Badge variant={feat.enabled ? 'success' : 'default'} size="sm">
                      {feat.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="feature-toggle-desc">{feat.description}</p>
                  <div className="feature-toggle-card-footer">
                    <Button
                      size="sm"
                      variant={feat.enabled ? 'danger' : 'primary'}
                      className="feature-toggle-btn"
                      loading={
                        toggleFeatureMutation.isPending &&
                        toggleFeatureMutation.variables?.featureCode === feat.code
                      }
                      disabled={toggleFeatureMutation.isPending}
                      onClick={() => {
                        if (feat.enabled) {
                          setDisableFeatureTarget(feat);
                        } else {
                          toggleFeatureMutation.mutate({ featureCode: feat.code, enabled: true });
                        }
                      }}
                    >
                      {feat.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <ConfirmationModal
        open={disableFeatureTarget != null}
        onClose={() => setDisableFeatureTarget(null)}
        onConfirm={() => {
          toggleFeatureMutation.mutate({
            featureCode: disableFeatureTarget.code,
            enabled: false,
          });
        }}
        title="Disable Feature Module"
        itemName={disableFeatureTarget?.name}
        details={{
          'Feature Code': disableFeatureTarget?.code,
          'Organisation': selectedOrg?.name || selectedOrgId,
        }}
        warningMessage={`Disabling "${disableFeatureTarget?.name}" will immediately hide this module and restrict API access for all users in ${selectedOrg?.name || 'this organisation'}.`}
        confirmLabel="Disable Feature"
        confirmVariant="danger"
        loading={toggleFeatureMutation.isPending}
      />
    </div>
  );
}
