import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './MarkdownRender.css';

interface Props {
  content: string;
  variant?: 'default' | 'reading';
}

export function MarkdownRender({ content, variant = 'default' }: Props) {
  return (
    <div className={`markdown-body ${variant === 'reading' ? 'markdown-reading' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          code: ({ inline, className, children, ...props }: any) => {
            return !inline ? (
              <pre className="hljs-code-block">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
