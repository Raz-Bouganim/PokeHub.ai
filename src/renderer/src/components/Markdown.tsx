/**
 * A deliberately small markdown renderer for the transcript — no dependency,
 * no `dangerouslySetInnerHTML` (so the strict renderer CSP stays honest).
 *
 * Handles what agents actually emit: ATX headings, paragraphs, bold / italic /
 * inline code, fenced code blocks, bullet + numbered lists, blockquotes, thematic
 * breaks and pipe tables. Anything it doesn't recognise falls through as a
 * paragraph. Real markdown polish (nested lists, task lists, footnotes) is a
 * Phase 3 concern — this just has to beat reading the raw source.
 */

import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import styles from "./Markdown.module.css";

export function Markdown({ text }: { text: string }): JSX.Element {
  return <div className={styles.md}>{parseBlocks(text)}</div>;
}

function parseBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const key = (): string => `b${k++}`;

  const isBlockStart = (s: string): boolean =>
    s.startsWith("```") ||
    /^#{1,6}\s/.test(s) ||
    /^>\s?/.test(s) ||
    /^([-*_])\1{2,}$/.test(s) ||
    /^([-*+]|\d+\.)\s+/.test(s) ||
    s.startsWith("|");

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }

    // Fenced code block.
    if (t.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++; // closing fence
      out.push(
        <pre key={key()} className={styles.pre}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Heading.
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const lvl = Math.min(h[1]!.length, 4);
      out.push(
        <div key={key()} className={cx(styles.h, styles[`h${lvl}`])}>
          {inline(h[2] ?? "", key())}
        </div>,
      );
      i++;
      continue;
    }

    // Thematic break.
    if (/^([-*_])\1{2,}$/.test(t)) {
      out.push(<hr key={key()} className={styles.hr} />);
      i++;
      continue;
    }

    // Pipe table: a header row, then a |---|---| separator.
    const sep = (lines[i + 1] ?? "").trim();
    if (t.startsWith("|") && /^\|?[\s:|-]+\|?$/.test(sep) && sep.includes("-")) {
      const header = splitRow(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(splitRow((lines[i] ?? "").trim()));
        i++;
      }
      out.push(
        <div key={key()} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {header.map((c, j) => (
                  <th key={j}>{inline(c, key())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, key())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Blockquote.
    if (/^>\s?/.test(t)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test((lines[i] ?? "").trim())) {
        buf.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote key={key()} className={styles.quote}>
          {inline(buf.join(" "), key())}
        </blockquote>,
      );
      continue;
    }

    // List (bullet or ordered) — flat only.
    if (/^([-*+]|\d+\.)\s+/.test(t)) {
      const ordered = /^\d+\.\s/.test(t);
      const items: string[] = [];
      while (i < lines.length && /^([-*+]|\d+\.)\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^([-*+]|\d+\.)\s+/, ""));
        i++;
      }
      const lis = items.map((it, li) => <li key={li}>{inline(it, key())}</li>);
      out.push(
        ordered ? (
          <ol key={key()} className={styles.list}>
            {lis}
          </ol>
        ) : (
          <ul key={key()} className={styles.list}>
            {lis}
          </ul>
        ),
      );
      continue;
    }

    // Paragraph — join wrapped lines until a blank line or a new block. The
    // current line is always consumed first (it fell through every block branch,
    // e.g. a stray "| x" that isn't a real table) so `i` always advances — an
    // empty-buf break here would loop forever.
    const buf: string[] = [t];
    i++;
    while (i < lines.length) {
      const cur = (lines[i] ?? "").trim();
      if (!cur || isBlockStart(cur)) break;
      buf.push(cur);
      i++;
    }
    out.push(
      <p key={key()} className={styles.p}>
        {inline(buf.join(" "), key())}
      </p>,
    );
  }

  return out;
}

/** Inline spans: `code`, **bold**, *italic*, [text](url). Code is matched first
 *  so markers inside a code span are left alone. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}-${n++}`;
    if (tok.startsWith("`")) {
      nodes.push(<code key={k}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      nodes.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      nodes.push(<em key={k}>{tok.slice(1, -1)}</em>);
    } else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      nodes.push(
        <span className={styles.link} title={lm?.[2]} key={k}>
          {lm?.[1] ?? tok}
        </span>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}
