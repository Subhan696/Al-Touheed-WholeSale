import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

function BackupSettings({ currentUser }) {
  const [backupStatus, setBackupStatus] = useState('');
  const [restoreStatus, setRestoreStatus] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupHistory, setBackupHistory] = useState([]);

  useEffect(() => {
    ipcRenderer.invoke('get-backup-history').then(h => setBackupHistory(h || [])).catch(() => {});
  }, []);

  const handleBackup = async () => {
    setIsBackingUp(true); setBackupStatus('');
    try {
      const result = await ipcRenderer.invoke('create-backup');
      if (result.success) { setBackupStatus(`✅ Backup saved: ${result.path}`); ipcRenderer.invoke('get-backup-history').then(h => setBackupHistory(h || [])); }
      else setBackupStatus(`❌ ${result.error}`);
    } catch (e) { setBackupStatus(`❌ ${e.message}`); }
    setIsBackingUp(false); setTimeout(() => setBackupStatus(''), 8000);
  };

  const handleRestore = async () => {
    setIsRestoring(true); setRestoreStatus('');
    try {
      const result = await ipcRenderer.invoke('restore-backup');
      if (result.success) setRestoreStatus('✅ Restore complete — restart the app');
      else setRestoreStatus(`❌ ${result.error}`);
    } catch (e) { setRestoreStatus(`❌ ${e.message}`); }
    setIsRestoring(false); setTimeout(() => setRestoreStatus(''), 8000);
  };

  const card = (title, icon, desc, action, loading, status) => (
    <div style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: 24, flex: 1 }}>
      <div style={{ fontSize: '2rem', marginBottom: 10 }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
      <p style={{ color: '#7e8299', fontSize: '0.88rem', margin: '0 0 16px', lineHeight: 1.5 }}>{desc}</p>
      {status && <div style={{ color: status.includes('❌') ? '#f64e60' : '#3699ff', fontWeight: 600, marginBottom: 10, fontSize: '0.88rem' }}>{status}</div>}
      <button onClick={action} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 12, fontWeight: 700 }}>
        {loading ? 'Please wait...' : title}
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16, overflowY: 'auto' }}>
      <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Backup & Restore</h2>

      <div style={{ display: 'flex', gap: 16 }}>
        {card('Create Backup', '💾', 'Export all your data (products, sales, purchases, stock) to a JSON file. Save it to an external drive or cloud storage.', handleBackup, isBackingUp, backupStatus)}
        {card('Restore Backup', '📂', 'Restore data from a previously created backup file. WARNING: This will overwrite current data. Use with caution.', handleRestore, isRestoring, restoreStatus)}
      </div>

      {/* Backup History */}
      <div style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, borderBottom: '2px solid #e4e6ef', paddingBottom: 10 }}>Recent Backups</h3>
        {backupHistory.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '20px 0', fontSize: '0.9rem' }}>No backups yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {backupHistory.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderRadius: 6, border: '1px solid #e4e6ef', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', color: '#3f4254' }}>{b.filename}</span>
                  <span style={{ color: '#aaa', marginLeft: 10 }}>{b.size}</span>
                </div>
                <span style={{ color: '#7e8299' }}>{b.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ background: '#fff8e1', border: '1px solid #ffa800', borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 700, color: '#7d5e00', marginBottom: 6 }}>⚠️ Important</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#7d5e00', fontSize: '0.88rem', lineHeight: 1.6 }}>
          <li>Backups are stored locally — copy them to an external drive or cloud storage.</li>
          <li>For PostgreSQL, you can also use <code>pg_dump</code> for a full database backup.</li>
          <li>Regular backups protect against accidental deletion and hardware failure.</li>
        </ul>
      </div>
    </div>
  );
}

export default BackupSettings;
