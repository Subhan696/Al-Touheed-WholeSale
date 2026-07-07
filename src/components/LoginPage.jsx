import React, { useState, useRef } from 'react';
import './LoginPage.css';

const { ipcRenderer } = window.require('electron');

function LoginPage({ onLoginSuccess, onOpenNetworkSettings }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usersExist, setUsersExist] = useState(true);
  const [dbError, setDbError] = useState(null);
  const passwordRef = useRef(null);

  React.useEffect(() => {
    // Check database status first
    ipcRenderer.invoke('get-db-status').then(status => {
      if (status && !status.connected && status.error) {
        setDbError(status.error);
      }
    }).catch(() => {});

    ipcRenderer.invoke('check-any-users').then(exists => {
      setUsersExist(exists);
      if (!exists) setIsRegistering(true);
    }).catch(() => setUsersExist(true));
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) { setMessage('❌ Please fill in all fields'); return; }
    setIsLoading(true);
    const result = await ipcRenderer.invoke('login', { username, password });
    if (result.success) {
      setMessage('✅ Login successful!');
      setTimeout(() => onLoginSuccess(result.userId, result.username, result.password, result.role, result.permissions), 400);
    } else {
      setMessage(`❌ ${result.error}`);
    }
    setIsLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!username || !password || !confirmPassword) { setMessage('❌ Please fill in all fields'); return; }
    if (password !== confirmPassword) { setMessage('❌ Passwords do not match'); return; }
    if (password.length < 4) { setMessage('❌ Password must be at least 4 characters'); return; }
    setIsLoading(true);
    const result = await ipcRenderer.invoke('register', { username, password });
    if (result.success) {
      setMessage('✅ Account created! Please login.');
      setTimeout(() => { setIsRegistering(false); setUsername(''); setPassword(''); setConfirmPassword(''); setMessage(''); ipcRenderer.invoke('check-any-users').then(setUsersExist); }, 1000);
    } else {
      setMessage(`❌ ${result.error}`);
    }
    setIsLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="app-title">🏭 Al-Touheed</h1>
          <p className="app-subtitle" style={{ fontWeight: 700, color: '#3699ff', letterSpacing: 2 }}>WHOLESALE</p>
          <p className="app-subtitle">Inventory Management System</p>
        </div>

        {dbError && (
          <div className="db-error-banner">
            <div className="db-error-icon">⚠️</div>
            <div className="db-error-text">
              <strong>Database not connected</strong>
              <p>PostgreSQL is not running on this PC. If this is a client machine, click <strong>Network Settings</strong> below to connect to the server PC.</p>
            </div>
          </div>
        )}

        <form onSubmit={isRegistering ? handleRegister : handleLogin} className="login-form">
          <h2 className="form-title">{isRegistering ? 'Create Account' : 'Login'}</h2>
          <div className="form-group">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); } }}
              placeholder="Enter username" className="form-input" disabled={isLoading} autoFocus />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" className="form-input" ref={passwordRef} disabled={isLoading} />
          </div>
          {isRegistering && (
            <div className="form-group">
              <label>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password" className="form-input" disabled={isLoading} />
            </div>
          )}
          {message && <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}
          <button type="submit" className="btn-submit" disabled={isLoading || !!dbError}>
            {isLoading ? 'Loading...' : isRegistering ? 'Create Account' : 'Login'}
          </button>
        </form>
        {!usersExist && (
          <div className="form-footer">
            <p>
              {isRegistering ? 'Already have an account?' : "Don't have an account?"}
              <button type="button" className="toggle-btn" onClick={() => { setIsRegistering(!isRegistering); setMessage(''); setUsername(''); setPassword(''); setConfirmPassword(''); }}>
                {isRegistering ? 'Login' : 'Sign Up'}
              </button>
            </p>
          </div>
        )}
        {onOpenNetworkSettings && (
          <div className="network-settings-footer">
            <button type="button" className="btn-network-settings" onClick={onOpenNetworkSettings}>
              ⚙️ Network Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
