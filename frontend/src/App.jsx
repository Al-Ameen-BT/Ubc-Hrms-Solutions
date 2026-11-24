import React from 'react';
import { createHashRouter, RouterProvider, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './auth/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { AppShell } from './components/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { MfaVerifyPage } from './features/auth/MfaVerifyPage';
import { MfaSetupPage } from './features/auth/MfaSetupPage';
import { MfaDisablePage } from './features/auth/MfaDisablePage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { MyAccountPage } from './features/auth/MyAccountPage';
import { PlatformDashboard } from './features/platform/PlatformDashboard';
import { PlatformUsersPage } from './features/platform/PlatformUsersPage';
import { PlatformSettingsPage } from './features/platform/PlatformSettingsPage';
import { BankRulesPage } from './features/platform/BankRulesPage';
import { OrgDashboard } from './features/org/OrgDashboard';
import { BulkImportPage } from './features/employees/BulkImportPage';
import { NewEmployeePage } from './features/employees/NewEmployeePage';
import { EmployeeDetailPage } from './features/employees/EmployeeDetailPage';
import { PayrollPage } from './features/payroll/PayrollPage';
import { NewPayrollRunPage } from './features/payroll/NewPayrollRunPage';
import { PayrollRunPage } from './features/payroll/PayrollRunPage';
import { PeoplePage } from './features/people/PeoplePage';
import { OrganisationsPage } from './features/org/OrganisationsPage';
import { NewOrganisationPage } from './features/org/NewOrganisationPage';
import { OrganisationDetailPage } from './features/org/OrganisationDetailPage';
import { PostsCadresPage } from './features/org/PostsCadresPage';
import { PayScalesPage } from './features/org/PayScalesPage';
import { LeavePage } from './features/org/LeavePage';
import { GovernmentOrdersPage } from './features/org/GovernmentOrdersPage';
import { KsrRulesPage } from './features/org/KsrRulesPage';
import { OrgProfilePage } from './features/org/OrgProfilePage';
import { AllowancesPage } from './features/org/AllowancesPage';
import { DeductionsPage } from './features/org/DeductionsPage';
import { YearEndPage } from './features/org/YearEndPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { ArrearsPage } from './features/org/ArrearsPage';
import { ArrearsCasePage } from './features/org/ArrearsCasePage';
import { DaRevisionPage } from './features/org/DaRevisionPage';
import { PayRevisionsPage } from './features/org/PayRevisionsPage';
import { AuditPage } from './features/org/AuditPage';
import { PayrollSettingsPage } from './features/org/PayrollSettingsPage';
import { MandatoryFieldsPage } from './features/org/MandatoryFieldsPage';
import { SettingsPage } from './features/org/SettingsPage';
import { EmployeePortalPage } from './features/employee/EmployeePortalPage';
import { EmployeeServicesPage } from './features/employee/EmployeeServicesPage';
import { EmployeeServicesAdminPage } from './features/org/EmployeeServicesAdminPage';
import { CatalogueAdoptionPage } from './features/org/CatalogueAdoptionPage';
import { CompensationPage } from './features/employees/CompensationPage';
import { FinancialApprovalsPage } from './features/org/FinancialApprovalsPage';
import { OrganisationStructurePage } from './features/org/OrganisationStructurePage';
import { BranchDashboardPage } from './features/org/BranchDashboardPage';
import { OrganisationExplorerPage } from './features/org/OrganisationExplorerPage';

import { hasServiceAccess } from './api/organizationAccess';
import { RolesPermissionsPage } from './features/org/RolesPermissionsPage';
import { DpdpAcknowledgementPage } from './features/privacy/DpdpAcknowledgementPage';
import { PublicPrivacyPage } from './features/privacy/PublicPrivacyPage';
import { DpdpDocumentsPage } from './features/platform/DpdpDocumentsPage';
import { DpdpCompliancePage } from './features/org/DpdpCompliancePage';

function AppRoutes() {
  const { user, isAuthenticated, loading, isSuperAdmin, canPermission } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg animate-fade-in">Loading…</div>
      </div>
    );
  }

  const mustChangePassword = user?.mustChangePassword;
  const dpdpPending = user?.dpdpPending;

  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? (
          mustChangePassword ? <Navigate to="/change-password" replace /> :
          dpdpPending ? <Navigate to="/dpdp-acknowledgement" replace /> :
          <Navigate to="/" replace />
        ) : <LoginPage />
      } />
      <Route path="/mfa-verify" element={<MfaVerifyPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PublicPrivacyPage />} />

      <Route path="/change-password" element={
        isAuthenticated ? <ChangePasswordPage /> : <Navigate to="/login" replace />
      } />

      <Route path="/dpdp-acknowledgement" element={
        isAuthenticated ? (
          dpdpPending ? <DpdpAcknowledgementPage /> : <Navigate to="/" replace />
        ) : <Navigate to="/login" replace />
      } />

      {/* Routes outside the shell (full-page) */}
      <Route path="/account/mfa/setup" element={isAuthenticated ? <MfaSetupPage /> : <Navigate to="/login" replace />} />
      <Route path="/account/mfa/disable" element={isAuthenticated ? <MfaDisablePage /> : <Navigate to="/login" replace />} />

      <Route path="/" element={
        isAuthenticated ? (
          mustChangePassword ? <Navigate to="/change-password" replace /> :
          dpdpPending ? <Navigate to="/dpdp-acknowledgement" replace /> :
          <AppShell />
        ) : <Navigate to="/login" replace />
      }>
        <Route index element={<HomeRoute />} />
        <Route path="organisations" element={<OrganisationsPage />} />
        <Route path="organisations/new" element={<NewOrganisationPage />} />
        <Route path="organisations/:id" element={<OrganisationDetailPage />} />
        <Route path="platform-users" element={<PlatformUsersPage />} />
        <Route path="platform-settings" element={<PlatformSettingsPage />} />
        <Route path="bank-rules" element={isSuperAdmin ? <BankRulesPage /> : <Navigate to="/" replace />} />
        <Route path="bank-rules/:id" element={isSuperAdmin ? <BankRulesPage /> : <Navigate to="/" replace />} />

        <Route path="roles-permissions" element={<RolesPermissionsPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="employees" element={<Navigate to="/people" replace />} />
        <Route path="employees/new" element={<NewEmployeePage />} />
        <Route path="employees/import" element={<BulkImportPage />} />
        <Route path="employees/:id" element={<EmployeeDetailPage />} />
        <Route path="employees/:id/compensation" element={<CompensationPage />} />
        <Route path="users" element={<Navigate to="/people?view=access" replace />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="payroll/new" element={<NewPayrollRunPage />} />
        <Route path="payroll/:id" element={<PayrollRunPage />} />

        <Route path="posts" element={<PostsCadresPage />} />
        <Route path="pay-scales" element={<PayScalesPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="allowances" element={<AllowancesPage />} />
        <Route path="deductions" element={<DeductionsPage />} />
        <Route path="arrears" element={<ArrearsPage />} />
        <Route path="arrears-cases/:id" element={<ArrearsCasePage />} />
        <Route path="da-revisions/:id" element={<DaRevisionPage />} />
        <Route path="pay-revisions" element={<PayRevisionsPage />} />
        <Route path="year-end" element={<YearEndPage />} />
        <Route path="reports" element={<ReportsPage />} />

        <Route path="government-orders" element={<GovernmentOrdersPage />} />
        <Route path="ksr-rules" element={<KsrRulesPage />} />

        <Route path="org-profile" element={<OrgProfilePage />} />
        <Route path="organisation-structure" element={<OrganisationStructurePage />} />
        <Route path="organisation-explorer" element={<OrganisationExplorerPage />} />
        <Route path="branches/:branchId" element={<BranchDashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="payroll-settings" element={<PayrollSettingsPage />} />
        <Route path="catalogue-adoption" element={<CatalogueAdoptionPage />} />
        <Route path="financial-changes" element={<FinancialApprovalsPage />} />
        <Route path="mandatory-fields" element={<MandatoryFieldsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="dpdp-documents" element={isSuperAdmin ? <DpdpDocumentsPage /> : <Navigate to="/" replace />} />
        <Route path="dpdp-compliance" element={<DpdpCompliancePage />} />
        <Route path="account" element={<MyAccountPage />} />
        <Route path="my/:section" element={<EmployeeServicesPage />} />
        <Route path="employee-services/:section" element={<EmployeeServicesAdminPage />} />
        <Route path="employee-services" element={<Navigate to={hasServiceAccess('expenses', canPermission) ? '/employee-services/expenses' : hasServiceAccess('time', canPermission) ? '/employee-services/time' : hasServiceAccess('holidays', canPermission) ? '/employee-services/holidays' : '/employee-services/policy'} replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function HomeRoute() {
  const { isSuperAdmin, canPermission } = useAuth();
  if (isSuperAdmin) return <PlatformDashboard />;
  if (canPermission('hr.view', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'])) return <OrgDashboard />;
  if (canPermission('self.profile')) return <EmployeePortalPage />;
  return <div className="page"><h1>Your workspace</h1><p>Use the navigation to open the functions granted by your current assignments.</p></div>;
}

const router = createHashRouter([{ path: '*', element: <AppRoutes /> }]);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
