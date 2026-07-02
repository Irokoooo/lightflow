import React, { useState } from 'react';

interface AudioPreviewProps {
  url: string;
  name: string;
}

const AudioPreview: React.FC<AudioPreviewProps> = ({ url, name }) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="attachment-preview-fallback">
        <span className="fallback-icon">🎵</span>
        <span className="fallback-name">{name}</span>
      </div>
    );
  }

  return (
    <div className="audio-preview">
      <div className="audio-header">
        <span className="audio-icon">🎵</span>
        <span className="audio-name">{name}</span>
      </div>
      <audio
        src={url}
        controls
        preload="metadata"
        onError={() => setError(true)}
      >
        您的浏览器不支持音频播放。
      </audio>
    </div>
  );
};

export default AudioPreview;
