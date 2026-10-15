import * as migration_20261014_181315_inicial from './20261014_181315_inicial';
import * as migration_20261014_190544_papel_usuarios from './20261014_190544_papel_usuarios';
import * as migration_20261015_115636_papeis_licitacoes from './20261015_115636_papeis_licitacoes';
import * as migration_20261015_120201_avisos_servico from './20261015_120201_avisos_servico';
import * as migration_20261015_125842_papeis_obras from './20261015_125842_papeis_obras';

export const migrations = [
  {
    up: migration_20261014_181315_inicial.up,
    down: migration_20261014_181315_inicial.down,
    name: '20261014_181315_inicial',
  },
  {
    up: migration_20261014_190544_papel_usuarios.up,
    down: migration_20261014_190544_papel_usuarios.down,
    name: '20261014_190544_papel_usuarios',
  },
  {
    up: migration_20261015_115636_papeis_licitacoes.up,
    down: migration_20261015_115636_papeis_licitacoes.down,
    name: '20261015_115636_papeis_licitacoes',
  },
  {
    up: migration_20261015_120201_avisos_servico.up,
    down: migration_20261015_120201_avisos_servico.down,
    name: '20261015_120201_avisos_servico',
  },
  {
    up: migration_20261015_125842_papeis_obras.up,
    down: migration_20261015_125842_papeis_obras.down,
    name: '20261015_125842_papeis_obras'
  },
];
