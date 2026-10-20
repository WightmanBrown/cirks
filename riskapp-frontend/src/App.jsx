// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// riskapp-frontend/src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }      from './context/AuthContext';
import { HelpProvider }      from './context/HelpContext';
import { ProtectedRoute }    from './components/ProtectedRoute';
import { LoginPage }         from './pages/LoginPage';
import { PendingRisksPage }  from './pages/PendingRisksPage';
import { ActionsPage }         from './pages/ActionsPage';
import { ActionRollUpPage }    from './pages/ActionRollUpPage';
import { ActionDetailPage }   from './pages/ActionDetailPage';
import { SiroCyclesPage }       from './pages/SiroCyclesPage';
import { SiroCycleSummaryPage } from './pages/SiroCycleSummaryPage';
import { UnauthorizedPage }  from './pages/UnauthorizedPage';
import { DashboardPage }     from './pages/DashboardPage';
import { RiskSummaryPage }      from './pages/RiskSummaryPage';
import { RoleHomeRedirect }     from './components/RoleHomeRedirect';
import { SelectRolePage }       from './pages/SelectRolePage';
import { ControlLibraryPage }          from './pages/ControlLibraryPage';
import { ControlDetailPage }           from './pages/ControlDetailPage';
import { BusinessServicesPage }        from './pages/BusinessServicesPage';
import { BusinessServiceDetailPage }   from './pages/BusinessServiceDetailPage';
import { DepartmentSetupWizard }       from './pages/DepartmentSetupWizard';
import { ImpactTablesPage }            from './pages/ImpactTablesPage';
import { InformationAssetsPage }       from './pages/InformationAssetsPage';
import { InformationAssetDetailPage }  from './pages/InformationAssetDetailPage';
import { SystemsPage }                 from './pages/SystemsPage';
import { SystemDetailPage }            from './pages/SystemDetailPage';
import { SecuritySolutionWizard }      from './pages/SecuritySolutionWizard';
import { SystemCreateWizard }          from './pages/SystemCreateWizard';
import { DepartmentsPage }             from './pages/DepartmentsPage';
import { DepartmentDetailPage }        from './pages/DepartmentDetailPage';
import { RiskDetailPage }              from './pages/RiskDetailPage';
import { PeopleGroupsPage }            from './pages/PeopleGroupsPage';
import { ProcessesPage }               from './pages/ProcessesPage';
import { TechnologyComponentsPage }    from './pages/TechnologyComponentsPage';
import { FacilitiesPage }              from './pages/FacilitiesPage';
import { ComponentDetailPage }         from './pages/ComponentDetailPage';
import { ThreatsPage }                 from './pages/ThreatsPage';
import { ThreatDetailPage }            from './pages/ThreatDetailPage';
import { KnowledgeSearchPage }         from './pages/KnowledgeSearchPage';
import { GraphExplorerPage }           from './pages/GraphExplorerPage';
import { StatementOfApplicabilityPage } from './pages/StatementOfApplicabilityPage';
import { ScopesPage } from './pages/ScopesPage';
import { ScopeDetailPage } from './pages/ScopeDetailPage';
import { ControlSetsSetupPage }         from './pages/ControlSetsSetupPage';
import { ImpactTableDetailPage }       from './pages/ImpactTableDetailPage';
import { AcceptanceQueuePage }         from './pages/AcceptanceQueuePage';
import { SecurityExceptionsPage }      from './pages/SecurityExceptionsPage';
import { FindingsPage }                from './pages/FindingsPage';
import { PoliciesDocumentsPage }       from './pages/PoliciesDocumentsPage';
import { SuppliersPage }               from './pages/SuppliersPage';
import { SupplierDetailPage }          from './pages/SupplierDetailPage';
import { SupplierControlSetsPage }     from './pages/SupplierControlSetsPage';
import { SecuritySolutionsPage }       from './pages/SecuritySolutionsPage';
import { SecuritySolutionDetailPage }  from './pages/SecuritySolutionDetailPage';
import { ArchitectureTemplatePage, SecurityPatternTriggersPage, ArchitecturePatternsPage } from './pages/ArchitecturePages';
import { MeetingsListPage }            from './pages/MeetingsListPage';
import { MeetingDetailPage }           from './pages/MeetingDetailPage';
import { PlanMeetingPage }             from './pages/PlanMeetingPage';
import { RunMeetingPage }              from './pages/RunMeetingPage';
import { PublishedMinutesPage }        from './pages/PublishedMinutesPage';
import { PackPage }                    from './pages/PackPage';
import { AdminRbacPage }               from './pages/AdminRbacPage';
import { AccountManagementPage }       from './pages/AccountManagementPage';
import { DataExportPage }              from './pages/DataExportPage';
import { AuditLogPage }                from './pages/AuditLogPage';
import { HelpContentPage }             from './pages/HelpContentPage';
import { ApiKeysPage }                 from './pages/ApiKeysPage';
import { MetricsPage }                 from './pages/MetricsPage';

