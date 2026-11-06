import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { EmployeesPage } from '../employees/EmployeesPage';
import { UsersPage } from '../org/UsersPage';

export function PeoplePage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const canManageAccess = can('ORG_ADMIN', 'HR_ADMIN');
  const view = canManageAccess && params.get('view') === 'access' ? 'access' : 'staff';

  return (
    <div className="page">
      <header className="page-header">
        <h1>People</h1>
        <p>Manage staff records and bank account access</p>
      </header>
      <div className="tabs" role="group" aria-label="People views">
        <button type="button" aria-pressed={view === 'staff'} className={`tab ${view === 'staff' ? 'tab-active' : ''}`} onClick={() => setParams({ view: 'staff' })}>Staff records</button>
        {canManageAccess && <button type="button" aria-pressed={view === 'access'} className={`tab ${view === 'access' ? 'tab-active' : ''}`} onClick={() => setParams({ view: 'access' })}>Account access</button>}
      </div>
      {view === 'staff' ? <EmployeesPage embedded /> : <UsersPage embedded />}
    </div>
  );
}
