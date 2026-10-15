import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { createProject, deleteProject, listProjects, updateProject } from '@/server/services/projects';
import { createPost, listPosts, listCalendar } from '@/server/services/posts';
import { disconnectChannel } from '@/server/services/channels';
import { setWorkspacePlan } from '@/server/services/admin';
import { addMember, makeChannel, makeWorkspace } from './helpers/factories';

const firstProject = (workspaceId: string) => db.project.findFirstOrThrow({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });

describe('projects', () => {
  it('every workspace starts with one project named after it', async () => {
    const { ws, ctx } = await makeWorkspace('Brand House');
    const list = await listProjects(ctx);
    expect(list.projects).toHaveLength(1);
    expect(list.projects[0]).toMatchObject({ name: 'Brand House', slots: { INSTAGRAM: null, FACEBOOK: null, X: null, LINKEDIN: null, YOUTUBE: null } });
    expect(list).toMatchObject({ used: 1, limit: 2, planName: 'Free' });
    expect(await db.project.count({ where: { workspaceId: ws.id } })).toBe(1);
  });

  it('enforces the plan limit: Free 2, Pro 5, Business 10, Agency 20', async () => {
    const { ws, ctx } = await makeWorkspace('Limit Brand');
    await createProject(ctx, { name: 'Two' });
    await expect(createProject(ctx, { name: 'Three' })).rejects.toMatchObject({ status: 402, code: 'limit_reached' });

    const limits: [string, number][] = [['pro', 5], ['business', 10], ['agency', 20]];
    for (const [key, limit] of limits) {
      await setWorkspacePlan({ id: ctx.user.id }, ws.id, key);
      expect((await listProjects(ctx)).limit).toBe(limit);
    }
    await setWorkspacePlan({ id: ctx.user.id }, ws.id, 'pro');
    for (let i = 3; i <= 5; i++) await createProject(ctx, { name: `P${i}` });
    await expect(createProject(ctx, { name: 'P6' })).rejects.toMatchObject({ status: 402 });
  });

  it('cannot exceed the limit with concurrent requests', async () => {
    const { ws, ctx } = await makeWorkspace('Race Brand');
    const results = await Promise.allSettled([1, 2, 3, 4].map((i) => createProject(ctx, { name: `Race ${i}` })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.project.count({ where: { workspaceId: ws.id } })).toBe(2);
  });

  it('requires unique names and manager permissions, and hides other workspaces', async () => {
    const { ws, ctx } = await makeWorkspace('Names Co');
    await expect(createProject(ctx, { name: 'Names Co' })).rejects.toMatchObject({ status: 409 });
    const p = await createProject(ctx, { name: 'Client A' });
    await expect(updateProject(ctx, p.id, { name: 'Names Co' })).rejects.toMatchObject({ status: 409 });
    expect(await updateProject(ctx, p.id, { name: 'Client A+' })).toMatchObject({ name: 'Client A+' });

    const publisher = await addMember(ws.id, 'PUBLISHER');
    await expect(createProject(publisher, { name: 'Nope' })).rejects.toMatchObject({ status: 403 });
    await expect(deleteProject(publisher, p.id)).rejects.toMatchObject({ status: 403 });
    expect((await listProjects(publisher)).projects).toHaveLength(2);

    const other = await makeWorkspace('Stranger Co');
    await expect(updateProject(other.ctx, p.id, { name: 'Mine' })).rejects.toMatchObject({ status: 404 });
    await expect(deleteProject(other.ctx, p.id)).rejects.toMatchObject({ status: 404 });
  });

  it('deletes a project with its posts only after its channels are disconnected', async () => {
    const { ws, ctx } = await makeWorkspace('Delete Brand');
    const first = await firstProject(ws.id);
    await expect(deleteProject(ctx, first.id)).rejects.toMatchObject({ status: 400 }); // last project

    const p = await createProject(ctx, { name: 'Temporary' });
    const ch = await makeChannel(ws.id, 'FACEBOOK', p.id);
    const post = await createPost(ctx, { projectId: p.id, baseCaption: 'draft', versions: [{ socialAccountId: ch.id }] });
    await expect(deleteProject(ctx, p.id)).rejects.toMatchObject({ status: 409 });
    await disconnectChannel(ctx, ch.id);
    await deleteProject(ctx, p.id);
    expect(await db.project.findUnique({ where: { id: p.id } })).toBeNull();
    expect(await db.socialPost.findUnique({ where: { id: post.id } })).toBeNull();
    expect(await db.project.count({ where: { workspaceId: ws.id } })).toBe(1);
  });
});

describe('posts and projects', () => {
  it('a post only uses channels of its own project', async () => {
    const { ws, ctx } = await makeWorkspace('Post Projects');
    const a = await firstProject(ws.id);
    const b = await createProject(ctx, { name: 'Other brand' });
    const igA = await makeChannel(ws.id, 'INSTAGRAM', a.id);
    const fbA = await makeChannel(ws.id, 'FACEBOOK', a.id);
    const fbB = await makeChannel(ws.id, 'FACEBOOK', b.id);

    const post = await createPost(ctx, { baseCaption: 'hello', versions: [{ socialAccountId: igA.id }, { socialAccountId: fbA.id }] });
    expect(post.projectId).toBe(a.id);
    await expect(createPost(ctx, { baseCaption: 'mixed', versions: [{ socialAccountId: igA.id }, { socialAccountId: fbB.id }] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(createPost(ctx, { projectId: a.id, baseCaption: 'wrong', versions: [{ socialAccountId: fbB.id }] })).rejects.toMatchObject({ status: 400 });

    const other = await makeWorkspace('Foreign');
    const foreignProject = await firstProject(other.ws.id);
    await expect(createPost(ctx, { projectId: foreignProject.id, baseCaption: 'x' })).rejects.toMatchObject({ status: 404 });

    // Draft without channels keeps the requested project.
    const draft = await createPost(ctx, { projectId: b.id, baseCaption: 'idea' });
    expect(draft.projectId).toBe(b.id);

    // List and calendar filter by project.
    const listA = await listPosts(ctx, { projects: a.id });
    expect(listA.items.map((i) => i.id)).toEqual([post.id]);
    expect(listA.tabCounts.all).toBe(1);
    const listB = await listPosts(ctx, { projects: b.id });
    expect(listB.items.map((i) => i.id)).toEqual([draft.id]);
    expect(listB.items[0]!.project).toMatchObject({ id: b.id, name: 'Other brand' });

    const at = new Date(Date.now() + 3 * 3600_000);
    const scheduled = await createPost(ctx, {
      projectId: b.id,
      baseCaption: 'later',
      versions: [{ socialAccountId: fbB.id }],
      action: { type: 'schedule', scheduledAt: at.toISOString(), timezone: 'UTC' },
    });
    const range = { from: new Date(Date.now()).toISOString(), to: new Date(Date.now() + 86400_000).toISOString() };
    expect((await listCalendar(ctx, { ...range, projects: b.id })).items.map((i) => i.id)).toEqual([scheduled.id]);
    expect((await listCalendar(ctx, { ...range, projects: a.id })).items).toHaveLength(0);
  });
});
