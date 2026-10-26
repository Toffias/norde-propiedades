import Link from 'next/link';
import { Fragment } from 'react';

import {
  internalPath,
  isAllowedExternalLink,
  parseChatMarkdown,
  type ChatLine,
} from '../../lib/chat/markdown';

interface ChatTextProps {
  readonly text: string;
  /** Los links al propio sitio navegan sin recargar; el resto abre en otra pestaña. */
  readonly siteUrl: string;
  readonly onInternalNavigation: () => void;
}

const LINK = 'font-semibold text-primary underline underline-offset-2 hover:no-underline';

function Line({
  line,
  siteUrl,
  onInternalNavigation,
}: { readonly line: ChatLine } & Omit<ChatTextProps, 'text'>) {
  return line.map((part, index) => {
    const content = part.bold ? <strong>{part.text}</strong> : part.text;
    if (part.kind === 'text') return <Fragment key={index}>{content}</Fragment>;
    const path = internalPath(part.href, siteUrl);
    // Un link a otro dominio se muestra como texto: lo escribió el LLM.
    if (!path && !isAllowedExternalLink(part.href)) {
      return <Fragment key={index}>{content}</Fragment>;
    }
    return path ? (
      <Link key={index} href={path} className={LINK} onClick={onInternalNavigation}>
        {content}
      </Link>
    ) : (
      <a
        key={index}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={LINK}
      >
        {content}
      </a>
    );
  });
}

/** El texto de una respuesta del agente, con su markdown liviano (sin HTML inyectado). */
export function ChatText({ text, siteUrl, onInternalNavigation }: ChatTextProps) {
  return (
    <div className="space-y-2 break-words">
      {parseChatMarkdown(text).map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={index}>
              {block.lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  <Line line={line} siteUrl={siteUrl} onInternalNavigation={onInternalNavigation} />
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List
            key={index}
            start={block.ordered && block.start !== 1 ? block.start : undefined}
            className={`space-y-2 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Line
                  line={item.line}
                  siteUrl={siteUrl}
                  onInternalNavigation={onInternalNavigation}
                />
                {item.children.length > 0 && (
                  <ul className="text-muted-foreground mt-1 space-y-0.5 pl-1">
                    {item.children.map((child, childIndex) => (
                      <li key={childIndex}>
                        <Line
                          line={child}
                          siteUrl={siteUrl}
                          onInternalNavigation={onInternalNavigation}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
