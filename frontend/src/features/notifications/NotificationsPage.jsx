import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { Button, Card, Input } from '../../components/ui';
import './NotificationsPage.css';

function applicationKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

export function NotificationsPage() {
  const client = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const inbox = useQuery({ queryKey: ['notifications'], queryFn: () => api.getRaw('/notifications') });
  const authority = useQuery({ queryKey: ['notification-authority'], queryFn: () => api.get('/notifications/broadcast/authority') });
  const history = useQuery({ queryKey: ['notification-broadcasts'], queryFn: () => api.get('/notifications/broadcast/history'), enabled: authority.data?.allowed === true });

  const enablePush = useMutation({
    mutationFn: async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Browser push notifications are not supported on this device.');
      const config = await api.get('/notifications/config');
      if (!config.pushConfigured || !config.publicKey) throw new Error('Browser push is not configured by the platform administrator.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted. You can change it in your browser site settings.');
      const registration = await navigator.serviceWorker.register('/push-worker.js');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) });
      return api.post('/notifications/subscriptions', subscription.toJSON());
    },
    onSuccess: () => toast.add('Browser notifications are enabled.', 'success'),
    onError: error => toast.add(error.message, 'error'),
  });

  const send = useMutation({
    mutationFn: () => api.post('/notifications/broadcast', { title, message }),
    onSuccess: result => {
      setTitle(''); setMessage('');
      client.invalidateQueries({ queryKey: ['notifications'] });
      client.invalidateQueries({ queryKey: ['notification-broadcasts'] });
      toast.add(`Message sent to ${result.broadcast.recipientCount} active users.`, 'success');
    },
    onError: error => toast.add(error.message, 'error'),
  });

  const markRead = useMutation({ mutationFn: id => api.post(`/notifications/${id}/read`, {}), onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }) });
  const rows = inbox.data?.data || [];

  return <div className="page notification-page">
    <header className="page-header"><div><h1>Notifications</h1><p>Organisation messages and important HRMS updates.</p></div><Button variant="secondary" onClick={() => enablePush.mutate()} loading={enablePush.isPending}>Enable browser notifications</Button></header>
    {authority.data?.allowed && <Card title="Broadcast a message">
      <form className="notification-composer" onSubmit={event => { event.preventDefault(); send.mutate(); }}>
        <Input id="broadcast-title" label="Title" required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="Short subject" />
        <div className="field notification-message-field"><label className="field-label" htmlFor="broadcast-message">Message <span className="field-required">*</span></label><textarea id="broadcast-message" className="input" required maxLength={500} rows={4} value={message} onChange={event => setMessage(event.target.value)} placeholder="Write a concise organisation-wide message." /><p className="field-hint">Sent to all active organisation users. Do not include confidential employee or payroll data. {message.length}/500</p></div>
        <div className="notification-composer-action"><Button type="submit" loading={send.isPending} disabled={title.trim().length < 3 || message.trim().length < 5}>Send broadcast</Button></div>
      </form>
    </Card>}
    <div className="notification-layout">
      <Card title="Inbox" noPadding>
        {inbox.isLoading ? <p className="notification-state">Loading notifications…</p> : !rows.length ? <p className="notification-state">No notifications yet. New organisation messages will appear here.</p> : <ul className="notification-list">{rows.map(row => <li key={row.id} className={row.readAt ? '' : 'is-unread'}><button type="button" onClick={() => !row.readAt && markRead.mutate(row.id)}><span className="notification-list-heading"><strong>{row.title}</strong>{!row.readAt && <span>New</span>}</span><p>{row.message}</p><small>{row.sender} · {new Date(row.createdAt).toLocaleString('en-IN')}</small></button></li>)}</ul>}
      </Card>
      {authority.data?.allowed && <Card title="Recent broadcasts" noPadding>{!history.data?.rows?.length ? <p className="notification-state">No broadcasts have been sent.</p> : <ul className="notification-history">{history.data.rows.map(row => <li key={row.id}><strong>{row.title}</strong><span>{row.recipientCount} recipients · {row.deliveredCount} browser deliveries</span><small>{new Date(row.createdAt).toLocaleString('en-IN')}</small></li>)}</ul>}</Card>}
    </div>
  </div>;
}

export default NotificationsPage;
