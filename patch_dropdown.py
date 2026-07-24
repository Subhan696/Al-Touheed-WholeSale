import re

with open(r'd:\projects\SHOP\src\components\NewPurchase.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add a state for dropdown visibility
state_find = """  const [checkingSession, setCheckingSession] = useState(false);"""
state_replace = """  const [checkingSession, setCheckingSession] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);"""
content = content.replace(state_find, state_replace)

# Replace the input and datalist with a professional custom dropdown
input_find = """                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="number"
                    value={sessionId}
                    onChange={e => {
                      setSessionId(e.target.value);
                      if (e.target.value) {
                        setToSession(e.target.value); // Auto-fill 'to' session when 'from' is typed
                      }
                    }}
                    onBlur={handleCheckSession}
                    placeholder="e.g. 1"
                    list="recent-sessions-list"
                    className="form-control"
                    style={{ 
                      borderColor: '#3b82f6', 
                      boxShadow: '0 0 0 3px rgba(59,130,246,0.2)'
                    }}
                  />
                  <div style={{ flexShrink: 0, width: 24 }}>
                    {checkingSession && <div className="spinner" style={{ width: 16, height: 16, borderTopColor: '#3b82f6' }} />}
                  </div>
                </div>
  
                <datalist id="recent-sessions-list">
                  {recentSessions.map(s => (
                    <option key={s.session_id} value={s.session_id}>
                      Session {s.session_id} ({s.brand || 'No Brand'}) by {s.created_by || 'Unknown'} — {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </option>
                  ))}
                </datalist>"""
                
input_replace = """                <div style={{ display: 'flex', gap: 10, alignItems: 'center', position: 'relative' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="number"
                      value={sessionId}
                      onChange={e => {
                        setSessionId(e.target.value);
                        if (e.target.value) {
                          setToSession(e.target.value);
                        }
                      }}
                      onFocus={() => setShowSessionDropdown(true)}
                      onBlur={(e) => {
                        // Delay hide to allow click on dropdown
                        setTimeout(() => setShowSessionDropdown(false), 200);
                        handleCheckSession(e);
                      }}
                      placeholder="Type session number..."
                      className="form-control"
                      style={{ 
                        borderColor: '#3b82f6', 
                        boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
                        width: '100%'
                      }}
                    />
                    {showSessionDropdown && recentSessions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                        backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        maxHeight: '200px', overflowY: 'auto', marginTop: '4px'
                      }}>
                        {recentSessions.map(s => (
                          <div 
                            key={s.session_id}
                            onMouseDown={() => {
                              setSessionId(s.session_id);
                              setToSession(s.session_id);
                              setShowSessionDropdown(false);
                              handleCheckSession({ target: { value: s.session_id } });
                            }}
                            style={{
                              padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                              display: 'flex', flexDirection: 'column'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                          >
                            <span style={{ fontWeight: '600', color: '#1f2937', fontSize: '0.9rem' }}>Session {s.session_id}</span>
                            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                              {s.brand || 'No Brand'} by {s.created_by || 'Unknown'} — {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, width: 24 }}>
                    {checkingSession && <div className="spinner" style={{ width: 16, height: 16, borderTopColor: '#3b82f6' }} />}
                  </div>
                </div>"""
content = content.replace(input_find, input_replace)

with open(r'd:\projects\SHOP\src\components\NewPurchase.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("NewPurchase.jsx custom dropdown added")
