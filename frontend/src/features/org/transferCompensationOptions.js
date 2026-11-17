export function eligibleTransferCompensation(assignments, directPay, transferDate) {
  const pending = assignments.filter(row => row.status === 'PENDING' && row.effectiveDate === transferDate);
  const latestApprovedDirectPay = directPay
    ? assignments
      .filter(row => row.status === 'APPROVED' && row.effectiveDate <= transferDate)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || Number(b.id) - Number(a.id))
      .slice(0, 1)
    : [];
  return [...pending, ...latestApprovedDirectPay];
}
