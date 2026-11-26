import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

export const MODULE_GROUPS = [
  {
    key: 'leave_attendance',
    label: 'Leave, Attendance & Shifts',
    modules: ['leave', 'attendance', 'geofence'],
  },
  {
    key: 'people_hr',
    label: 'Staff Records, HR & Chart',
    modules: ['people', 'hr', 'documents', 'chart'],
  },
  {
    key: 'payroll_finance',
    label: 'Payroll, Arrears & Payments',
    modules: ['payroll', 'arrears', 'compensation', 'financialChanges', 'expenses', 'payments', 'advances', 'yearend'],
  },
  {
    key: 'structure_branches',
    label: 'Structure, Branches & Staffing',
    modules: ['structure', 'branches', 'departments', 'positions', 'assignments', 'transfers'],
  },
  {
    key: 'compliance_audit',
    label: 'Compliance, Audit & DPDP',
    modules: ['dpdp', 'dpdp.sensitive', 'audit'],
  },
  {
    key: 'admin_security',
    label: 'Administration & System Settings',
    modules: ['settings', 'roles', 'users'],
  },
  {
    key: 'self_service',
    label: 'Employee Self-Service Access',
    modules: ['self'],
  },
];

/**
 * Shared Platform Provider control card for configuring enabled features,
 * operational powers, and module access for each role within a tenant organisation.
 */
