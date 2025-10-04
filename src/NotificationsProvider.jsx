// NotificationsProvider.jsx
import { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert } from '@mui/material';

const NotificationsCtx = createContext({ notify: () => {} });
export const useNotifications = () => useContext(NotificationsCtx);

export default function NotificationsProvider({ children }) {
  const [state, setState] = useState({ open: false, message: '', severity: 'info' });

  const notify = useCallback((message, options = {}) => {
    setState({ open: true, message, severity: options.severity || 'info' });
  }, []);

  return (
    <NotificationsCtx.Provider value={{ notify }}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={5000}
        onClose={() => setState((s) => ({ ...s, open:false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setState((s) => ({ ...s, open:false }))}
          severity={state.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </NotificationsCtx.Provider>
  );
}
