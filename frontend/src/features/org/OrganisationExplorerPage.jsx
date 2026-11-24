import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orgApi } from '../../api/client';
import { organizationAccessApi } from '../../api/organizationAccess';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { DashboardError, DashboardSkeleton } from '../dashboard/DashboardPrimitives';
import { OrganisationExplorer } from '../dashboard/OrganisationExplorer';
import '../dashboard/Dashboard.css';

export function OrganisationExplorerPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('tree');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);
  const [expandedPositionId, setExpandedPositionId] = useState(null);
  const summaryQuery = useQuery({ queryKey: ['org-command-centre', 'explorer-summary'], queryFn: () => orgApi.dashboardAnalytics({}) });
  const organisationQuery = useQuery({ queryKey: ['org-explorer', 'organization'], queryFn: () => organizationAccessApi.chart(undefined, { level: 'organization' }) });
  const departmentQuery = useQuery({ queryKey: ['org-explorer', 'departments', selectedBranchId], queryFn: () => organizationAccessApi.chart(undefined, { branchId: selectedBranchId, level: 'department' }), enabled: !!selectedBranchId });
  const positionQuery = useQuery({ queryKey: ['org-explorer', 'positions', selectedBranchId, selectedDepartmentId], queryFn: () => organizationAccessApi.chart(undefined, { branchId: selectedBranchId, departmentId: selectedDepartmentId, level: 'position' }), enabled: !!selectedDepartmentId });
  const employeeQuery = useQuery({ queryKey: ['org-explorer', 'employees', selectedBranchId, selectedDepartmentId, expandedPositionId], queryFn: () => organizationAccessApi.chart(undefined, { branchId: selectedBranchId, departmentId: selectedDepartmentId, level: 'employee' }), enabled: !!expandedPositionId });
  const loading = summaryQuery.isLoading || organisationQuery.isLoading;
  const error = summaryQuery.error || organisationQuery.error || departmentQuery.error || positionQuery.error || employeeQuery.error;
  const summary = summaryQuery.data?.commandCentre?.explorer || {};
  const chart = { branches: organisationQuery.data?.branches || [], departments: departmentQuery.data?.departments || [], positions: positionQuery.data?.positions || [], employees: employeeQuery.data?.employees || [] };
  const select = (node) => {
    setSelectedNode(node);
    if (node.type === 'branch') { setSelectedBranchId(node.id); setSelectedDepartmentId(null); setExpandedPositionId(null); }
    if (node.type === 'department') { setSelectedDepartmentId(node.id); setExpandedPositionId(null); }
  };
  if (loading && !summaryQuery.data) return <DashboardSkeleton />;
  return <div className="page dashboard-page command-centre-page"><Breadcrumbs items={[{ label: 'Organisation', to: '/' }, { label: 'Organisation Explorer' }]} /><header className="command-page-header"><div><span className="command-eyebrow">Organisation Explorer</span><h1>Workforce Map</h1><p>Explore current reporting structure and operational branch context without exposing sensitive employee data.</p></div></header>{error ? <DashboardError message="The Organisation Explorer could not be loaded. Check your access or retry the selected level." onRetry={() => { summaryQuery.refetch(); organisationQuery.refetch(); }} /> : null}<OrganisationExplorer summary={summary} mode={mode} onModeChange={setMode} selectedNode={selectedNode} onSelect={select} onNavigate={navigate} chart={chart} selectedBranchId={selectedBranchId} selectedDepartmentId={selectedDepartmentId} expandedPositionId={expandedPositionId} onExpandPosition={setExpandedPositionId} /></div>;
}

export default OrganisationExplorerPage;
