import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

function NetworkSettings({ currentUser }) {
  const [config, setConfig] = useState(null);
  const [networkMode, setNetworkMode] = useState('server');
  const [serverAddress, setServerAddress] = useState('');
  const [networkToken, setNetworkToken] = useState('');
  const [dbHost, setDbHost] = useState('localhost');
  const [dbPort, setDbPort] = useState('5432');
  const [dbName, setDbName] = useState('atg_wholesale');
  const [dbUser, setDbUser] = useState('atg_user');
  const [dbPassword, setDbPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [localIps, setLocalIps] = useState([]);

  useEffect(() => {
    ipcRenderer.invoke('get-network-config').then(cfg => {
      if (!cfg) return;
      setConfig(cfg);
      setNetworkMode(cfg.networkMode || 'server');
      setServerAddress(cfg.serverAddress || '');
      setNetworkToken(cfg.networkToken || '');
      if (cfg.dbConfig) {
        setDbHost(cfg.dbConfig.host || 'localhost');
        setDbPort(String(cfg.dbConfig.port || '5432'));
        setDbName(cfg.dbConfig.database || 'atg_wholesale');
        setDbUser(cfg.dbConfig.user || 'atg_user');
        setDbPassword(cfg.dbConfig.password || '');
      }
    });
    ipcRenderer.invoke('get-local-ips').then(ips => setLocalIps(ips || []));
  }, []);

  const handleSave = async () => {
    const payload = { networkMode, serverAddress, networkToken, dbConfig: { host: dbHost, port: parseInt(dbPort), database: dbName, user: dbUser, password: dbPassword } };
    const result = await ipcRenderer.invoke('save-network-config', payload);
    if (result.success) {
      setStatusMsg('✅ Saved — restart app to apply changes');
      setTimeout(() => setStatusMsg(''), 5000);
    } else {
      setStatusMsg(`❌ ${result.error}`);
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = networkMode === 'server'
        ? await ipcRenderer.invoke('test-db-connection', { host: dbHost, port: parseInt(dbPort), database: dbName, user: dbUser, password: dbPassword })
        : await ipcRenderer.invoke('test-client-connection', { serverAddress, networkToken });
      setStatusMsg(result.success ? '✅ Connection successful!' : `❌ ${result.error}`);
    } catch (e) { setStatusMsg(`❌ ${e.message}`); }
    setTesting(false);
    setTimeout(() => setStatusMsg(''), 5000);
  };

  const section = (title, children) => (
    <div style={{ background: '#fff', border: '1px solid #e4e6ef', borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: '#1e1e2d', borderBottom: '2px solid #e4e6ef', paddingBottom: 10 }}>{title}</h3>
      {children}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Network Settings</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusMsg && <span style={{ color: statusMsg.includes('❌') ? '#f64e60' : '#3699ff', fontWeight: 600 }}>{statusMsg}</span>}
          <button onClick={handleTest} disabled={testing} style={{ padding: '8px 16px', border: '1px solid #e4e6ef', background: '#f3f6f9', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.9rem' }}>{testing ? 'Testing...' : '🔌 Test Connection'}</button>
          <button onClick={handleSave} className="btn btn-primary">Save Settings</button>
        </div>
      </div>

      {section('Network Mode', (
        <div style={{ display: 'flex', gap: 12 }}>
          {[['server', '🖥️ Server Mode', 'This PC hosts PostgreSQL and serves other machines over the network'], ['client', '💻 Client Mode', 'This PC connects to another PC that is running in Server Mode']].map(([val, label, desc]) => (
            <div key={val} onClick={() => setNetworkMode(val)} style={{ flex: 1, border: `2px solid ${networkMode === val ? '#3699ff' : '#e4e6ef'}`, borderRadius: 10, padding: 16, cursor: 'pointer', background: networkMode === val ? 'rgba(54,153,255,0.08)' : '#f9fafb' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: '0.82rem', color: '#7e8299', lineHeight: 1.4 }}>{desc}</div>
            </div>
          ))}
        </div>
      ))}

      {networkMode === 'server' && section('PostgreSQL Database', (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[['Host', dbHost, setDbHost, 'localhost'], ['Port', dbPort, setDbPort, '5432'], ['Database', dbName, setDbName, 'atg_wholesale'], ['Username', dbUser, setDbUser, 'atg_user']].map(([label, val, setter, ph]) => (
            <div key={label}>
              <label style={labelStyle}>{label}</label>
              <input type="text" value={val} onChange={e => setter(e.target.value)} placeholder={ph} style={inputStyle} />
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={dbPassword} onChange={e => setDbPassword(e.target.value)} style={inputStyle} />
          </div>
          {localIps.length > 0 && (
            <div style={{ gridColumn: '1 / -1', background: '#f3f6f9', border: '1px solid #e4e6ef', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5e6278', marginBottom: 8 }}>This PC's IP addresses (share with client machines):</div>
              {localIps.map(ip => (
                <div key={ip} style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: '#3699ff', marginBottom: 4 }}>{ip}</div>
              ))}
            </div>
          )}
        </div>
      ))}

      {networkMode === 'client' && section('Server Connection', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Server Address (IP:Port of server machine)</label>
            <input type="text" value={serverAddress} onChange={e => setServerAddress(e.target.value)} placeholder="e.g. 192.168.1.100:3002" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Network Token (must match server)</label>
            <input type="text" value={networkToken} onChange={e => setNetworkToken(e.target.value)} placeholder="Optional shared secret..." style={inputStyle} />
          </div>
        </div>
      ))}

      {section('API Security Token', (
        <div>
          <label style={labelStyle}>Network Token (set same value on all machines)</label>
          <input type="text" value={networkToken} onChange={e => setNetworkToken(e.target.value)} placeholder="Leave blank for no token" style={inputStyle} />
          <p style={{ color: '#7e8299', fontSize: '0.82rem', margin: '8px 0 0' }}>If set, all client machines must provide this token to connect to the server API.</p>
        </div>
      ))}

      {section('How Multi-Machine Works', (
        <div style={{ fontSize: '0.88rem', color: '#5e6278', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}><strong>1.</strong> Install PostgreSQL on the <strong>server PC</strong>. Set Server Mode here and configure the DB credentials.</p>
          <p style={{ margin: '0 0 8px' }}><strong>2.</strong> On each <strong>client PC</strong>, set Client Mode and enter the server PC's IP address and port (3002 by default).</p>
          <p style={{ margin: '0 0 8px' }}><strong>3.</strong> All machines on the same network will share real-time data automatically via Server-Sent Events.</p>
          <p style={{ margin: 0 }}>Make sure port <strong>3002</strong> is open in Windows Firewall on the server PC.</p>
        </div>
      ))}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#5e6278', textTransform: 'uppercase', marginBottom: 5 };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e4e6ef', borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: '#f9fafb', boxSizing: 'border-box' };

export default NetworkSettings;
