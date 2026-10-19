import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orgApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

/* Which employee-master fields are compulsory for this bank. Every field
   defaults to mandatory; an Org Admin can switch individual ones off
   (routes/orgSettings.js GET/PUT /org/mandatory-fields). */
export function MandatoryFieldsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [config, setConfig] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['mandatory-fields'], queryFn: orgApi.mandatoryFields });

  useEffect(() => { if (data?.config) setConfig({ ...data.config }); }, [data]);

  const save = useMutation({
    mutationFn: (payload) => orgApi.updateMandatoryFields({ config: payload }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mandatory-fields'] }); toast.add('Mandatory fields saved.', 'success'); },
    onError: (err) => toast.add(err.message || 'Save failed.', 'error'),
  });

  if (isLoading || !config) return <div className="page"><p>Loading…</p></div>;

  const fields = data?.fields || [];
  const setAll = (value) => setConfig(Object.fromEntries(fields.map((f) => [f.key, value])));

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Mandatory Employee Fields</h1>
            <p>Choose which details must be filled in on every employee record for this bank.</p>
          </div>
          <div className="page-header-actions">
            <Button variant="secondary" onClick={() => setAll(true)}>All required</Button>
            <Button variant="secondary" onClick={() => setAll(false)}>All optional</Button>
            <Button loading={save.isPending} onClick={() => save.mutate(config)}>Save</Button>
          </div>
        </div>
      </header>

      <Card title="Fields">
        <p className="form-note">Tick a field to make it compulsory. Unticked fields are optional but still shown on the form.</p>
        <div className="checkbox-grid">
          {fields.map((f) => (
            <label key={f.key} className="checkbox-row">
              <input
                type="checkbox"
                checked={!!config[f.key]}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.checked }))}
              />
              <span>{f.label}{f.defaultOn === false && <em className="form-note"> (optional by default)</em>}</span>
            </label>
          ))}
        </div>
        <div className="card-actions">
          <Button loading={save.isPending} onClick={() => save.mutate(config)}>Save</Button>
        </div>
      </Card>
    </div>
  );
}
