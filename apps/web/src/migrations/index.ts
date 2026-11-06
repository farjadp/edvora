import * as migration_20261106_173058_initial from './20261106_173058_initial';
import * as migration_20261106_195541_admin_foundation from './20261106_195541_admin_foundation';

export const migrations = [
  {
    up: migration_20261106_173058_initial.up,
    down: migration_20261106_173058_initial.down,
    name: '20261106_173058_initial',
  },
  {
    up: migration_20261106_195541_admin_foundation.up,
    down: migration_20261106_195541_admin_foundation.down,
    name: '20261106_195541_admin_foundation'
  },
];
