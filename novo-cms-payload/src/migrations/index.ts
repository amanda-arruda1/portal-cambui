import * as migration_20261014_181315_inicial from './20261014_181315_inicial';

export const migrations = [
  {
    up: migration_20261014_181315_inicial.up,
    down: migration_20261014_181315_inicial.down,
    name: '20261014_181315_inicial'
  },
];
