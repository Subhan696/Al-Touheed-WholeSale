import React, { createContext, useContext, useEffect, useState } from 'react';

const DataContext = createContext({});

export function DataProvider({ children }) {
  const [versions, setVersions] = useState({});

  function bump(type) {
    setVersions(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
  }

  useEffect(() => {
    let isMounted = true;
    let es = null;

    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('get-network-settings').then(s => {
        if (!isMounted || !s) return;
        let address = s.networkMode === 'server' ? 'http://localhost:3002' : (s.serverAddress || '');
        if (address && !/^https?:\/\//i.test(address)) address = `http://${address}`;
        const token = s.networkToken || '';
        if (!address) return;

        es = new EventSource(`${address}/api/events?token=${encodeURIComponent(token)}`);
        es.onmessage = (e) => {
          if (!isMounted) return;
          try {
            const { type } = JSON.parse(e.data);
            if (type && type !== 'connected') bump(type);
          } catch { }
        };
        es.onerror = () => {
          // EventSource automatically handles reconnection
        };
      }).catch(() => { });
    } catch { }

    return () => {
      isMounted = false;
      if (es) {
        try { es.close(); } catch { }
      }
    };
  }, []);

  return <DataContext.Provider value={versions}>{children}</DataContext.Provider>;
}

export function useDataVersion(type) {
  const versions = useContext(DataContext);
  return (versions && versions[type]) || 0;
}

