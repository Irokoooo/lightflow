import React from 'react';

interface KeyboardHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { key: 'J / K', description: '上一条 / 下一条记录' },
  { key: 'P', description: '标记 Pass' },
  { key: 'F', description: '标记 Fail' },
  { key: 'Space', description: '标记 暂停' },
  { key: '1 / 2 / 3', description: '标记最佳 Response（对比视图）' },
  { key: 'Cmd+1 ~ Cmd+5', description: '切换视图' },
  { key: '?', description: '显示/隐藏快捷键帮助' },
];

const KeyboardHelp: React.FC<KeyboardHelpProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="keyboard-help-overlay" onClick={onClose}>
      <div className="keyboard-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="keyboard-help-header">
          <h3>⌨️ 快捷键</h3>
          <button className="keyboard-help-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="keyboard-help-body">
          {shortcuts.map((item, idx) => (
            <div key={idx} className="keyboard-shortcut-row">
              <kbd className="keyboard-key">{item.key}</kbd>
              <span className="keyboard-desc">{item.description}</span>
            </div>
          ))}
        </div>
        <div className="keyboard-help-footer">
          提示：在输入框中输入时快捷键会自动禁用
        </div>
      </div>
    </div>
  );
};

export default KeyboardHelp;
