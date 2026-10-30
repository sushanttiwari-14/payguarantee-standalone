import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import Landing from './Landing';
import Proof from './Proof';

const currentUrl = new URL(window.location.href);
// Already-created sandbox orders may still return to the original root callback.
if (currentUrl.pathname === '/' && currentUrl.searchParams.has('paypal')) {
  currentUrl.pathname = '/app';
  currentUrl.searchParams.set('view', 'connections');
  window.history.replaceState(null, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
}
const showLanding = currentUrl.pathname === '/';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{showLanding ? <Landing /> : currentUrl.pathname === '/proof' ? <Proof /> : <App />}</React.StrictMode>);
