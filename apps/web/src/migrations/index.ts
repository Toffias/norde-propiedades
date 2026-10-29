import * as migration_20260922_201015_initial from './20260922_201015_initial';
import * as migration_20260922_232616_blog from './20260922_232616_blog';
import * as migration_20261023_171229_about_team from './20261023_171229_about_team';
import * as migration_20261029_195908_about_stat_icon from './20261029_195908_about_stat_icon';

export const migrations = [
  {
    up: migration_20260922_201015_initial.up,
    down: migration_20260922_201015_initial.down,
    name: '20260922_201015_initial',
  },
  {
    up: migration_20260922_232616_blog.up,
    down: migration_20260922_232616_blog.down,
    name: '20260922_232616_blog',
  },
  {
    up: migration_20261023_171229_about_team.up,
    down: migration_20261023_171229_about_team.down,
    name: '20261023_171229_about_team',
  },
  {
    up: migration_20261029_195908_about_stat_icon.up,
    down: migration_20261029_195908_about_stat_icon.down,
    name: '20261029_195908_about_stat_icon'
  },
];
