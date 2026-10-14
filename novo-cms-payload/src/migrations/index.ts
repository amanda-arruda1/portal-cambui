import * as migration_20261014_181315_inicial from './20261014_181315_inicial';
import * as migration_20261014_190544_papel_usuarios from './20261014_190544_papel_usuarios';

export const migrations = [
  {
    up: migration_20261014_181315_inicial.up,
    down: migration_20261014_181315_inicial.down,
    name: '20261014_181315_inicial',
  },
  {
    up: migration_20261014_190544_papel_usuarios.up,
    down: migration_20261014_190544_papel_usuarios.down,
    name: '20261014_190544_papel_usuarios'
  },
];
