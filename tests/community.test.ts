import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { addCommentNote, getCommentThread, listComments, replyToComment, updateComment } from '@/server/services/community';
import { createSavedReply, deleteSavedReply, listSavedReplies } from '@/server/services/settings';
import { setAdaptersForTesting } from '@/server/adapters/registry';
import { FacebookAdapter } from '@/server/adapters/meta/facebook';
import { InstagramAdapter } from '@/server/adapters/meta/instagram';
import { GraphClient } from '@/server/adapters/meta/graph';
import { addMember, makeChannel, makeWorkspace } from './helpers/factories';
import { fakeGraph } from './helpers/fake-graph';

afterEach(() => setAdaptersForTesting(undefined));

async function setup(name: string) {
  const { ws, ctx } = await makeWorkspace(name);
  const ch = await makeChannel(ws.id, 'FACEBOOK');
  await db.socialAccount.update({ where: { id: ch.id }, data: { mode: 'DEVELOPMENT', scopes: ['pages_manage_posts', 'pages_read_user_content', 'pages_manage_engagement'] } });
  const comment = await db.comment.create({
    data: { workspaceId: ws.id, socialAccountId: ch.id, externalId: `c-${ws.id}`, authorName: 'Fan', body: 'Love this!', postedAt: new Date() },
  });
  return { ws, ctx, ch, comment };
}

describe('community inbox', () => {
  it('lists, replies through the platform API, and marks answered', async () => {
    const { fetchImpl, calls } = fakeGraph([['POST', /\/comments$/, () => ({ body: { id: 'reply-1' } })]]);
    const graph = new GraphClient({ version: 'v23.0', fetchImpl });
    setAdaptersForTesting({ FACEBOOK: new FacebookAdapter(graph), INSTAGRAM: new InstagramAdapter(graph) });
    const { ctx, comment } = await setup('Inbox Co');
    expect((await listComments(ctx, { filter: 'unanswered' })).items.map((i) => i.id)).toContain(comment.id);
    const thread = await replyToComment(ctx, comment.id, 'Thank you!');
    expect(calls[0]!.path).toBe(`${comment.externalId}/comments`);
    expect(calls[0]!.params.get('message')).toBe('Thank you!');
    expect(thread.replies).toHaveLength(1);
    expect((await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).answered).toBe(true);
    expect((await listComments(ctx, { filter: 'unanswered' })).items.map((i) => i.id)).not.toContain(comment.id);
  });

  it('supports notes and assignment to members only', async () => {
    const { ws, ctx, comment } = await setup('Notes Co');
    const pub = await addMember(ws.id, 'PUBLISHER');
    await updateComment(ctx, comment.id, { assignedToId: pub.user.id });
    expect((await listComments(pub, { filter: 'mine' })).items).toHaveLength(1);
    const outsider = await makeWorkspace('Outsider');
    await expect(updateComment(ctx, comment.id, { assignedToId: outsider.owner.id })).rejects.toMatchObject({ status: 400 });
    const t = await addCommentNote(ctx, comment.id, 'Send them a coupon');
    expect(t.notes[0]!.body).toBe('Send them a coupon');
  });

  it('analysts can read but not reply; other workspaces see nothing', async () => {
    const { ws, comment } = await setup('Perms Co');
    const analyst = await addMember(ws.id, 'ANALYST');
    await expect(getCommentThread(analyst, comment.id)).resolves.toBeTruthy();
    await expect(replyToComment(analyst, comment.id, 'hi')).rejects.toMatchObject({ status: 403 });
    const other = await makeWorkspace('Other Inbox');
    await expect(getCommentThread(other.ctx, comment.id)).rejects.toMatchObject({ status: 404 });
    await expect(replyToComment(other.ctx, comment.id, 'hi')).rejects.toMatchObject({ status: 404 });
    expect((await listComments(other.ctx, { filter: 'all' })).items).toHaveLength(0);
  });

  it('saved replies are workspace-scoped', async () => {
    const a = await makeWorkspace('Replies A');
    const b = await makeWorkspace('Replies B');
    const r = await createSavedReply(a.ctx, { title: 'Thanks', body: 'Thank you!' });
    expect(await listSavedReplies(b.ctx)).toHaveLength(0);
    await expect(deleteSavedReply(b.ctx, r.id)).rejects.toMatchObject({ status: 404 });
  });
});
