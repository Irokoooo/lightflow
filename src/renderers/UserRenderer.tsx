import React from 'react';

interface UserRendererProps {
  value: any;
}

const UserRenderer: React.FC<UserRendererProps> = ({ value }) => {
  if (!value) {
    return (
      <span
        className="field-empty-with-hint"
        title="该用户不在你的飞书联系人中（可能已离职/跨组织），插件无法读取详情"
      >
        👤 暂无（无访问权限）
      </span>
    );
  }

  if (!Array.isArray(value)) {
    return <span className="field-empty">👤 暂无（数据格式异常）</span>;
  }

  const validUsers = value.filter((u: any) => u != null);

  if (validUsers.length === 0) {
    return (
      <span
        className="field-empty-with-hint"
        title="该用户不在你的飞书联系人中（可能已离职/跨组织），插件无法读取详情"
      >
        👤 暂无（无访问权限）
      </span>
    );
  }

  return (
    <div className="renderer-user">
      <div className="user-list">
        {validUsers.map((user: any, idx: number) => {
          const name = user.name || user.en_name || '未知用户';
          const key = user.id || user.open_id || `user-${idx}`;
          return (
            <div key={key} className="user-item">
              {user.avatar?.url && (
                <img
                  src={user.avatar.url}
                  className="user-avatar"
                  alt=""
                />
              )}
              <span className="user-name">{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UserRenderer;