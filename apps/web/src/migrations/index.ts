import * as migration_20261106_173058_initial from './20261106_173058_initial';
import * as migration_20261106_195541_admin_foundation from './20261106_195541_admin_foundation';
import * as migration_20261106_205400_users_2fa_reset_permission from './20261106_205400_users_2fa_reset_permission';
import * as migration_20261106_220649_e026_quizzes_assignments_drip from './20261106_220649_e026_quizzes_assignments_drip';
import * as migration_20261106_230318_e031_rich_text from './20261106_230318_e031_rich_text';
import * as migration_20261107_042828_e032_wordpress_import from './20261107_042828_e032_wordpress_import';
import * as migration_20261107_053815_e033_live_classes_storage from './20261107_053815_e033_live_classes_storage';
import * as migration_20261107_060240_e028_gamification from './20261107_060240_e028_gamification';
import * as migration_20261107_141016_e030_iba_import from './20261107_141016_e030_iba_import';
import * as migration_20261108_150947_e039_role_settings from './20261108_150947_e039_role_settings';
import * as migration_20261108_165628_e045_payment_methods from './20261108_165628_e045_payment_methods';
import * as migration_20261108_174226_e047_settings_hub from './20261108_174226_e047_settings_hub';

import * as migration_20261108_174300_e047_admin_integrations_key from './20261108_174300_e047_admin_integrations_key';
import * as migration_20261108_174400_e047_zarinpal_to_payment_methods from './20261108_174400_e047_zarinpal_to_payment_methods';
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
    up: migration_20261107_053815_e033_live_classes_storage.up,
    down: migration_20261107_053815_e033_live_classes_storage.down,
    name: '20261107_053815_e033_live_classes_storage',
  },
  {
    up: migration_20261107_060240_e028_gamification.up,
    down: migration_20261107_060240_e028_gamification.down,
    name: '20261107_060240_e028_gamification',
  },
  {
    up: migration_20261107_141016_e030_iba_import.up,
    down: migration_20261107_141016_e030_iba_import.down,
    name: '20261107_141016_e030_iba_import',
  },
  {
    up: migration_20261108_150947_e039_role_settings.up,
    down: migration_20261108_150947_e039_role_settings.down,
    name: '20261108_150947_e039_role_settings',
  },
  {
    up: migration_20261108_165628_e045_payment_methods.up,
    down: migration_20261108_165628_e045_payment_methods.down,
    name: '20261108_165628_e045_payment_methods',
  },
  {
    up: migration_20261108_174226_e047_settings_hub.up,
    down: migration_20261108_174226_e047_settings_hub.down,
    name: '20261108_174226_e047_settings_hub',
  },
  {
    up: migration_20261108_174300_e047_admin_integrations_key.up,
    down: migration_20261108_174300_e047_admin_integrations_key.down,
    name: '20261108_174300_e047_admin_integrations_key',
  },
  {
    up: migration_20261108_174400_e047_zarinpal_to_payment_methods.up,
    down: migration_20261108_174400_e047_zarinpal_to_payment_methods.down,
    name: '20261108_174400_e047_zarinpal_to_payment_methods',
  },
];
