import React, { useMemo, useState } from 'react';
import './WorkplaceTree.css';

const text = value => String(value || '').trim();
const plural = (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`;

function buildUnits(employees) {
  const units = new Map();
  for (const employee of employees) {
    const branch = employee.branch || { id: 'unassigned', name: 'Unassigned unit', code: '' };
    const unitKey = String(branch.id || 'unassigned');
    if (!units.has(unitKey)) units.set(unitKey, { ...branch, employees: [], departments: new Map() });
    const unit = units.get(unitKey);
    unit.employees.push(employee);

    const department = employee.department || { id: 'unassigned', name: 'Unassigned department', code: '' };
    const departmentKey = String(department.id || 'unassigned');
    if (!unit.departments.has(departmentKey)) unit.departments.set(departmentKey, { ...department, employees: [], positions: new Map() });
    const departmentNode = unit.departments.get(departmentKey);
    departmentNode.employees.push(employee);

    const position = employee.position || { id: 'unassigned', name: 'Unassigned position', code: '', reportsToPositionId: null };
    const positionKey = String(position.id || 'unassigned');
    if (!departmentNode.positions.has(positionKey)) departmentNode.positions.set(positionKey, { ...position, occupants: [] });
    departmentNode.positions.get(positionKey).occupants.push(employee);
  }
  return [...units.values()].map(unit => ({
    ...unit,
    departments: [...unit.departments.values()].map(department => ({ ...department, positions: [...department.positions.values()] })),
  }));
}

export function WorkplaceTree({ employees = [], leadership = [], renderPhoto, resolvePositionName, scopeDescription, leadershipAction }) {
  const [query, setQuery] = useState('');
  const positionNames = useMemo(() => new Map(employees.filter(row => row.position?.id).map(row => [String(row.position.id), row.position.name])), [employees]);
  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en-IN');
    if (!needle) return employees;
    return employees.filter(row => [row.name, row.empCode, row.branch?.name, row.department?.name, row.position?.name].some(value => text(value).toLocaleLowerCase('en-IN').includes(needle)));
  }, [employees, query]);
  const units = useMemo(() => buildUnits(filteredEmployees), [filteredEmployees]);
  const departmentCount = new Set(filteredEmployees.map(row => row.department?.id).filter(Boolean).map(String)).size;
  const positionCount = new Set(filteredEmployees.map(row => row.position?.id).filter(Boolean).map(String)).size;
  const photo = person => renderPhoto?.(person) || <span className="work-tree-initial" aria-hidden="true">{text(person.name)[0]?.toUpperCase() || ''}</span>;
  const parentName = position => position.reportsToPositionId
    ? resolvePositionName?.(position.reportsToPositionId) || positionNames.get(String(position.reportsToPositionId)) || `Position #${position.reportsToPositionId}`
    : '';

  return <div className="work-tree-shell">
    <header className="work-tree-toolbar">
      <div>
        <h3>Workplace tree</h3>
        <p>{scopeDescription || 'Current units, departments, reporting positions and employee occupants.'}</p>
      </div>
      <label className="work-tree-search"><span>Find in tree</span><input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Employee, code, department or position" /></label>
    </header>

    <dl className="work-tree-summary" aria-label="Visible workplace totals">
      <div><dt>Units</dt><dd>{units.length}</dd></div>
      <div><dt>Departments</dt><dd>{departmentCount}</dd></div>
      <div><dt>Positions</dt><dd>{positionCount}</dd></div>
      <div><dt>Employees</dt><dd>{filteredEmployees.length}</dd></div>
    </dl>

    {leadership.length > 0 && <section className="work-tree-leadership" aria-labelledby="work-tree-leadership-title">
      <header><div><h4 id="work-tree-leadership-title">Board and external leadership</h4><p>Published profiles outside employee position assignments.</p></div>{leadershipAction}</header>
      <ul>{leadership.map(person => <li key={person.id}>{photo(person)}<span><strong>{person.name}</strong><small>{person.roleOther || person.role}</small></span></li>)}</ul>
    </section>}

    {!employees.length ? <div className="work-tree-empty"><strong>No current occupants</strong><span>Only employees with active organisation assignments appear in the workplace tree.</span></div> : !filteredEmployees.length ? <div className="work-tree-empty"><strong>No matching workplace records</strong><span>Clear the search or use another employee, department or position name.</span></div> : <div className="work-tree-units">{units.map(unit => <section className="work-tree-unit" key={unit.id || unit.name}>
      <header className="work-tree-unit-header"><div><h4>{unit.name}</h4><span className="work-tree-unit-type">{unit.unitType === 'HEAD_OFFICE' ? 'Head Office' : 'Branch'}</span></div><p>{unit.code ? <span className="mono">{unit.code}</span> : null}<strong>{plural(unit.employees.length, 'employee')}</strong></p></header>
      <div className="work-tree-departments">{unit.departments.map(department => <details className="work-tree-department" key={department.id || department.name} open>
        <summary><span><strong>{department.name}</strong>{department.code ? <small className="mono">{department.code}</small> : null}</span><small>{plural(department.employees.length, 'employee')}</small></summary>
        <div className="work-tree-positions">{department.positions.map(position => <article className="work-tree-position" key={position.id || position.name}>
          <header><div><h5>{position.name}</h5>{position.code ? <span className="mono">{position.code}</span> : null}</div>{parentName(position) ? <p>Reports to <strong>{parentName(position)}</strong></p> : <p>Top-level position</p>}</header>
          <ul>{position.occupants.map(person => <li className="work-tree-person" key={person.id}>{photo(person)}<span><strong>{person.name}</strong><small><span className="mono">{person.empCode}</span>{person.position?.name ? ` · ${person.position.name}` : ''}</small></span></li>)}</ul>
        </article>)}</div>
      </details>)}</div>
    </section>)}</div>}
  </div>;
}

export default WorkplaceTree;
