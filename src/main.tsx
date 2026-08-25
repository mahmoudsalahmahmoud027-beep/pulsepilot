import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {PulsePilotProvider} from './context/PulsePilotContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PulsePilotProvider>
      <App />
    </PulsePilotProvider>
  </StrictMode>,
);
