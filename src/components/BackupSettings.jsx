import React, { useState, useEffect } from 'react';
import './UserManagement.css';

const { ipcRenderer } = window.require('electron');

function BackupSettings() {
    const [settings, setSettings] = useState({ backupPath: '', lastBackupTime: null, dailySnapshots: [] });
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [restoreTarget, setRestoreTarget] = useState(null); 
    const [restoreConfirm, setRestoreConfirm] = useState(false);
    
    // Connection detection state
    const [hasExistingBackup, setHasExistingBackup] = useState(false);

    const loadSettings = async () => {
        const s = await ipcRenderer.invoke('get-backup-settings');
        setSettings(s);
        // If we have a path, check if it has a backup (initial load)
        if (s.backupPath) {
            const check = await ipcRenderer.invoke('set-backup-path', s.backupPath);
            setHasExistingBackup(check.hasExistingBackup);
        }
    };

    useEffect(() => { loadSettings(); }, []);

    const fmtTime = (iso) => {
        if (!iso) return 'Never';
        try {
            return new Date(iso).toLocaleString('en-PK', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            });
        } catch { return iso; }
    };

    const fmtSize = (bytes) => {
        if (!bytes) return '';
        if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${Math.round(bytes / 1024)} KB`;
    };

    const browse = async () => {
        const result = await ipcRenderer.invoke('select-backup-dir');
        if (result) {
            setSettings(s => ({ ...s, backupPath: result }));
            // Check if drive already has data
            const check = await ipcRenderer.invoke('set-backup-path', result);
            setHasExistingBackup(check.hasExistingBackup);
            setStatus('✅ Drive connected. ' + (check.hasExistingBackup ? 'Existing backup found.' : 'No backup found.'));
        }
    };

    const connectDrive = async () => {
        setLoading(true); setStatus('');
        const result = await ipcRenderer.invoke('set-backup-path', settings.backupPath);
        if (result.success) {
            setHasExistingBackup(result.hasExistingBackup);
            setStatus('✅ ' + result.message);
            loadSettings();
        } else {
            setStatus('❌ ' + result.error);
        }
        setLoading(false);
    };

    const performInitialBackup = async () => {
        setLoading(true);
        setStatus('Performing initial backup...');
        const result = await ipcRenderer.invoke('test-backup');
        if (result.success) {
            setStatus('✅ Initial backup successful. Auto-backup is now active.');
            loadSettings();
        } else {
            setStatus('❌ ' + result.error);
        }
        setLoading(false);
    };

    const disable = async () => {
        setLoading(true);
        await ipcRenderer.invoke('set-backup-path', '');
        setStatus('⚪ Auto-backup disabled.');
        setSettings(s => ({ ...s, backupPath: '', dailySnapshots: [] }));
        setHasExistingBackup(false);
        setLoading(false);
    };

    const test = async () => {
        setLoading(true); setStatus('Testing backup...');
        const result = await ipcRenderer.invoke('test-backup');
        if (result.success) { setStatus('✅ Backup test succeeded!'); loadSettings(); }
        else setStatus('❌ ' + result.error);
        setLoading(false);
    };

    const restore = async () => {
        setLoading(true); setStatus('Restoring...');
        const filePath = restoreTarget ? restoreTarget.path : null;
        const result = await ipcRenderer.invoke('restore-from-backup', filePath);
        if (result.success) {
            setStatus('✅ ' + result.message);
        } else {
            setStatus('❌ ' + result.error);
        }
        setRestoreConfirm(false);
        setRestoreTarget(null);
        setLoading(false);
    };

    const isActive = !!settings.backupPath;

    return (
        <div className="user-management-container">
            <div className="header-row"><h2>💾 Auto Backup & Restore</h2></div>

            {/* Status Banner */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                borderRadius: 10, marginBottom: 24,
                background: settings.isDriveConnected ? '#f0fdf4' : (isActive ? '#fef2f2' : '#fef3c7'),
                border: `1px solid ${settings.isDriveConnected ? '#86efac' : (isActive ? '#fca5a5' : '#fcd34d')}`,
            }}>
                <span style={{ fontSize: 28 }}>{settings.isDriveConnected ? '🟢' : (isActive ? '🔴' : '🟡')}</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: settings.isDriveConnected ? '#15803d' : (isActive ? '#b91c1c' : '#92400e') }}>
                        {settings.isDriveConnected ? 'Backup Drive Connected' : (isActive ? 'Drive Letter Changed or Disconnected' : 'Auto-Backup Not Configured')}
                    </div>
                    {isActive ? (
                        <div style={{ fontSize: '0.85rem', color: settings.isDriveConnected ? '#166534' : '#991b1b' }}>
                            {settings.isDriveConnected ? (
                                <>Path: <strong>{settings.backupPath}</strong> &nbsp;|&nbsp; Last backup: <strong>{fmtTime(settings.lastBackupTime)}</strong></>
                            ) : (
                                <>Current config: <strong>{settings.backupPath}</strong>. <br/> Please plug in your USB or re-select the folder if the drive letter changed.</>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.85rem', color: '#78350f' }}>Select a USB drive to enable auto-backup or restore your data.</div>
                    )}
                </div>
                {isActive && (
                    <button className="btn btn-secondary" onClick={disable} style={{ color: '#dc2626', fontSize: '0.8rem', padding: '4px 10px' }}>
                        Disconnect Drive
                    </button>
                )}
            </div>

            {/* Connection / Initial Setup */}
            <div style={{ background: 'white', borderRadius: 10, padding: 24, border: '1px solid #e5e7eb', marginBottom: 20 }}>
                <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: '1rem' }}>Step 1: Connect Backup Drive</h3>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <input
                        type="text" value={settings.backupPath}
                        onChange={e => setSettings(s => ({ ...s, backupPath: e.target.value }))}
                        placeholder="e.g. E:\ or D:\Backups"
                        style={{ flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontFamily: 'monospace' }}
                        disabled={loading}
                    />
                    <button className="btn btn-secondary" onClick={browse} style={{ whiteSpace: 'nowrap' }} disabled={loading}>📁 Browse</button>
                    {!isActive && (
                         <button className="btn btn-primary" onClick={connectDrive} disabled={loading || !settings.backupPath}>🔗 Connect</button>
                    )}
                </div>

                {isActive && (
                    <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {hasExistingBackup ? '✅ Existing Backup Found' : 'ℹ️ No Backup Found on Drive'}
                        </div>
                        
                        <div style={{ display: 'flex', gap: 12 }}>
                            {hasExistingBackup ? (
                                <>
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ background: '#059669' }} 
                                        onClick={() => { setRestoreTarget(null); setRestoreConfirm(true); }}
                                        disabled={loading}
                                    >
                                        🔁 Restore Data from USB
                                    </button>
                                    <button className="btn btn-secondary" onClick={test} disabled={loading}>
                                        🔄 Manual Backup Now
                                    </button>
                                </>
                            ) : (
                                <button className="btn btn-primary" onClick={performInitialBackup} disabled={loading}>
                                    💾 Start Initial Backup
                                </button>
                            )}
                        </div>
                         {status && (
                            <div style={{
                                marginTop: 14, fontWeight: 600, fontSize: '0.9rem',
                                color: status.startsWith('✅') ? '#15803d' : status.startsWith('❌') ? '#dc2626' : '#374151',
                            }}>{status}</div>
                        )}
                    </div>
                )}
            </div>

            {/* Daily Snapshots */}
            {isActive && (
                <div style={{ background: 'white', borderRadius: 10, padding: 24, border: '1px solid #e5e7eb', marginBottom: 20 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: '1rem' }}>🗓️ Daily Snapshots</h3>
                    <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 16 }}>
                        One snapshot is kept per day (last 30 days). You can restore from any previous date.
                    </p>

                    {settings.dailySnapshots?.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#f3f4f6' }}>
                                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Date</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Size</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {settings.dailySnapshots.map((snap, i) => (
                                    <tr key={snap.date} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '8px 12px' }}>
                                            {snap.date} {i === 0 && <span style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', marginLeft: 6 }}>Latest</span>}
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280' }}>{fmtSize(snap.size)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '4px 12px', fontSize: '0.8rem', color: '#dc2626' }}
                                                onClick={() => { setRestoreTarget(snap); setRestoreConfirm(true); }}
                                                disabled={loading}
                                            >
                                                🔁 Restore
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>No daily snapshots yet.</div>
                    )}

                    {/* Confirm dialog */}
                    {restoreConfirm && (
                        <div style={{ marginTop: 20, padding: '16px 20px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10 }}>
                            <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 8, fontSize: '1rem' }}>
                                ⚠️ Restore from: <code>{restoreTarget ? restoreTarget.date : 'Latest USB Backup'}</code>?
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: 16, lineHeight: 1.5 }}>
                                <strong>Safety Mode Active:</strong> Auto-backup has been paused. <br/>
                                A local safety copy (<code>.before-restore</code>) will be created.<br/>
                                Your current data will be swapped with the USB backup.
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-primary" style={{ background: '#dc2626' }} onClick={restore} disabled={loading}>
                                    {loading ? 'Restoring...' : 'Yes, Restore Now'}
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setRestoreConfirm(false); setRestoreTarget(null); }}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Info */}
            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: 20, border: '1px solid #bae6fd' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#0369a1' }}>🛡️ Robust Restore Protection</h4>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem', color: '#075985', lineHeight: 2 }}>
                    <li><strong>Restore Mode</strong>: Auto-backup is completely locked while a restoration is in progress.</li>
                    <li><strong>No Auto-Overwrite</strong>: Connecting a new drive will <strong>never</strong> overwrite existing data automatically.</li>
                    <li><strong>Blank Check</strong>: Empty systems are forbidden from overwriting USB backups.</li>
                    <li><strong>Daily snapshots</strong>: Keeps a historical record of your data for the last 30 days.</li>
                </ul>
            </div>
        </div>
    );
}

export default BackupSettings;
