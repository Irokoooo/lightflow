import ReactDOM from 'react-dom/client'
import './App.css';
import App from './App';
import LoadApp from './components/LoadApp';
import { AppBootBoundary } from './components/AppBootBoundary';

// 路由规则：本插件是 sidebar 插件（iframe 嵌入），不强制用 router；
// 如需添加，请用 HashRouter/createWebHashHistory 避免 history 路由 404。
const boot = (window as any).__LIGHTFLOW_BOOT__;
boot?.setStatus?.('LightFlow 启动探针：JS 已执行，准备挂载 React...', 'ok');
// import './locales/i18n' // 支持国际化
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <AppBootBoundary>
    <LoadApp>
      <App />
    </LoadApp>
  </AppBootBoundary>
)

window.setTimeout(() => {
  boot?.hide?.();
}, 1200);
