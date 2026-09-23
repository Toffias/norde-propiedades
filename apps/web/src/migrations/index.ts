import * as migration_20260922_201015_initial from './20260922_201015_initial';
import * as migration_20260922_232616_blog from './20260922_232616_blog';

export const migrations = [
  {
    up: migration_20260922_201015_initial.up,
    down: migration_20260922_201015_initial.down,
    name: '20260922_201015_initial',
  },
  {
    up: migration_20260922_232616_blog.up,
    down: migration_20260922_232616_blog.down,
    name: '20260922_232616_blog'
  },
];
