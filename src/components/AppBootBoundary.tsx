import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

export class AppBootBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unknown error',
      errorStack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[LightFlow Boot Error]', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const win = typeof window !== 'undefined' ? (window as any) : {};
    const hasBitable = typeof win.bitable !== 'undefined';
    const hasLark = typeof win.lark !== 'undefined';
    const hasLarkAi = !!win.lark?.ai;

    return (
      <div style={{ padding: 16, fontFamily: 'sans-serif', color: '#1f2329' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          LightFlow 启动失败
        </div>
        <div style={{ marginBottom: 12, fontSize: 13, color: '#4e5969' }}>
          应用没有正常渲染。现在不会再白屏了，请把下面这块信息发给我。
        </div>
        <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>错误信息</div>
          <div style={{ fontSize: 12, wordBreak: 'break-word' }}>{this.state.errorMessage}</div>
        </div>
        <div style={{ background: '#f7f8fa', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>环境探针</div>
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div>`window.bitable`: {String(hasBitable)}</div>
            <div>`window.lark`: {String(hasLark)}</div>
            <div>`window.lark.ai`: {String(hasLarkAi)}</div>
            <div>URL: {win.location?.href || ''}</div>
          </div>
        </div>
        {this.state.errorStack && (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.5, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, overflow: 'auto' }}>
            {this.state.errorStack}
          </pre>
        )}
      </div>
    );
  }
}
