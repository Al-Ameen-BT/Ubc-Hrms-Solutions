import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { masterDataApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

export function ServiceBookPage() {
  const { id } = useParams();

  const { data: employee } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => masterDataApi.employee(id),
  });

  const { data: serviceBook } = useQuery({
    queryKey: ['service-book', id],
    queryFn: () => masterDataApi.serviceBook(id),
  });

  const entries = serviceBook?.entries || [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Service Book — {employee?.name || '…'}</h1>
        <p>{employee?.code} · {employee?.postName}</p>
      </header>

      <Card title="Service Book Entries" noPadding={
        <div className="service-book-timeline">
          {entries.map((entry) => (
            <div key={entry.id} className="timeline-entry">
              <div className="timeline-date mono">{fmt.date(entry.date)}</div>
              <div className="timeline-content">
                <div className="timeline-event">{entry.eventType}</div>
                <div className="timeline-particulars">{entry.particulars}</div>
                {entry.payEffect && (
                  <div className="timeline-pay red-ink mono">{fmt.money(entry.payEffect)}</div>
                )}
                {entry.verifiedBy && (
                  <div className="timeline-stamp">
                    <Badge stamp variant="success">Verified — {entry.verifiedBy}</Badge>
                  </div>
                )}
              </div>
            </div>
          ))}
          {!entries.length && (
            <div className="empty-state">
              <p>No service book entries yet.</p>
            </div>
          )}
        </div>
      } />
    </div>
  );
}
