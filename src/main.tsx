import '@fontsource-variable/manrope';
import '@fontsource-variable/vazirmatn';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './fonts.css';
// Optional private fonts (folder is not in the public repository).
import.meta.glob('./assets/fonts-private/*.css', { eager: true });
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
