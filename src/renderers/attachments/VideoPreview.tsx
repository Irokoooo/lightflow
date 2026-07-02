import React, { useState } from 'react';

interface VideoPreviewProps {
  url: string;
  name: string;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ url, name }) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="attachment-preview-fallback">
        <span className="fallback-icon">🎬</span>
        <span className="fallback-name">{name}</span>
      </div>
    );
  }

  return (
    <div className="video-preview">
      <div className="video-name">{name}</div>
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => setError(true)}
      >
        您的浏览器不支持视频播放。
      </video>
    </div>
  );
};

export default VideoPreview;
