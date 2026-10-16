import * as migration_20261014_181315_inicial from './20261014_181315_inicial';
import * as migration_20261014_190544_papel_usuarios from './20261014_190544_papel_usuarios';
import * as migration_20261015_115636_papeis_licitacoes from './20261015_115636_papeis_licitacoes';
import * as migration_20261015_120201_avisos_servico from './20261015_120201_avisos_servico';
import * as migration_20261015_125842_papeis_obras from './20261015_125842_papeis_obras';
import * as migration_20261015_135230_fluxo_editorial_papeis from './20261015_135230_fluxo_editorial_papeis';
import * as migration_20261015_161726_pastas_arquivos from './20261015_161726_pastas_arquivos';
import * as migration_20261015_181927_perfil_usuario from './20261015_181927_perfil_usuario';
import * as migration_20261015_183255_termos_aceite from './20261015_183255_termos_aceite';
import * as migration_20261016_113742_globais_portal from './20261016_113742_globais_portal';
import * as migration_20261016_122821_servicos_catalogo_sem_links_uteis from './20261016_122821_servicos_catalogo_sem_links_uteis';
import * as migration_20261016_155255_indicadores_tempo_globais from './20261016_155255_indicadores_tempo_globais';

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
    name: '20261015_125842_papeis_obras',
  },
  {
    up: migration_20261015_135230_fluxo_editorial_papeis.up,
    down: migration_20261015_135230_fluxo_editorial_papeis.down,
    name: '20261015_135230_fluxo_editorial_papeis',
  },
  {
    up: migration_20261015_161726_pastas_arquivos.up,
    down: migration_20261015_161726_pastas_arquivos.down,
    name: '20261015_161726_pastas_arquivos',
  },
  {
    up: migration_20261015_181927_perfil_usuario.up,
    down: migration_20261015_181927_perfil_usuario.down,
    name: '20261015_181927_perfil_usuario',
  },
  {
    up: migration_20261015_183255_termos_aceite.up,
    down: migration_20261015_183255_termos_aceite.down,
    name: '20261015_183255_termos_aceite',
  },
  {
    up: migration_20261016_113742_globais_portal.up,
    down: migration_20261016_113742_globais_portal.down,
    name: '20261016_113742_globais_portal',
  },
  {
    up: migration_20261016_122821_servicos_catalogo_sem_links_uteis.up,
    down: migration_20261016_122821_servicos_catalogo_sem_links_uteis.down,
    name: '20261016_122821_servicos_catalogo_sem_links_uteis',
  },
  {
    up: migration_20261016_155255_indicadores_tempo_globais.up,
    down: migration_20261016_155255_indicadores_tempo_globais.down,
    name: '20261016_155255_indicadores_tempo_globais'
  },
];
