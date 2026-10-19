import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import type { PublicSite } from '../ports/public-site';

import { RevalidatePublicDevelopment } from './revalidate-public-development';
import { RevalidatePublicProperty } from './revalidate-public-property';

const JOBS = Actor.system('scheduler', ['properties:revalidate-site']);
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000c1';
const DEVELOPMENT_ID = '00000000-0000-7000-8000-0000000000e1';

class FakePublicSite implements PublicSite {
  readonly revalidated: string[] = [];
  readonly revalidatedDevelopments: string[] = [];

  revalidateProperty(propertyId: string) {
    this.revalidated.push(propertyId);
    return Promise.resolve();
  }

  revalidateDevelopment(developmentId: string) {
    this.revalidatedDevelopments.push(developmentId);
    return Promise.resolve();
  }
}

describe('RevalidatePublicProperty', () => {
  it('asks the site to rebuild the property page and its listings', async () => {
    const site = new FakePublicSite();
    unwrap(await new RevalidatePublicProperty({ site }).execute({ propertyId: PROPERTY_ID }, JOBS));
    expect(site.revalidated).toEqual([PROPERTY_ID]);
  });

  it('rejects an invalid id and needs the jobs permission', async () => {
    const site = new FakePublicSite();
    const useCase = new RevalidatePublicProperty({ site });
    expect(unwrapErr(await useCase.execute({ propertyId: 'x' }, JOBS))).toMatchObject({
      type: 'InvalidInput',
    });
    const reader = Actor.system('web', ['properties:read']);
    expect(unwrapErr(await useCase.execute({ propertyId: PROPERTY_ID }, reader))).toEqual({
      type: 'Forbidden',
    });
    expect(site.revalidated).toEqual([]);
  });

  it('lets the queue retry when the site does not answer', async () => {
    const site: PublicSite = {
      revalidateProperty: () => Promise.reject(new Error('down')),
      revalidateDevelopment: () => Promise.resolve(),
    };
    await expect(
      new RevalidatePublicProperty({ site }).execute({ propertyId: PROPERTY_ID }, JOBS),
    ).rejects.toThrow('down');
  });
});

describe('RevalidatePublicDevelopment', () => {
  it('asks the site to rebuild the development page and the listing', async () => {
    const site = new FakePublicSite();
    unwrap(
      await new RevalidatePublicDevelopment({ site }).execute(
        { developmentId: DEVELOPMENT_ID },
        JOBS,
      ),
    );
    expect(site.revalidatedDevelopments).toEqual([DEVELOPMENT_ID]);
  });

  it('rejects an invalid id and needs the jobs permission', async () => {
    const site = new FakePublicSite();
    const useCase = new RevalidatePublicDevelopment({ site });
    expect(unwrapErr(await useCase.execute({ developmentId: 'x' }, JOBS))).toMatchObject({
      type: 'InvalidInput',
    });
    const reader = Actor.system('web', ['properties:read']);
    expect(unwrapErr(await useCase.execute({ developmentId: DEVELOPMENT_ID }, reader))).toEqual({
      type: 'Forbidden',
    });
    expect(site.revalidatedDevelopments).toEqual([]);
  });

  it('lets the queue retry when the site does not answer', async () => {
    const site: PublicSite = {
      revalidateProperty: () => Promise.resolve(),
      revalidateDevelopment: () => Promise.reject(new Error('down')),
    };
    await expect(
      new RevalidatePublicDevelopment({ site }).execute({ developmentId: DEVELOPMENT_ID }, JOBS),
    ).rejects.toThrow('down');
  });
});
