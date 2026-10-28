import { createRoot } from 'react-dom/client';
import { AgentStore } from './store.js';
import App from './App.jsx';

let mounted = null;

export function mountAgent(root, ctx) {
  if (!mounted || mounted.root !== root) {
    if (mounted && mounted.react) mounted.react.unmount();
    root.innerHTML = '';
    const store = new AgentStore();
    const react = createRoot(root);
    react.render(<App store={store} />);
    mounted = { root, store, react };
    window.__mapusAgent = store;
  }
  mounted.store.attach(ctx);
}
