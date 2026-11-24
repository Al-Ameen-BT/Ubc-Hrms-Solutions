import React from 'react';
import { Link } from 'react-router-dom';

export function Breadcrumbs({ items = [] }) {
  return <nav className="command-breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={`${item.label}-${index}`}>{item.to && index < items.length - 1 ? <Link to={item.to}>{item.label}</Link> : <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.label}</span>}{index < items.length - 1 ? <i aria-hidden="true">/</i> : null}</li>)}</ol></nav>;
}

export default Breadcrumbs;
