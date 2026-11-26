import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orgApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { DashboardError, DashboardSkeleton } from '../dashboard/DashboardPrimitives';
import { DashboardFilterBar } from '../dashboard/DashboardFilterBar';
import { DashboardDonuts } from '../dashboard/DashboardDonuts';
import { DashboardKPIs } from '../dashboard/DashboardKPIs';
import { BranchHealth } from '../dashboard/BranchHealth';
import { OperationalSummary } from '../dashboard/OperationalSummary';
import { OrganisationExplorer } from '../dashboard/OrganisationExplorer';
import { clearCommandCentreFilters, commandCentreParams, updateCommandCentreFilter } from '../dashboard/dashboardModel';
import '../dashboard/Dashboard.css';

function indiaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T12:00:00+05:30`));
}

function currentTime(value) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(value);
}

export function OrgDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [now, setNow] = useState(new Date());

  const defaultDate = indiaDate();
  const urlFilters = useMemo(() => commandCentreParams(searchParams), [searchParams]);
  const filters = { date: defaultDate, period: '7d', ...urlFilters };
  const deferredSearch = useDeferredValue(filters.search || '');
  const params = { ...filters, search: deferredSearch };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dashboardQuery = useQuery({
    queryKey: ['org-command-centre', params],
    queryFn: () => orgApi.dashboardAnalytics(params),
    refetchInterval: 30000,
  });
  const response = dashboardQuery.data;
  const data = response?.commandCentre;
  const updateFilter = (key, value) => setSearchParams(updateCommandCentreFilter(searchParams, key, value), { replace: key === 'search' });
  const clearFilters = () => setSearchParams(clearCommandCentreFilters(searchParams));

  if (dashboardQuery.isLoading && !data) return <DashboardSkeleton />;

  return (
    <div className="page dashboard-page command-centre-page">
      <header className="command-page-header">
        <div>
          <h1>Overview</h1>
          <p>Your daily command centre for workforce, attendance, payroll and compliance priorities.</p>
        </div>
        <div className="command-header-context">
          <div aria-label={`Today ${displayDate(filters.date)}, current time ${currentTime(now)}`}>
            <strong>Today: {displayDate(filters.date)}</strong>
            <span>Current time: {currentTime(now)}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={clearFilters} title="Reset all applied dashboard filters">
            Reset View
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/account')}>
            {user?.name || 'My profile'}
          </Button>
        </div>
      </header>

      <DashboardFilterBar
        filters={filters}
        appliedFilters={urlFilters}
        defaultDate={defaultDate}
        options={data?.filterOptions || response?.filterOptions}
        onFilter={updateFilter}
        onClear={clearFilters}
      />

      {dashboardQuery.isError ? (
        <DashboardError
          message="The HR command centre could not be loaded. Check your connection and try again."
          onRetry={() => dashboardQuery.refetch()}
        />
      ) : null}

      {!data && !dashboardQuery.isError ? (
        <div className="command-surface command-empty">
          <strong>Command-centre data is unavailable</strong>
          <span>Refresh the page or contact your HRMS administrator.</span>
        </div>
      ) : null}

      {data ? (
        <>
          {/* Top Donut & Pie Charts */}
          <DashboardDonuts
            data={data}
            onNavigate={navigate}
            onFilter={updateFilter}
          />

          {/* Interactive KPI Action Metrics */}
          <DashboardKPIs
            overview={data.overview}
            onNavigate={navigate}
            onScrollToSection={() => {
              const el = document.getElementById('branch-health-title');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              else navigate('/organisation-explorer');
            }}
          />

          {/* Organisation Explorer */}
          <OrganisationExplorer
            summary={data.explorer}
            mode="branch"
            compact
            onSelect={(node) => navigate(`/branches/${node.branchId || node.id}`)}
            onNavigate={navigate}
          />

          {/* Branch Operational Health Table */}
          <BranchHealth
            data={data.branchHealth}
            onNavigate={navigate}
          />

          {/* Movement & Setup Summaries */}
          <OperationalSummary
            data={data}
            onNavigate={navigate}
          />
        </>
      ) : null}
    </div>
  );
}

export default OrgDashboard;
