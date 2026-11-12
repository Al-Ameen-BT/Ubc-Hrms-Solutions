'use strict';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// Grants and responsibility assignments must come from server-owned records.
function canAccessEmployee(actor, employee, action, grants = []) {
  if (!actor || !employee || !sameId(actor.organizationId, employee.organizationId)) return false;
  return grants.some(grant => {
    if (grant.action !== action) return false;
    if (grant.scope === 'ORGANISATION') return true;
    if (grant.scope === 'OWN') return sameId(actor.employeeId, employee.id);
    if (grant.scope === 'BRANCH') return Array.isArray(grant.branchIds) && grant.branchIds.some(id => sameId(id, employee.branchId));
    return false;
  });
}

function selectLeaveApprover(request, rule, assignments = []) {
  if (!request || !rule || !sameId(request.organizationId, rule.organizationId) ||
      !sameId(request.branchId, rule.branchId) || request.responsibility !== rule.requesterResponsibility) return null;
  if (request.responsibility === 'BRANCH_MANAGER' && !['GM', 'SENIOR_MANAGER'].includes(rule.approverResponsibility)) return null;
  const eligible = assignments.filter(assignment => assignment.active === true &&
    sameId(assignment.organizationId, request.organizationId) &&
    assignment.userId != null && !sameId(assignment.userId, request.requesterId) &&
    assignment.responsibility === rule.approverResponsibility &&
    (assignment.scope === 'ORGANISATION' || assignment.scope === 'BRANCH' && sameId(assignment.branchId, request.branchId)));
  const users = [...new Set(eligible.map(assignment => String(assignment.userId)))];
  // Missing or ambiguous assignments require explicit routing, never arbitrary approval.
  return users.length === 1 ? eligible[0].userId : null;
}

module.exports = { canAccessEmployee, selectLeaveApprover };
