import React, { createContext, useContext, useEffect, useState } from 'react';

const DataContext = createContext({});

export function DataProvider({ children }) {
  const [versions, setVersions] = useState({});

  function bump(type) {
    setVersions(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
  }

  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    let es = null;

    ipcRenderer.invoke('get-network-settings').then(s => {
      if (!s) return;
      const address = s.networkMode === 'server' ? 'http://localhost:3002' : (s.serverAddress || '');
      const token = s.networkToken || '';
      if (!address) return;

      es = new EventSource(`${address}/api/events?token=${encodeURIComponent(token)}`);
      es.onmessage = (e) => {
        try {
          const { type } = JSON.parse(e.data);
          if (type && type !== 'connected') bump(type);
        } catch {}
      };
    });

    return () => { if (es) es.close(); };
  }, []);

  return <DataContext.Provider value={versions}>{children}</DataContext.Provider>;
}

export function useDataVersion(type) {
  const versions = useContext(DataContext);
  return versions[type] || 0;
}
