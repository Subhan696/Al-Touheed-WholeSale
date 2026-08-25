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
  const [masterPassword, setMasterPassword] = useState('');
  const [isSettingUpDb, setIsSettingUpDb] = useState(false);
  const [setupError, setSetupError] = useState('');
  const passwordRef = useRef(null);

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [storedUsername, setStoredUsername] = useState('');
  const [storedPassword, setStoredPassword] = useState('');
  const otpRef = useRef(null);

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

  const handleSetupDatabase = async () => {
    if (!masterPassword) { setSetupError('Please enter the PostgreSQL master password.'); return; }
    setIsSettingUpDb(true);
    setSetupError('');
    const result = await ipcRenderer.invoke('setup-database', masterPassword);
    if (result.success) {
      setDbError(null);
      // Recheck users
      const exists = await ipcRenderer.invoke('check-any-users').catch(()=>true);
      setUsersExist(exists);
      if (!exists) setIsRegistering(true);
    } else {
      setSetupError(`Failed: ${result.error}`);
    }
    setIsSettingUpDb(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) { setMessage('❌ Please fill in all fields'); return; }
    setIsLoading(true);
    const result = await ipcRenderer.invoke('login', { username, password });
    if (result.success) {
      setMessage('✅ Login successful!');
      setTimeout(() => onLoginSuccess(result.userId, result.username, result.password, result.role, result.permissions), 400);
    } else if (result.requiresOtp) {
      // OTP required - switch to OTP step
      setStoredUsername(username);
      setStoredPassword(password);
      setOtpStep(true);
      setOtpMessage(result.message || 'OTP sent to your email');
      setOtp('');
      setMessage('');
      setTimeout(() => otpRef.current?.focus(), 200);
    } else {
      setMessage(`❌ ${result.error}`);
    }
    setIsLoading(false);
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) { setMessage('❌ Please enter 6-digit OTP'); return; }
    setIsLoading(true);
    const result = await ipcRenderer.invoke('login', { username: storedUsername, password: storedPassword, otp });
    if (result.success) {
      setMessage('✅ Login successful!');
      setTimeout(() => onLoginSuccess(result.userId, result.username, result.password, result.role, result.permissions), 400);
    } else {
      setMessage(`❌ ${result.error}`);
    }
    setIsLoading(false);
  };

  const handleBackFromOtp = () => {
    setOtpStep(false);
    setOtp('');
    setOtpMessage('');
    setStoredUsername('');
    setStoredPassword('');
    setMessage('');
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    setMessage('');
    const result = await ipcRenderer.invoke('login', { username: storedUsername, password: storedPassword });
    if (result.requiresOtp) {
      setOtpMessage(result.message || 'OTP re-sent to your email');
      setOtp('');
    } else if (result.error) {
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
          <div className="db-error-banner" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="db-error-icon">⚠️</div>
              <div className="db-error-text">
                <strong>Database not connected</strong>
                <p>PostgreSQL is not running on this PC. If this is a client machine, click <strong>Network Settings</strong> below to connect to the server PC.</p>
              </div>
            </div>
            <div style={{ marginTop: '10px', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
              <strong style={{ color: '#991b1b', fontSize: '0.9rem' }}>Auto-Setup Database</strong>
              <p style={{ color: '#7f1d1d', fontSize: '0.8rem', margin: '4px 0 8px 0' }}>Enter your PostgreSQL Master Password to automatically create the database.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="password" 
                  placeholder="Master Password" 
                  value={masterPassword} 
                  onChange={(e) => setMasterPassword(e.target.value)}
                  style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  disabled={isSettingUpDb}
                />
                <button 
                  type="button"
                  onClick={handleSetupDatabase}
                  disabled={isSettingUpDb}
                  style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0 12px', borderRadius: '4px', cursor: isSettingUpDb ? 'wait' : 'pointer' }}
                >
                  {isSettingUpDb ? 'Setting up...' : 'Setup DB'}
                </button>
              </div>
              {setupError && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '6px' }}>{setupError}</div>}
            </div>
          </div>
        )}

        {otpStep ? (
          /* OTP Verification Step */
          <form onSubmit={handleOtpSubmit} className="login-form">
            <h2 className="form-title">🔐 OTP Verification</h2>
            <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: '0.88rem', color: '#004085' }}>
              {otpMessage}
            </div>
            <div className="form-group">
              <label>Enter 6-digit OTP</label>
              <input 
                type="text" 
                value={otp} 
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                }}
                placeholder="000000" 
                className="form-input" 
                ref={otpRef}
                disabled={isLoading}
                style={{ letterSpacing: '8px', fontSize: '1.4rem', textAlign: 'center', fontWeight: 700 }}
                maxLength={6}
              />
            </div>
            {message && <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}
            <button type="submit" className="btn-submit" disabled={isLoading || otp.length !== 6}>
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button type="button" onClick={handleBackFromOtp} className="toggle-btn" style={{ fontSize: '0.88rem' }}>
                ← Back to Login
              </button>
              <button type="button" onClick={handleResendOtp} className="toggle-btn" disabled={isLoading} style={{ fontSize: '0.88rem', color: '#3699ff' }}>
                📧 Resend OTP
              </button>
            </div>
          </form>
        ) : (
          /* Normal Login/Register Form */
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
        )}

        {!usersExist && !otpStep && (
          <div className="form-footer">
            <p>
              {isRegistering ? 'Already have an account?' : "Don't have an account?"}
              <button type="button" className="toggle-btn" onClick={() => { setIsRegistering(!isRegistering); setMessage(''); setUsername(''); setPassword(''); setConfirmPassword(''); }}>
                {isRegistering ? 'Login' : 'Sign Up'}
              </button>
            </p>
          </div>
        )}
        {onOpenNetworkSettings && !otpStep && (
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
