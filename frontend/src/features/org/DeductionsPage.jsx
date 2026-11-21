import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deductionApi, overdraftSlabApi } from '../../api/extended';
import { orgApi, fmt } from '../../api/client';
import { compensationApi } from '../../api/compensation';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import {
  SettingsIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  UsersIcon,
  UserIcon,
  RefreshCwIcon,
} from '../../components/ui/Icons';

const CATEGORIES = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'STATUTORY', label: 'Statutory' },
  { value: 'WELFARE', label: 'Welfare Fund' },
  { value: 'SOCIETY', label: 'Credit Society' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'LOAN', label: 'Loan / Recovery' },
  { value: 'VOLUNTARY', label: 'Voluntary' },
  { value: 'OTHER', label: 'Other' },
];

export function DeductionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('deductions'); // 'deductions' | 'employees' | 'overdraft'

  // Welfare Fund interactive calculator test state
  const [testBasicDa, setTestBasicDa] = useState('12500');

  // Deduction Types state
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeduction, setEditingDeduction] = useState(null);
  const [form, setForm] = useState({
    name: '',
    category: 'OTHER',
    calculationType: 'FLAT',
    percentageBase: 'BASIC',
    percentageValue: '',
    frequency: 'MONTHLY',
    amount: '',
    employerAmount: '',
    month: '',
    year: '',
    remarks: '',
  });
  const [error, setError] = useState('');

  // Overdraft Slabs state
  const [slabModalOpen, setSlabModalOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState(null);
  const [slabForm, setSlabForm] = useState({
    slabName: '',
    fromSalary: '0',
    toSalary: '',
    multiplier: '15',
    maxLimit: '',
    minLimit: '',
    maxTenureMonths: '84',
    remarks: '',
  });
  const [slabError, setSlabError] = useState('');

  // Employee Deductions state
  const [empSearch, setEmpSearch] = useState('');
  const [empWelfareFilter, setEmpWelfareFilter] = useState('ALL');
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [empForm, setEmpForm] = useState({
    welfareFundOptIn: false,
    welfareFundAmount: '',
    vpfPercent: '',
    gsliOptIn: null,
    gsliAmount: '',
    ptAmount: '',
    taxRegime: 'NEW',
    taxOtherDeductions: '',
  });
  const [empError, setEmpError] = useState('');

  // Universal Double Confirmation State
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: '',
    itemName: '',
    details: {},
    warningMessage: '',
    confirmLabel: 'Confirm',
    confirmVariant: 'primary',
    requireVerification: false,
    verificationText: '',
    verificationLabel: '',
    onConfirm: null,
  });

  // Queries
  const { data: deductionsData, isLoading: loadingDeductions } = useQuery({
    queryKey: ['deduction-types'],
    queryFn: () => deductionApi.list(),
  });

  const { data: slabsData, isLoading: loadingSlabs } = useQuery({
    queryKey: ['overdraft-slabs'],
    queryFn: () => overdraftSlabApi.list(),
  });

  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees-for-deductions'],
    queryFn: () => orgApi.employees({ status: 'ACTIVE' }),
  });

  const { data: payrollSettings } = useQuery({
    queryKey: ['org-payroll-settings'],
    queryFn: orgApi.payrollSettings,
  });

  const { data: adoptions } = useQuery({
    queryKey: ['catalogue-adoptions'],
    queryFn: compensationApi.adoptions,
  });
  const isCatalogueBank = adoptions?.history?.some((r) => r.status === 'APPROVED');

  // Deduction Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => deductionApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deduction-types'] });
      toast.add('Deduction type created successfully.', 'success');
      setModalOpen(false);
      resetDeductionForm();
    },
    onError: (err) => setError(err.message || 'Could not create deduction type.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => deductionApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deduction-types'] });
      toast.add('Deduction type updated successfully.', 'success');
      setModalOpen(false);
      resetDeductionForm();
    },
    onError: (err) => setError(err.message || 'Could not update deduction type.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => deductionApi.setStatus(id, status),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deduction-types'] });
      toast.add(`Deduction type ${vars.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`, 'success');
    },
    onError: (err) => toast.add(err.message || 'Status change failed.', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deductionApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deduction-types'] });
      toast.add('Deduction type permanently deleted.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Could not delete deduction type.', 'error'),
  });

  // Slab Mutations
  const createSlabMutation = useMutation({
    mutationFn: (payload) => overdraftSlabApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overdraft-slabs'] });
      toast.add('Overdraft slab created successfully.', 'success');
      setSlabModalOpen(false);
      resetSlabForm();
    },
    onError: (err) => setSlabError(err.message || 'Could not create overdraft slab.'),
  });

  const updateSlabMutation = useMutation({
    mutationFn: ({ id, payload }) => overdraftSlabApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overdraft-slabs'] });
      toast.add('Overdraft slab updated successfully.', 'success');
      setSlabModalOpen(false);
      resetSlabForm();
    },
    onError: (err) => setSlabError(err.message || 'Could not update overdraft slab.'),
  });

  const statusSlabMutation = useMutation({
    mutationFn: ({ id, status }) => overdraftSlabApi.setStatus(id, status),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['overdraft-slabs'] });
      toast.add(`Overdraft slab ${vars.status === 'ACTIVE' ? 'activated' : 'deactivated'}.`, 'success');
    },
    onError: (err) => toast.add(err.message || 'Status change failed.', 'error'),
  });

  const deleteSlabMutation = useMutation({
    mutationFn: (id) => overdraftSlabApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overdraft-slabs'] });
      toast.add('Overdraft slab deleted successfully.', 'success');
    },
    onError: (err) => toast.add(err.message || 'Could not delete overdraft slab.', 'error'),
  });

  // Employee Deductions Mutation
  const updateEmpDeductionsMutation = useMutation({
    mutationFn: async ({ employeeId, payload }) => {
      if (isCatalogueBank) {
        return compensationApi.proposeFinancialChange({
          targetType: 'EMPLOYEE',
          targetId: employeeId,
          patch: payload,
          effectiveDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
          reason: 'Deduction values updated from Deductions Management',
        });
      }
      return orgApi.updateEmployee(employeeId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees-for-deductions'] });
      toast.add(isCatalogueBank ? 'Deduction change proposal submitted for approval.' : 'Employee deduction values updated.', 'success');
      setEditingEmployee(null);
    },
    onError: (err) => setEmpError(err.message || 'Failed to update employee deductions.'),
  });

  function resetDeductionForm() {
    setEditingDeduction(null);
    setForm({
      name: '',
      category: 'OTHER',
      calculationType: 'FLAT',
      percentageBase: 'BASIC',
      percentageValue: '',
      frequency: 'MONTHLY',
      amount: '',
      employerAmount: '',
      month: '',
      year: '',
      remarks: '',
    });
    setError('');
  }

  function resetSlabForm() {
    setEditingSlab(null);
    setSlabForm({
      slabName: '',
      fromSalary: '0',
      toSalary: '',
      multiplier: '15',
      maxLimit: '',
      minLimit: '',
      maxTenureMonths: '84',
      remarks: '',
    });
    setSlabError('');
  }

  // Welfare Fund calculation helper matching payslip.js exactly
  const welfareCalculation = useMemo(() => {
    const val = Number(testBasicDa || 0);
    const threshold = payrollSettings?.welfareFundThreshold != null ? Number(payrollSettings.welfareFundThreshold) : 10000;
    const rule = payrollSettings?.welfareFundRule || 'SLAB';

    if (rule === 'FLAT') {
      const emp = payrollSettings?.welfareFundBaseEmployee ?? 45;
      const empr = payrollSettings?.welfareFundBaseEmployer ?? 45;
      return { employee: emp, employer: empr, slabDescription: 'Flat Base Rate Rule' };
    }

    if (val > threshold) {
      const emp = payrollSettings?.welfareFundAboveEmployee ?? 300;
      const empr = payrollSettings?.welfareFundAboveEmployer ?? 250;
      return {
        employee: emp,
        employer: empr,
        slabDescription: `Above Threshold (> ₹${threshold.toLocaleString()}): Emp ₹${emp} / Empr ₹${empr}`,
      };
    }
    const emp = payrollSettings?.welfareFundBelowEmployee ?? 250;
    const empr = payrollSettings?.welfareFundBelowEmployer ?? 200;
    return {
      employee: emp,
      employer: empr,
      slabDescription: `At / Below Threshold (≤ ₹${threshold.toLocaleString()}): Emp ₹${emp} / Empr ₹${empr}`,
    };
  }, [testBasicDa, payrollSettings]);

  // Request double confirmation helper
  function requestConfirmation({
    title,
    itemName,
    details = {},
    warningMessage = '',
    confirmLabel = 'Confirm',
    confirmVariant = 'primary',
    requireVerification = false,
    verificationText = '',
    verificationLabel = '',
    onConfirm,
  }) {
    setConfirmModal({
      open: true,
      title,
      itemName,
      details,
      warningMessage,
      confirmLabel,
      confirmVariant,
      requireVerification,
      verificationText,
      verificationLabel,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, open: false }));
        if (onConfirm) await onConfirm();
      },
    });
  }

  // --- Handlers with Double Confirmation ---

  function handleSaveDeduction() {
    if (!form.name.trim()) {
      setError('Deduction name is required.');
      return;
    }
    const isEdit = !!editingDeduction;
    requestConfirmation({
      title: isEdit ? 'Confirm Deduction Type Update' : 'Confirm New Deduction Type',
      itemName: form.name,
      details: {
        'Category': form.category,
        'Calculation': form.calculationType === 'PERCENTAGE' ? `${form.percentageValue}% of ${form.percentageBase}` : `₹${form.amount}`,
        'Employer Share': form.employerAmount ? `₹${form.employerAmount}` : 'None',
        'Frequency': form.frequency,
      },
      warningMessage: isEdit
        ? 'Updating this deduction will apply the revised formula to upcoming monthly payroll calculations.'
        : 'Creating this deduction makes it available for assignment across active posts and employee payroll.',
      confirmLabel: isEdit ? 'Confirm & Update' : 'Confirm & Create',
      confirmVariant: 'primary',
      onConfirm: () => {
        if (isEdit) {
          updateMutation.mutate({ id: editingDeduction.id, payload: form });
        } else {
          createMutation.mutate(form);
        }
      },
    });
  }

  function handleToggleDeductionStatus(item) {
    const nextStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const isDeactivate = nextStatus === 'INACTIVE';
    requestConfirmation({
      title: isDeactivate ? 'Deactivate Deduction Type' : 'Activate Deduction Type',
      itemName: item.name,
      details: {
        'Category': item.category,
        'Current Status': item.status,
        'Target Status': nextStatus,
      },
      warningMessage: isDeactivate
        ? 'Deactivating this deduction type will exclude it from upcoming monthly payroll runs.'
        : 'Activating this deduction type will make it eligible for inclusion in upcoming payroll runs.',
      confirmLabel: isDeactivate ? 'Confirm Deactivation' : 'Confirm Activation',
      confirmVariant: isDeactivate ? 'danger' : 'primary',
      requireVerification: isDeactivate,
      verificationText: 'DEACTIVATE',
      verificationLabel: isDeactivate ? `Type "DEACTIVATE" to confirm deactivating ${item.name}:` : '',
      onConfirm: () => statusMutation.mutate({ id: item.id, status: nextStatus }),
    });
  }

  function handleDeleteDeduction(item) {
    requestConfirmation({
      title: 'Delete Deduction Type Permanently',
      itemName: item.name,
      details: {
        'Category': item.category,
        'Type': item.calculationType,
      },
      warningMessage: 'This will permanently remove this deduction type. Ensure it is not required for past audit reconciliations.',
      confirmLabel: 'Confirm & Delete',
      confirmVariant: 'danger',
      requireVerification: true,
      verificationText: 'DELETE',
      verificationLabel: `Type "DELETE" to confirm permanent deletion of ${item.name}:`,
      onConfirm: () => deleteMutation.mutate(item.id),
    });
  }

  function handleSaveSlab() {
    if (!slabForm.slabName.trim()) {
      setSlabError('Slab name is required.');
      return;
    }
    const isEdit = !!editingSlab;
    requestConfirmation({
      title: isEdit ? 'Confirm Overdraft Slab Update' : 'Confirm New Overdraft Slab',
      itemName: slabForm.slabName,
      details: {
        'Salary Range': `₹${Number(slabForm.fromSalary).toLocaleString()} – ${slabForm.toSalary ? `₹${Number(slabForm.toSalary).toLocaleString()}` : 'Unbounded'}`,
        'Multiplier': `${slabForm.multiplier}x Basic+DA`,
        'Max Cap': slabForm.maxLimit ? `₹${Number(slabForm.maxLimit).toLocaleString()}` : 'Uncapped',
        'Max Tenure': `${slabForm.maxTenureMonths} months`,
      },
      warningMessage: isEdit
        ? 'Updating this tier will affect the maximum allowable overdraft limit calculated for eligible staff.'
        : 'Creating this overdraft slab establishes a new salary bracket limit for bank employees.',
      confirmLabel: isEdit ? 'Confirm & Update Slab' : 'Confirm & Save Slab',
      confirmVariant: 'primary',
      onConfirm: () => {
        if (isEdit) {
          updateSlabMutation.mutate({ id: editingSlab.id, payload: slabForm });
        } else {
          createSlabMutation.mutate(slabForm);
        }
      },
    });
  }

  function handleToggleSlabStatus(item) {
    const nextStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const isDeactivate = nextStatus === 'INACTIVE';
    requestConfirmation({
      title: isDeactivate ? 'Deactivate Overdraft Slab' : 'Activate Overdraft Slab',
      itemName: item.slabName,
      details: {
        'Multiplier': `${item.multiplier}x`,
        'Max Cap': item.maxLimit ? `₹${Number(item.maxLimit).toLocaleString()}` : 'No Cap',
      },
      warningMessage: isDeactivate
        ? 'Deactivating this overdraft slab removes it from active evaluation when issuing new employee overdrafts.'
        : 'Activating this overdraft slab restores it to active tier evaluation.',
      confirmLabel: isDeactivate ? 'Confirm Deactivation' : 'Confirm Activation',
      confirmVariant: isDeactivate ? 'danger' : 'primary',
      requireVerification: isDeactivate,
      verificationText: 'DEACTIVATE',
      verificationLabel: isDeactivate ? `Type "DEACTIVATE" to confirm deactivating ${item.slabName}:` : '',
      onConfirm: () => statusSlabMutation.mutate({ id: item.id, status: nextStatus }),
    });
  }

  function handleDeleteSlab(item) {
    requestConfirmation({
      title: 'Delete Overdraft Slab Permanently',
      itemName: item.slabName,
      details: {
        'Multiplier': `${item.multiplier}x`,
        'Salary Bracket': `₹${Number(item.fromSalary).toLocaleString()} – ${item.toSalary ? `₹${Number(item.toSalary).toLocaleString()}` : 'Above'}`,
      },
      warningMessage: 'This permanently deletes this overdraft tier definition from the bank.',
      confirmLabel: 'Confirm & Delete Slab',
      confirmVariant: 'danger',
      requireVerification: true,
      verificationText: 'DELETE',
      verificationLabel: `Type "DELETE" to confirm permanent deletion of ${item.slabName}:`,
      onConfirm: () => deleteSlabMutation.mutate(item.id),
    });
  }

  function handleSaveEmployeeDeductions() {
    if (!editingEmployee) return;
    const cleanPayload = {
      welfareFundOptIn: !!empForm.welfareFundOptIn,
      welfareFundAmount: empForm.welfareFundAmount ? Number(empForm.welfareFundAmount) : null,
      vpfPercent: empForm.vpfPercent ? Number(empForm.vpfPercent) : null,
      gsliOptIn: empForm.gsliOptIn,
      gsliAmount: empForm.gsliAmount ? Number(empForm.gsliAmount) : null,
      ptAmount: empForm.ptAmount ? Number(empForm.ptAmount) : null,
      taxRegime: empForm.taxRegime || 'NEW',
      taxOtherDeductions: empForm.taxOtherDeductions ? Number(empForm.taxOtherDeductions) : null,
    };

    requestConfirmation({
      title: 'Confirm Employee Deduction Update',
      itemName: `${editingEmployee.name} (${editingEmployee.empCode})`,
      details: {
        'Welfare Fund': cleanPayload.welfareFundOptIn
          ? cleanPayload.welfareFundAmount ? `Custom Override ₹${cleanPayload.welfareFundAmount}` : 'Enrolled (Statutory Slab)'
          : 'Not Enrolled',
        'Voluntary PF (VPF)': cleanPayload.vpfPercent ? `${cleanPayload.vpfPercent}%` : 'None',
        'Professional Tax (PT)': cleanPayload.ptAmount ? `₹${cleanPayload.ptAmount}` : 'Default',
        'Tax Regime': cleanPayload.taxRegime,
      },
      warningMessage: isCatalogueBank
        ? 'This change proposal will be sent to the Approving Authority before taking effect on live payslips.'
        : 'These updated deduction variables will be applied directly to the employee’s upcoming payroll runs.',
      confirmLabel: isCatalogueBank ? 'Submit for Financial Approval' : 'Confirm & Apply Deductions',
      confirmVariant: 'primary',
      onConfirm: () => updateEmpDeductionsMutation.mutate({ employeeId: editingEmployee.id, payload: cleanPayload }),
    });
  }

  const filteredDeductions = (deductionsData?.data || []).filter((d) => {
    if (selectedCategory === 'ALL') return true;
    return d.category === selectedCategory;
  });

  const rawEmployees = employeesData?.rows || employeesData || [];
  const filteredEmployees = rawEmployees.filter((emp) => {
    const matchSearch =
      !empSearch ||
      emp.name?.toLowerCase().includes(empSearch.toLowerCase()) ||
      emp.empCode?.toLowerCase().includes(empSearch.toLowerCase()) ||
      emp.department?.toLowerCase().includes(empSearch.toLowerCase());
    if (!matchSearch) return false;
    if (empWelfareFilter === 'ENROLLED') return !!emp.welfareFundOptIn;
    if (empWelfareFilter === 'NOT_ENROLLED') return !emp.welfareFundOptIn;
    return true;
  });

  const categoryBadgeVariant = (cat) => {
    switch (cat) {
      case 'STATUTORY': return 'warning';
      case 'WELFARE': return 'success';
      case 'SOCIETY': return 'primary';
      case 'INSURANCE': return 'secondary';
      case 'LOAN': return 'danger';
      default: return 'secondary';
    }
  };

  const deductionColumns = [
    { field: 'name', label: 'Deduction Name' },
    {
      field: 'category',
      label: 'Category',
      render: (r) => <Badge variant={categoryBadgeVariant(r.category)}>{r.category}</Badge>,
    },
    {
      field: 'type',
      label: 'Calculation Type',
      render: (r) => (
        <span>
          {r.calculationType === 'PERCENTAGE'
            ? `${r.percentageValue}% of ${r.percentageBase?.replace(/_/g, ' ')}`
            : 'Flat Rupee'}
        </span>
      ),
    },
    {
      field: 'frequency',
      label: 'Frequency',
      render: (r) => <Badge variant="secondary">{r.frequency?.replace(/_/g, ' ')}</Badge>,
    },
    {
      field: 'amount',
      label: 'Employee (₹)',
      mono: true,
      align: 'right',
      render: (r) => (r.calculationType === 'PERCENTAGE' ? `${r.percentageValue}%` : fmt.money(r.amount)),
    },
    {
      field: 'employerAmount',
      label: 'Employer (₹)',
      mono: true,
      align: 'right',
      render: (r) => (r.employerAmount ? fmt.money(r.employerAmount) : '—'),
    },
    {
      field: 'status',
      label: 'Status',
      render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'secondary'}>{r.status}</Badge>,
    },
    {
      field: 'actions',
      label: 'Actions',
      sortable: false,
      render: (r) => (
        <div className="row-actions" style={{ display: 'flex', gap: '0.35rem' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingDeduction(r);
              setForm({
                name: r.name,
                category: r.category,
                calculationType: r.calculationType,
                percentageBase: r.percentageBase || 'BASIC',
                percentageValue: r.percentageValue || '',
                frequency: r.frequency,
                amount: r.amount || '',
                employerAmount: r.employerAmount || '',
                month: r.month || '',
                year: r.year || '',
                remarks: r.remarks || '',
              });
              setModalOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleToggleDeductionStatus(r)}
          >
            {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            style={{ color: '#dc2626' }}
            onClick={() => handleDeleteDeduction(r)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const employeeColumns = [
    { field: 'empCode', label: 'Emp Code', mono: true },
    {
      field: 'name',
      label: 'Employee Name',
      render: (r) => (
        <div>
          <strong>{r.name}</strong>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{r.designation || r.department || 'Staff'}</div>
        </div>
      ),
    },
    {
      field: 'currentBasicPay',
      label: 'Basic Pay (₹)',
      mono: true,
      align: 'right',
      render: (r) => fmt.money(r.currentBasicPay),
    },
    {
      field: 'welfareFund',
      label: 'Welfare Fund',
      render: (r) => {
        if (!r.welfareFundOptIn) return <Badge variant="secondary">Not Enrolled</Badge>;
        if (r.welfareFundAmount && Number(r.welfareFundAmount) > 0) {
          return <Badge variant="primary">Override ₹{Number(r.welfareFundAmount).toLocaleString()}</Badge>;
        }
        return <Badge variant="success">Enrolled (Statutory Slab)</Badge>;
      },
    },
    {
      field: 'vpfPercent',
      label: 'VPF %',
      mono: true,
      align: 'right',
      render: (r) => (r.vpfPercent ? `${r.vpfPercent}%` : '—'),
    },
    {
      field: 'ptAmount',
      label: 'PT (₹)',
      mono: true,
      align: 'right',
      render: (r) => (r.ptAmount ? fmt.money(r.ptAmount) : 'Default'),
    },
    {
      field: 'taxRegime',
      label: 'Tax Regime',
      render: (r) => <Badge variant={r.taxRegime === 'NEW' ? 'primary' : 'warning'}>{r.taxRegime || 'NEW'}</Badge>,
    },
    {
      field: 'actions',
      label: 'Actions',
      sortable: false,
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditingEmployee(r);
            setEmpForm({
              welfareFundOptIn: !!r.welfareFundOptIn,
              welfareFundAmount: r.welfareFundAmount || '',
              vpfPercent: r.vpfPercent || '',
              gsliOptIn: r.gsliOptIn,
              gsliAmount: r.gsliAmount || '',
              ptAmount: r.ptAmount || '',
              taxRegime: r.taxRegime || 'NEW',
              taxOtherDeductions: r.taxOtherDeductions || '',
            });
            setEmpError('');
          }}
        >
          Manage Deductions
        </Button>
      ),
    },
  ];

  const slabColumns = [
    { field: 'slabName', label: 'Slab / Tier Name' },
    {
      field: 'salaryRange',
      label: 'Salary Bracket (Basic + DA ₹)',
      mono: true,
      render: (r) => (
        <span>
          {fmt.money(r.fromSalary)} – {r.toSalary ? fmt.money(r.toSalary) : 'Above'}
        </span>
      ),
    },
    {
      field: 'multiplier',
      label: 'Multiplier',
      mono: true,
      align: 'right',
      render: (r) => `${r.multiplier}x`,
    },
    {
      field: 'maxLimit',
      label: 'Max OD Limit (₹)',
      mono: true,
      align: 'right',
      render: (r) => (r.maxLimit ? fmt.money(r.maxLimit) : 'No Cap'),
    },
    {
      field: 'maxTenureMonths',
      label: 'Max Tenure',
      mono: true,
      align: 'center',
      render: (r) => `${r.maxTenureMonths || 84} mos`,
    },
    {
      field: 'status',
      label: 'Status',
      render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'secondary'}>{r.status}</Badge>,
    },
    {
      field: 'actions',
      label: 'Actions',
      sortable: false,
      render: (r) => (
        <div className="row-actions" style={{ display: 'flex', gap: '0.35rem' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingSlab(r);
              setSlabForm({
                slabName: r.slabName,
                fromSalary: String(r.fromSalary || 0),
                toSalary: r.toSalary ? String(r.toSalary) : '',
                multiplier: String(r.multiplier || 15),
                maxLimit: r.maxLimit ? String(r.maxLimit) : '',
                minLimit: r.minLimit ? String(r.minLimit) : '',
                maxTenureMonths: String(r.maxTenureMonths || 84),
                remarks: r.remarks || '',
              });
              setSlabModalOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleToggleSlabStatus(r)}
          >
            {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            style={{ color: '#dc2626' }}
            onClick={() => handleDeleteSlab(r)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Deductions &amp; Overdraft Slabs</h1>
            <p>
              Manage all deduction categories, individual employee deduction values, statutory welfare fund rules, and strict overdraft tiers.
            </p>
          </div>
        </div>
      </header>

      {/* Welfare Fund Statutory Rules & Interactive Verification */}
      <Card title="Welfare Fund Statutory Rules &amp; Verification">
        <p className="form-note">
          Kerala statutory co-operative welfare fund deduction rules. Standard deduction is ₹45 each for employee and employer. When slab rules apply, amounts are determined by Basic + DA against the ₹10,000 threshold.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', margin: '1rem 0' }}>
          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>BASIC + DA &gt; ₹10,000 (SLAB TIER 1)</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Employee: ₹{payrollSettings?.welfareFundAboveEmployee ?? 300}{' '}
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>
                / Employer: ₹{payrollSettings?.welfareFundAboveEmployer ?? 250}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Statutory rate for higher earning tier</div>
          </div>

          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>BASIC + DA ≤ ₹10,000 (SLAB TIER 2)</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Employee: ₹{payrollSettings?.welfareFundBelowEmployee ?? 250}{' '}
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>
                / Employer: ₹{payrollSettings?.welfareFundBelowEmployer ?? 200}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Statutory rate for standard tier</div>
          </div>

          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>FLAT STANDARD RATE / BASE</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              Employee: ₹{payrollSettings?.welfareFundBaseEmployee ?? 45}{' '}
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>
                / Employer: ₹{payrollSettings?.welfareFundBaseEmployer ?? 45}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Flat base rate when flat rule applies</div>
          </div>
        </div>

        {/* Live Welfare Fund Simulator Tool */}
        <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', color: '#1e293b' }}>
            Live Welfare Fund Verification Calculator:
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ maxWidth: '200px' }}>
              <Input
                id="test-salary"
                label="Test Basic + DA (₹)"
                type="number"
                step="100"
                value={testBasicDa}
                onChange={(e) => setTestBasicDa(e.target.value)}
                mono
              />
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <Badge variant="primary">Rule: {welfareCalculation.slabDescription}</Badge>
              <div style={{ fontSize: '0.95rem' }}>
                <strong>Calculated Employee:</strong> ₹{welfareCalculation.employee} |{' '}
                <strong>Calculated Employer:</strong> ₹{welfareCalculation.employer}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', margin: '1.25rem 0 1rem 0' }}>
        <Button
          variant={activeTab === 'deductions' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('deductions')}
        >
          Deduction Categories ({deductionsData?.data?.length || 0})
        </Button>
        <Button
          variant={activeTab === 'employees' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('employees')}
        >
          <UserIcon size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
          Employee Deductions ({rawEmployees.length})
        </Button>
        <Button
          variant={activeTab === 'overdraft' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('overdraft')}
        >
          Overdraft Slabs ({slabsData?.data?.length || 0})
        </Button>
      </div>

      {/* TAB 1: DEDUCTION CATEGORIES */}
      {activeTab === 'deductions' && (
        <Card noPadding>
          <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label htmlFor="cat-filter" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>Category:</label>
              <select
                id="cat-filter"
                className="input"
                style={{ width: 'auto', padding: '0.35rem 0.75rem' }}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => {
                resetDeductionForm();
                setModalOpen(true);
              }}
            >
              + Add Deduction Type
            </Button>
          </div>
          <Table
            columns={deductionColumns}
            data={filteredDeductions}
            keyField="id"
            loading={loadingDeductions}
            emptyMessage="No deduction types configured in this category."
          />
        </Card>
      )}

      {/* TAB 2: EMPLOYEE DEDUCTIONS */}
      {activeTab === 'employees' && (
        <Card noPadding>
          <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <Input
                id="emp-ded-search"
                type="search"
                placeholder="Search employee by name, code, or department"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                style={{ minWidth: '280px' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label htmlFor="welfare-filter" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>Welfare Fund:</label>
                <select
                  id="welfare-filter"
                  className="input"
                  style={{ width: 'auto', padding: '0.35rem 0.75rem' }}
                  value={empWelfareFilter}
                  onChange={(e) => setEmpWelfareFilter(e.target.value)}
                >
                  <option value="ALL">All Staff</option>
                  <option value="ENROLLED">Enrolled Only</option>
                  <option value="NOT_ENROLLED">Not Enrolled</option>
                </select>
              </div>
            </div>
            <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
              Showing {filteredEmployees.length} active employees
            </div>
          </div>
          <Table
            columns={employeeColumns}
            data={filteredEmployees}
            keyField="id"
            loading={loadingEmployees}
            emptyMessage="No employees matching the search filters."
          />
        </Card>
      )}

      {/* TAB 3: OVERDRAFT SLABS */}
      {activeTab === 'overdraft' && (
        <Card noPadding>
          <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Strict salary brackets defining overdraft multipliers, caps, and tenures. Evaluated against an employee’s Basic + DA.
              </p>
            </div>
            <Button
              onClick={() => {
                resetSlabForm();
                setSlabModalOpen(true);
              }}
            >
              + Add Overdraft Slab
            </Button>
          </div>
          <Table
            columns={slabColumns}
            data={slabsData?.data || []}
            keyField="id"
            loading={loadingSlabs}
            emptyMessage="No overdraft slabs configured. Standard 15x Basic + DA applies by default."
          />
        </Card>
      )}

      {/* Add / Edit Deduction Type Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDeduction ? `Edit Deduction Type: ${editingDeduction.name}` : 'Add Deduction Type'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDeduction}>
              {editingDeduction ? 'Save Changes' : 'Create Deduction Type'}
            </Button>
          </>
        }
      >
        <form noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <Input
            id="ded-name"
            label="Deduction Name"
            placeholder="e.g. Society Share, Staff Welfare Club, Mutual Benefit Fund"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="ded-cat">Category</label>
              <select
                id="ded-cat"
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="STATUTORY">Statutory</option>
                <option value="WELFARE">Welfare Fund</option>
                <option value="SOCIETY">Credit Society</option>
                <option value="INSURANCE">Insurance</option>
                <option value="LOAN">Loan / Recovery</option>
                <option value="VOLUNTARY">Voluntary</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ded-calc">Calculation Type</label>
              <select
                id="ded-calc"
                className="input"
                value={form.calculationType}
                onChange={(e) => setForm({ ...form, calculationType: e.target.value })}
              >
                <option value="FLAT">Flat Rupee Amount</option>
                <option value="PERCENTAGE">Percentage of Salary</option>
              </select>
            </div>
          </div>

          {form.calculationType === 'PERCENTAGE' ? (
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="ded-pbase">Percentage Base</label>
                <select
                  id="ded-pbase"
                  className="input"
                  value={form.percentageBase}
                  onChange={(e) => setForm({ ...form, percentageBase: e.target.value })}
                >
                  <option value="BASIC">Basic Pay</option>
                  <option value="BASIC_PLUS_DA">Basic + DA</option>
                  <option value="GROSS">Gross Earnings</option>
                </select>
              </div>
              <Input
                id="ded-pval"
                label="Percentage (%)"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={form.percentageValue}
                onChange={(e) => setForm({ ...form, percentageValue: e.target.value })}
                mono
                required
              />
            </div>
          ) : (
            <div className="form-grid">
              <Input
                id="ded-amt"
                label="Employee Deduction (₹)"
                type="number"
                step="1"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                mono
                required
              />
              <Input
                id="ded-empr"
                label="Employer Contribution (₹, optional)"
                type="number"
                step="1"
                min="0"
                value={form.employerAmount}
                onChange={(e) => setForm({ ...form, employerAmount: e.target.value })}
                mono
              />
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="ded-freq">Frequency</label>
              <select
                id="ded-freq"
                className="input"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="ONE_TIME">One Time</option>
              </select>
            </div>
            {form.frequency !== 'MONTHLY' && (
              <Input
                id="ded-month"
                label="Month (1-12)"
                type="number"
                min="1"
                max="12"
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
                mono
              />
            )}
            {form.frequency === 'ONE_TIME' && (
              <Input
                id="ded-year"
                label="Year"
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                mono
              />
            )}
          </div>
          <Input
            id="ded-remarks"
            label="Remarks"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
        </form>
      </Modal>

      {/* Add / Edit Overdraft Slab Modal */}
      <Modal
        open={slabModalOpen}
        onClose={() => setSlabModalOpen(false)}
        title={editingSlab ? `Edit Overdraft Slab: ${editingSlab.slabName}` : 'Add Overdraft Slab'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSlabModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSlab}>
              {editingSlab ? 'Save Changes' : 'Save Slab'}
            </Button>
          </>
        }
      >
        <form noValidate>
          {slabError && <div className="auth-error" role="alert">{slabError}</div>}
          <Input
            id="slab-name"
            label="Slab Name"
            placeholder="e.g. Tier 1 (Basic+DA up to ₹25,000)"
            value={slabForm.slabName}
            onChange={(e) => setSlabForm({ ...slabForm, slabName: e.target.value })}
            required
          />
          <div className="form-grid">
            <Input
              id="slab-from"
              label="From Salary (Basic + DA ₹)"
              type="number"
              step="1"
              min="0"
              value={slabForm.fromSalary}
              onChange={(e) => setSlabForm({ ...slabForm, fromSalary: e.target.value })}
              mono
              required
            />
            <Input
              id="slab-to"
              label="To Salary (Basic + DA ₹, blank = unbounded)"
              type="number"
              step="1"
              min="0"
              placeholder="No upper limit"
              value={slabForm.toSalary}
              onChange={(e) => setSlabForm({ ...slabForm, toSalary: e.target.value })}
              mono
            />
          </div>
          <div className="form-grid">
            <Input
              id="slab-mult"
              label="Overdraft Multiplier (x)"
              type="number"
              step="0.5"
              min="1"
              max="50"
              value={slabForm.multiplier}
              onChange={(e) => setSlabForm({ ...slabForm, multiplier: e.target.value })}
              mono
              required
            />
            <Input
              id="slab-max"
              label="Maximum OD Limit Cap (₹)"
              type="number"
              step="1000"
              placeholder="e.g. 500000 (blank = uncapped)"
              value={slabForm.maxLimit}
              onChange={(e) => setSlabForm({ ...slabForm, maxLimit: e.target.value })}
              mono
            />
          </div>
          <div className="form-grid">
            <Input
              id="slab-min"
              label="Minimum OD Limit (₹, optional)"
              type="number"
              step="1000"
              value={slabForm.minLimit}
              onChange={(e) => setSlabForm({ ...slabForm, minLimit: e.target.value })}
              mono
            />
            <Input
              id="slab-tenure"
              label="Max Repayment Tenure (Months)"
              type="number"
              min="1"
              max="240"
              value={slabForm.maxTenureMonths}
              onChange={(e) => setSlabForm({ ...slabForm, maxTenureMonths: e.target.value })}
              mono
              required
            />
          </div>
          <Input
            id="slab-remarks"
            label="Remarks"
            value={slabForm.remarks}
            onChange={(e) => setSlabForm({ ...slabForm, remarks: e.target.value })}
          />
        </form>
      </Modal>

      {/* Edit Employee Deductions Modal */}
      {editingEmployee && (
        <Modal
          open={!!editingEmployee}
          onClose={() => setEditingEmployee(null)}
          title={`Manage Deductions: ${editingEmployee.name} (${editingEmployee.empCode})`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingEmployee(null)}>Cancel</Button>
              <Button onClick={handleSaveEmployeeDeductions}>
                Save Deductions
              </Button>
            </>
          }
        >
          <form noValidate>
            {empError && <div className="auth-error" role="alert">{empError}</div>}

            <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Employee Salary Base:</div>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Basic Pay: ₹{Number(editingEmployee.currentBasicPay || 0).toLocaleString()} | Post: {editingEmployee.designation || 'Staff'}
              </div>
            </div>

            <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <legend style={{ fontWeight: 600, fontSize: '0.875rem', padding: '0 0.5rem' }}>
                Welfare Fund Enrollment &amp; Override
              </legend>
              <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={empForm.welfareFundOptIn}
                  onChange={(e) => setEmpForm({ ...empForm, welfareFundOptIn: e.target.checked })}
                />
                <span style={{ fontWeight: 600 }}>Enroll in Statutory Welfare Fund</span>
              </label>

              {empForm.welfareFundOptIn && (
                <div style={{ marginTop: '0.5rem' }}>
                  <Input
                    id="emp-wf-amt"
                    label="Custom Welfare Override Amount (₹)"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="Leave 0 or blank for statutory slab calculation"
                    value={empForm.welfareFundAmount}
                    onChange={(e) => setEmpForm({ ...empForm, welfareFundAmount: e.target.value })}
                    mono
                    hint="When blank or 0, the statutory Kerala co-operative slab rule (₹300/₹250 based on Basic+DA ₹10,000 threshold) is used automatically."
                  />
                </div>
              )}
            </fieldset>

            <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
              <legend style={{ fontWeight: 600, fontSize: '0.875rem', padding: '0 0.5rem' }}>
                Provident Fund &amp; Insurance
              </legend>
              <div className="form-grid">
                <Input
                  id="emp-vpf"
                  label="Voluntary PF (VPF %)"
                  type="number"
                  step="0.001"
                  min="0"
                  max="100"
                  placeholder="e.g. 5 (beyond mandatory PF)"
                  value={empForm.vpfPercent}
                  onChange={(e) => setEmpForm({ ...empForm, vpfPercent: e.target.value })}
                  mono
                />
                <Input
                  id="emp-pt"
                  label="Professional Tax Amount (₹)"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="Leave blank for org default"
                  value={empForm.ptAmount}
                  onChange={(e) => setEmpForm({ ...empForm, ptAmount: e.target.value })}
                  mono
                />
              </div>
            </fieldset>

            <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.75rem 1rem' }}>
              <legend style={{ fontWeight: 600, fontSize: '0.875rem', padding: '0 0.5rem' }}>
                Income Tax Regime &amp; Declarations
              </legend>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="emp-tax-regime">Tax Regime</label>
                  <select
                    id="emp-tax-regime"
                    className="input"
                    value={empForm.taxRegime}
                    onChange={(e) => setEmpForm({ ...empForm, taxRegime: e.target.value })}
                  >
                    <option value="NEW">New Tax Regime</option>
                    <option value="OLD">Old Tax Regime</option>
                  </select>
                </div>
                {empForm.taxRegime === 'OLD' && (
                  <Input
                    id="emp-tax-80c"
                    label="80C / 80D Declared Deductions (₹)"
                    type="number"
                    step="1"
                    min="0"
                    value={empForm.taxOtherDeductions}
                    onChange={(e) => setEmpForm({ ...empForm, taxOtherDeductions: e.target.value })}
                    mono
                  />
                )}
              </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {/* Universal Double Confirmation Modal */}
      <ConfirmationModal
        open={confirmModal.open}
        onClose={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        itemName={confirmModal.itemName}
        details={confirmModal.details}
        warningMessage={confirmModal.warningMessage}
        confirmLabel={confirmModal.confirmLabel}
        confirmVariant={confirmModal.confirmVariant}
        requireVerification={confirmModal.requireVerification}
        verificationText={confirmModal.verificationText}
        verificationLabel={confirmModal.verificationLabel}
        loading={
          createMutation.isPending ||
          updateMutation.isPending ||
          statusMutation.isPending ||
          deleteMutation.isPending ||
          createSlabMutation.isPending ||
          updateSlabMutation.isPending ||
          statusSlabMutation.isPending ||
          deleteSlabMutation.isPending ||
          updateEmpDeductionsMutation.isPending
        }
      />
    </div>
  );
}

export default DeductionsPage;
