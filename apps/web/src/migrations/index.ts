import * as migration_20261106_173058_initial from './20261106_173058_initial';
import * as migration_20261106_195541_admin_foundation from './20261106_195541_admin_foundation';
import * as migration_20261106_205400_users_2fa_reset_permission from './20261106_205400_users_2fa_reset_permission';
import * as migration_20261106_220649_e026_quizzes_assignments_drip from './20261106_220649_e026_quizzes_assignments_drip';
import * as migration_20261106_230318_e031_rich_text from './20261106_230318_e031_rich_text';
import * as migration_20261107_042828_e032_wordpress_import from './20261107_042828_e032_wordpress_import';
import * as migration_20261107_052440_e033_live_classes_storage from './20261107_052440_e033_live_classes_storage';

export const migrations = [
  {
    up: migration_20261106_173058_initial.up,
    down: migration_20261106_173058_initial.down,
    name: '20261106_173058_initial',
  },
  {
    up: migration_20261106_195541_admin_foundation.up,
    down: migration_20261106_195541_admin_foundation.down,
    name: '20261106_195541_admin_foundation',
  },
  {
    up: migration_20261106_205400_users_2fa_reset_permission.up,
    down: migration_20261106_205400_users_2fa_reset_permission.down,
    name: '20261106_205400_users_2fa_reset_permission',
  },
  {
    up: migration_20261106_220649_e026_quizzes_assignments_drip.up,
    down: migration_20261106_220649_e026_quizzes_assignments_drip.down,
    name: '20261106_220649_e026_quizzes_assignments_drip',
  },
  {
    up: migration_20261106_230318_e031_rich_text.up,
    down: migration_20261106_230318_e031_rich_text.down,
    name: '20261106_230318_e031_rich_text',
  },
  {
    up: migration_20261107_042828_e032_wordpress_import.up,
    down: migration_20261107_042828_e032_wordpress_import.down,
    name: '20261107_042828_e032_wordpress_import',
  },
  {
    up: migration_20261107_052440_e033_live_classes_storage.up,
    down: migration_20261107_052440_e033_live_classes_storage.down,
    name: '20261107_052440_e033_live_classes_storage'
  },
];
