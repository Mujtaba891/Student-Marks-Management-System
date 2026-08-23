import './index.css';
import { AppRenderer } from './ui/appRenderer';

// Initialize the pure TypeScript MarksMaster UI application
document.addEventListener('DOMContentLoaded', () => {
  const app = new AppRenderer();
  app.init();
});

// Fallback in case DOMContentLoaded has already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  const app = new AppRenderer();
  app.init();
}
