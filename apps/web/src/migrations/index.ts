import * as migration_20260922_201015_initial from './20260922_201015_initial';

export const migrations = [
  {
    up: migration_20260922_201015_initial.up,
    down: migration_20260922_201015_initial.down,
    name: '20260922_201015_initial'
  },
];
