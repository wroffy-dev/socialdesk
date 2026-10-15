import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | undefined;

function smtp(): Transporter {
  if (!transporter) {
    const e = env();
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends a transactional email. With MAIL_TRANSPORT=log (development) the message is printed
 * and written to .data/mail so links can be followed locally and in end-to-end tests.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const e = env();
  if (e.MAIL_TRANSPORT === 'smtp') {
    await smtp().sendMail({ from: e.MAIL_FROM, ...message });
    return;
  }
  console.info(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
  if (e.NODE_ENV !== 'production') {
    const dir = path.resolve('.data/mail');
    await mkdir(dir, { recursive: true });
    const file = `${Date.now()}-${message.to.replace(/[^a-z0-9@._-]/gi, '_')}.json`;
    await writeFile(path.join(dir, file), JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2));
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal, client-safe HTML layout for transactional mail. */
export function layout(opts: { heading: string; body: string; actionLabel?: string; actionUrl?: string; footer?: string }) {
  const button = opts.actionUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.actionUrl)}" style="background:#b5e3a1;color:#1f2a1a;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(opts.actionLabel ?? 'Open')}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f4f1;padding:24px;color:#2b2b2b">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e4df;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(opts.heading)}</h1>
<p style="line-height:1.5;margin:0">${escapeHtml(opts.body)}</p>${button}
<p style="color:#7a766e;font-size:12px;margin-top:24px">${escapeHtml(opts.footer ?? 'You received this email because of activity on your SocialDesk account.')}</p>
</div></body></html>`;
}