export function RoleFeatureControlCard({ organizationId }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [rolePermsDraft, setRolePermsDraft] = useState(null);

  const { data: rolesData, isLoading: rolesLoading, refetch: refetchRoles } = useQuery({
    queryKey: ['organization-roles', organizationId],
    queryFn: () => platformApi.organizationRoles(organizationId),
    enabled: !!organizationId,
  });

  const { data: catalogueData, isLoading: catalogueLoading } = useQuery({
    queryKey: ['permission-catalogue'],
    queryFn: () => platformApi.permissionCatalogue(),
  });

  const updateRolePermissionsMutation = useMutation({
    mutationFn: ({ roleId, permissionCodes }) =>
      platformApi.updateOrgRolePermissions(organizationId, roleId, permissionCodes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-roles', organizationId] });
      refetchRoles();
      toast.add('Role permissions and feature access updated for this organisation.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Could not update role permissions.', 'error'),
  });

  const roles = useMemo(() => {
    return Array.isArray(rolesData) ? rolesData : (rolesData?.data || []);
  }, [rolesData]);

  const catalogue = useMemo(() => {
    return catalogueData?.permissions ? catalogueData : (catalogueData?.data || {});
  }, [catalogueData]);

  const allPermissions = catalogue?.permissions || [];
  const templates = catalogue?.templates || [];

  const selectedRole = useMemo(() => {
    if (!roles.length) return null;
    return roles.find((r) => r.id === selectedRoleId) || roles[0];
  }, [roles, selectedRoleId]);

  useEffect(() => {
    setSelectedRoleId(null);
    setRolePermsDraft(null);
  }, [organizationId]);

  useEffect(() => {
    if (selectedRole && (!selectedRoleId || !roles.some((r) => r.id === selectedRoleId))) {
      setSelectedRoleId(selectedRole.id);
    }
  }, [selectedRole, selectedRoleId, roles]);

  useEffect(() => {
    if (selectedRole) {
      setRolePermsDraft([...(selectedRole.permissionCodes || [])]);
    }
  }, [selectedRole?.id, selectedRole?.permissionCodes]);

  const hasPermChanges = useMemo(() => {
    if (!selectedRole || !rolePermsDraft) return false;
    const current = new Set(selectedRole.permissionCodes || []);
    const draft = new Set(rolePermsDraft);
    if (current.size !== draft.size) return true;
    for (const code of current) {
      if (!draft.has(code)) return true;
    }
    return false;
  }, [selectedRole, rolePermsDraft]);

  const togglePermission = (code) => {
    if (!rolePermsDraft) return;
    if (rolePermsDraft.includes(code)) {
      setRolePermsDraft(rolePermsDraft.filter((c) => c !== code));
    } else {
      setRolePermsDraft([...rolePermsDraft, code]);
    }
  };

  const toggleModulePermissions = (modulePerms, enable) => {
    if (!rolePermsDraft) return;
    const moduleCodes = modulePerms.map((p) => p.code);
    if (enable) {
      setRolePermsDraft([...new Set([...rolePermsDraft, ...moduleCodes])]);
    } else {
      const set = new Set(moduleCodes);
      setRolePermsDraft(rolePermsDraft.filter((c) => !set.has(c)));
    }
  };

  const handleResetTemplate = () => {
    if (!selectedRole) return;
    const tpl = templates.find((t) => t.code === (selectedRole.templateCode || selectedRole.code));
    if (tpl) {
      setRolePermsDraft([...tpl.permissionCodes]);
      toast.add(`Reset to ${tpl.name} template defaults.`, 'info');
    } else {
      toast.add('No matching template found for this role.', 'warning');
    }
  };

  return (
    <Card
      title="Role Feature &amp; Permission Access (Platform Control)"
      actions={
        selectedRole && (
          <Badge variant="info">
            {rolePermsDraft?.length || 0} / {allPermissions.length} Enabled for {selectedRole.name}
          </Badge>
        )
      }
    >
      <p className="form-note" style={{ marginBottom: 'var(--space-4)' }}>
        Configure enabled features, operational powers, and module access for each role in this organisation.
        Changes take effect across web and mobile sessions for this tenant immediately upon saving.
      </p>

      {(rolesLoading || catalogueLoading) ? (
        <p className="form-note">Loading role feature matrix…</p>
      ) : !roles.length ? (
        <p className="form-note">No roles found for this organisation.</p>
      ) : (
        <div className="role-feature-manager">
          <div className="role-pill-tabs" role="tablist" aria-label="Organisation Roles">
            {roles.map((r) => {
              const isCurrent = r.id === selectedRole?.id;
              const count = isCurrent ? (rolePermsDraft?.length ?? r.permissionCodes?.length ?? 0) : (r.permissionCodes?.length ?? 0);
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={isCurrent}
                  className={`role-pill-tab ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedRoleId(r.id);
                    setRolePermsDraft([...(r.permissionCodes || [])]);
                  }}
                >
                  <span>{r.name}</span>
                  <span className="role-pill-badge">{count}</span>
                </button>
              );
            })}
          </div>

          {selectedRole && (
            <>
              <div className="role-header-banner">
                <div className="role-header-info">
                  <h3>
                    <span>{selectedRole.name}</span>
                    <Badge variant={selectedRole.isProtected ? 'default' : 'info'} size="sm">
                      {selectedRole.code}
                    </Badge>
                    {hasPermChanges && <Badge variant="warning" size="sm">Unsaved Changes</Badge>}
                  </h3>
                  <p>
                    {templates.find((t) => t.code === (selectedRole.templateCode || selectedRole.code))?.description ||
                      'Tenant operational role with customisable permission catalogue ceilings.'}
                  </p>
                </div>
                <div className="role-header-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleResetTemplate}
                    disabled={updateRolePermissionsMutation.isPending}
                  >
                    Reset Template Defaults
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={updateRolePermissionsMutation.isPending}
                    disabled={!hasPermChanges || updateRolePermissionsMutation.isPending}
                    onClick={() => {
                      updateRolePermissionsMutation.mutate({
                        roleId: selectedRole.id,
                        permissionCodes: rolePermsDraft || [],
                      });
                    }}
                  >
                    Save Role Permissions
                  </Button>
                </div>
              </div>

              <div className="role-perm-groups">
                {MODULE_GROUPS.map((group) => {
                  const groupPerms = allPermissions.filter((p) => group.modules.includes(p.module));
                  if (!groupPerms.length) return null;
                  const activeInGroup = groupPerms.filter((p) => rolePermsDraft?.includes(p.code)).length;
                  const allActive = activeInGroup === groupPerms.length;

                  return (
                    <div key={group.key} className="role-perm-group-card">
                      <div className="role-perm-group-header">
                        <h4>{group.label}</h4>
                        <div className="role-perm-group-header-actions">
                          <Badge variant={activeInGroup > 0 ? 'success' : 'default'} size="sm">
                            {activeInGroup} / {groupPerms.length}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            style={{ padding: '2px 6px', height: '24px', fontSize: '11px' }}
                            onClick={() => toggleModulePermissions(groupPerms, !allActive)}
                          >
                            {allActive ? 'Clear' : 'Select All'}
                          </Button>
                        </div>
                      </div>
                      <div className="role-perm-items-list">
                        {groupPerms.map((perm) => {
                          const isChecked = rolePermsDraft?.includes(perm.code) || false;
                          return (
                            <label key={perm.code} className="role-perm-item">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(perm.code)}
                              />
                              <div className="role-perm-item-details">
                                <div className="role-perm-item-code">
                                  <span>{perm.code}</span>
                                  {perm.risk && (
                                    <span className={`role-perm-item-risk risk-${perm.risk}`}>
                                      {perm.risk}
                                    </span>
                                  )}
                                </div>
                                <span className="role-perm-item-action">
                                  Action: <strong>{perm.action}</strong>
                                  {perm.allowedScopes?.length ? ` (${perm.allowedScopes.join(', ')})` : ''}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