export default function App() {
  return (
    <AuthProvider>
      <HelpProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Role selection — authenticated, no role restriction */}
          <Route element={<ProtectedRoute />}>
            <Route path="/select-role"   element={<SelectRolePage />} />
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/risks/current" element={<RiskSummaryPage view="current" />} />
            <Route path="/risks/future"  element={<RiskSummaryPage view="future" />} />
            <Route path="/risks/:id"     element={<RiskDetailPage />} />
            <Route path="/controls"        element={<ControlLibraryPage />} />
            <Route path="/controls/:id"  element={<ControlDetailPage />} />
            <Route path="/scopes"          element={<ScopesPage />} />
            <Route path="/scopes/:id"      element={<ScopeDetailPage />} />
            <Route path="/soa"             element={<StatementOfApplicabilityPage framework="all" />} />
            <Route path="/soa/:framework"  element={<StatementOfApplicabilityPage />} />
            <Route path="/setup/control-sets" element={<ControlSetsSetupPage />} />
            <Route path="/services"           element={<BusinessServicesPage />} />
            <Route path="/services/:id"       element={<BusinessServiceDetailPage />} />
            <Route path="/wizard/department"   element={<DepartmentSetupWizard />} />
            <Route path="/wizard/impact-table" element={<Navigate to="/impact-tables" replace />} />
            <Route path="/impact-tables"       element={<ImpactTablesPage />} />
            <Route path="/impact-tables/:id"   element={<ImpactTableDetailPage />} />
            <Route path="/assets"              element={<InformationAssetsPage />} />
            <Route path="/assets/new"          element={<InformationAssetDetailPage />} />
            <Route path="/assets/:id"          element={<InformationAssetDetailPage />} />
            <Route path="/systems"             element={<SystemsPage />} />
            <Route path="/systems/new"         element={<SystemCreateWizard />} />
            <Route path="/systems/:id"         element={<SystemDetailPage />} />
            <Route path="/departments"         element={<DepartmentsPage />} />
            <Route path="/departments/:id"     element={<DepartmentDetailPage />} />
            <Route path="/people-groups"       element={<PeopleGroupsPage />} />
            <Route path="/processes"           element={<ProcessesPage />} />
            <Route path="/technology"          element={<TechnologyComponentsPage />} />
            <Route path="/facilities"          element={<FacilitiesPage />} />
            <Route path="/policies-documents"  element={<PoliciesDocumentsPage />} />
            <Route path="/security-solutions"  element={<SecuritySolutionsPage />} />
            <Route path="/security-solutions/new" element={<SecuritySolutionWizard />} />
            <Route path="/security-solutions/:id" element={<SecuritySolutionDetailPage />} />
            <Route path="/architecture-template"     element={<ArchitectureTemplatePage />} />
            <Route path="/security-pattern-triggers" element={<SecurityPatternTriggersPage />} />
            <Route path="/architecture-patterns"     element={<ArchitecturePatternsPage />} />
            <Route path="/security-architecture"     element={<Navigate to="/architecture-template" replace />} />
            <Route path="/suppliers"           element={<SuppliersPage />} />
            <Route path="/suppliers/control-sets" element={<SupplierControlSetsPage />} />
            <Route path="/suppliers/:id"       element={<SupplierDetailPage />} />
            <Route path="/components/:id"      element={<ComponentDetailPage />} />
            <Route path="/threats"             element={<ThreatsPage />} />
            <Route path="/threats/:id"         element={<ThreatDetailPage />} />
            {/* Issued SWG minutes — readable by every authenticated console user */}
            <Route path="/swg/minutes/:id"     element={<PublishedMinutesPage />} />
          </Route>

          {/* CISO governance queues */}
          <Route element={<ProtectedRoute capability="governance.review" />}>
            <Route path="/risks/pending" element={<PendingRisksPage />} />
          </Route>

          {/* Security actions — list + detail, open to the RACI "informed" audience
              (anyone with actions.read; rows/detail are dept-scoped server-side). */}
          <Route element={<ProtectedRoute capability="actions.read" />}>
            <Route path="/actions"       element={<ActionsPage />} />
            <Route path="/remediation"   element={<ActionRollUpPage />} />
            <Route path="/actions/:id"   element={<ActionDetailPage />} />
          </Route>

          {/* Acceptance queue (was /adoption-queue; the verification queue is
              retired — completion is per-item, on the risk) */}
          <Route element={<ProtectedRoute capability="actions.adopt_queue" />}>
            <Route path="/acceptance-queue" element={<AcceptanceQueuePage />} />
          </Route>
          <Route path="/adoption-queue" element={<Navigate to="/acceptance-queue" replace />} />
          <Route path="/verification"    element={<Navigate to="/remediation" replace />} />

          {/* Assurance findings — derived; the SWG agenda's assurance lines link here.
              findings.read is the exceptions.read audience (v135). */}
          <Route element={<ProtectedRoute capability="findings.read" />}>
            <Route path="/findings" element={<FindingsPage />} />
          </Route>

          {/* Security exceptions */}
          <Route element={<ProtectedRoute capability="exceptions.read" />}>
            <Route path="/exceptions" element={<SecurityExceptionsPage />} />
          </Route>

          {/* Knowledge lookup — SOC enrichment (IP/hostname → system risk/impact) */}
          <Route element={<ProtectedRoute capability="knowledge.query" />}>
            <Route path="/knowledge" element={<KnowledgeSearchPage />} />
            <Route path="/knowledge/graph/:type/:id" element={<GraphExplorerPage />} />
          </Route>

          {/* Meeting pack */}
          <Route element={<ProtectedRoute capability="meetings.read_pack" />}>
            <Route path="/meetings/:id/pack" element={<PackPage />} />
          </Route>

          {/* Meetings */}
          <Route element={<ProtectedRoute capability="meetings.read" />}>
            <Route path="/meetings"          element={<MeetingsListPage />} />
            <Route path="/meetings/:id"      element={<MeetingDetailPage />} />
            <Route path="/meetings/:id/run"  element={<RunMeetingPage />} />
          </Route>
          <Route element={<ProtectedRoute capability="meetings.write" />}>
            <Route path="/meetings/plan"  element={<PlanMeetingPage />} />
          </Route>

          {/* SIRO review */}
          <Route element={<ProtectedRoute capability="siro.review" />}>
            <Route path="/siro/cycles"     element={<SiroCyclesPage />} />
            <Route path="/siro/cycles/:id" element={<SiroCycleSummaryPage />} />
          </Route>

          {/* Org impact tables merged into ImpactTablesPage (scope filter).
              Redirect preserves old SIRO/CISO bookmarks + widget links. */}
          <Route path="/siro/impact-tables" element={<Navigate to="/impact-tables?scope=organisation" replace />} />

          {/* Admin — account + access-control management */}
          <Route element={<ProtectedRoute capability="admin.manage" />}>
            <Route path="/admin/users"  element={<AccountManagementPage />} />
            <Route path="/admin/rbac"   element={<AdminRbacPage />} />
            <Route path="/reporting"    element={<MetricsPage />} />
            <Route path="/admin/export" element={<DataExportPage />} />
            <Route path="/admin/audit"  element={<AuditLogPage />} />
            <Route path="/admin/api-keys" element={<ApiKeysPage />} />
            <Route path="/admin/help"   element={<HelpContentPage />} />
          </Route>

          <Route path="/" element={<RoleHomeRedirect />} />

          <Route path="*" element={
            <div style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              404 — Route not found
            </div>
          } />
        </Routes>
      </BrowserRouter>
      </HelpProvider>
    </AuthProvider>
  );
}