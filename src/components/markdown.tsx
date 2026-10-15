import { Fragment } from 'react';

/**
 * Minimal Markdown renderer for admin-edited legal pages: headings, paragraphs, lists,
 * **bold**, _italic_ and [links](https://…). Output is React elements only (no raw HTML),
 * so content can't inject scripts.
 */
function inline(text: string, keyBase: string) {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\((https?:\/\/[^)\s]+|\/[^)\s]*|mailto:[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('_')) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else {
      const label = tok.slice(1, tok.indexOf(']'));
      const href = m[2]!;
      out.push(
        <a key={key} href={href} className="text-info underline" rel="noreferrer">
          {label}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-fg/90">
      {blocks.map((block, bi) => {
        const b = block.trim();
        if (!b) return null;
        const h = /^(#{1,3})\s+(.*)$/.exec(b);
        if (h) {
          const level = h[1]!.length;
          const cls = level === 1 ? 'text-3xl font-semibold text-fg' : level === 2 ? 'mt-2 text-xl font-semibold text-fg' : 'text-lg font-semibold text-fg';
          const Tag = (`h${level}` as 'h1' | 'h2' | 'h3');
          return (
            <Tag key={bi} className={cls}>
              {inline(h[2]!, `h${bi}`)}
            </Tag>
          );
        }
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-6">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ''), `l${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `p${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
