import { api } from '@/lib/api';

interface AuditLogEntry {
  action: string;
  category: 'firewall' | 'validator' | 'token' | 'node' | 'config' | 'auth' | 'general';
  target_type?: string;
  target_id?: string;
  details?: Record<string, any>;
}

export const logAuditEvent = async (
  userId: string,
  userEmail: string | null,
  entry: AuditLogEntry
) => {
  try {
    await api.post('/api/audit-logs', {
      user_id: userId,
      user_email: userEmail,
      action: entry.action,
      category: entry.category,
      target_type: entry.target_type || null,
      target_id: entry.target_id || null,
      details: entry.details || {},
    });
  } catch (e) {
    console.error('Audit log failed:', e);
  }
};
