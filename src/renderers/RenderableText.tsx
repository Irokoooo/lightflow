import React from 'react';
import { MarkdownRender } from '../components/MarkdownRender';

interface RenderableTextProps {
  content: string;
  enableRichRender?: boolean;
  className?: string;
  variant?: 'default' | 'reading';
}

const RenderableText: React.FC<RenderableTextProps> = ({
  content,
  enableRichRender = true,
  className = '',
  variant = 'default',
}) => {
  if (!enableRichRender) {
    return <div className={`renderer-plain-text ${className}`}>{content}</div>;
  }

  return (
    <div className={className}>
      <MarkdownRender content={content} variant={variant} />
    </div>
  );
};

export default RenderableText;
