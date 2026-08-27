# Fase 0 — Inventário e hardening do servidor

Servidor: `portal-cambui-01` · Rocky Linux 9.8 (Blue Onyx) · VM Hyper-V
Registro iniciado em 2026-08-27.

## 1. Inventário inicial (somente leitura)

| Item        | Estado encontrado                                              |
|-------------|----------------------------------------------------------------|
| SO          | Rocky Linux 9.8, kernel 5.14.0-687.10.1.el9_8 (suporte até 2032-05-31) |
| Hostname    | não definido (`localhost.localdomain`)                         |
| CPU         | 8 vCPU (2 nós NUMA)                                            |
| RAM         | 3,4 GiB — **insuficiente**                                     |
| Swap        | 3,8 GiB (swappiness 60)                                        |
| Disco       | 1 TB — `/` xfs com ~934 GB livres, `/home` 50 GB               |
| Rede        | `10.180.5.110/21`, gateway `10.180.0.254` (DHCP), eth0         |
| IP de saída | `177.10.44.44` (NAT — a VM não possui IP público direto)       |
| Portas      | apenas SSH/9025 e chronyd local                                |
| Timezone    | America/Sao_Paulo, NTP sincronizado                            |

### Segurança herdada do provisionamento (contraria o exigido)

- SELinux **disabled** em `/etc/selinux/config`.
- firewalld **desabilitado e parado**; nftables/iptables inativos — sem firewall de host.
- O `.bash_history` indica que ambos foram desativados deliberadamente no provisionamento.

### Software presente / ausente

- Presente: Node.js v20.20.2 (NodeSource), npm 10.8.2, git 2.52.0.
- Ausente: docker, nginx, postgres, redis, certbot, clamav, fail2ban, restic,
  dnf-automatic, zabbix, wazuh.

## 2. Alterações aplicadas

| # | Ação | Resultado |
|---|------|-----------|
| 1 | RAM da VM elevada para 16 GiB (executado pelo cliente) | 14 GiB visíveis ao SO; kernel atualizado para 5.14.0-687.42.1 no reboot |
| 2 | Hostname definido | `portal-cambui-01` (+ entrada em `/etc/hosts`) |
| 3 | Repositório NodeSource repontado de `pub_20.x` para `pub_22.x` | backup em `/root/nodesource-nodejs.repo.bak-20260827` |
| 4 | Node.js atualizado | v22.23.2 LTS, npm 10.9.8 |
| 5 | `dnf-automatic` instalado e configurado | `upgrade_type=security`, `apply_updates=yes`, timer ativo (diário) |
| 6 | Docker CE instalado | 29.7.2 + Compose 5.5.0 + containerd 2.3.3 — **daemon deliberadamente parado** |
| 7 | EPEL + fail2ban instalados | `jail.local` escrito (sshd/9025) — **serviço deliberadamente parado** |
| 8 | Estrutura do projeto criada | `/opt/portal-cambui/` (modo 750) sob controle de versão |

### Por que Docker e fail2ban ficaram parados

- **Docker**: precisa subir *depois* do firewalld, senão o daemon cria suas
  chains de rede fora do controle do firewall.
- **fail2ban**: o `ignoreip` ainda não contém a faixa de gerência da TrustIT.
  Ativar antes disso arrisca banir a própria equipe do acesso SSH.

## 3. Pendências que bloqueiam a Fase 1

1. **Reboot autorizado** para reabilitar SELinux em modo `enforcing`
   (exige relabel do sistema de arquivos + um reboot).
2. **firewalld**: ativar liberando 9025 (restrita à faixa TrustIT), 80 e 443.
3. **Inbound 80/443**: confirmar o caminho do cidadão até a VM — o
   `177.10.44.44` faz NAT/port-forward? Existe VIP ou WAF na frente? É esse o
   IP do registro A? Sem essa definição o Certbot não valida o domínio.
4. **E-mail administrativo** para o Let's Encrypt.
5. **Faixa de IP de gerência da TrustIT** para travar o SSH/9025.

## 4. Pendências posteriores (não bloqueiam a Fase 1)

- Vetor oficial do brasão (`.svg`/`.ai`/`.eps`) e manual de marca. Hoje há
  apenas um PNG 1126×510 (lockup horizontal para fundo escuro).
- Aprovação da paleta proposta e validação de contraste (4.5:1).
- DNS: responsável pela zona `mg.gov.br` e confirmação dos três domínios.
- SMTP (TrustIT Mail Protect): host, porta e credenciais.
- Dados institucionais: CNPJ, endereço, telefones, horário de atendimento.
- Sistema contábil em uso e URLs atuais de Transparência, Diário Oficial e
  e-SIC/Ouvidoria — a Transparência **não** será reconstruída, apenas integrada.
- Credenciais de Zabbix, Wazuh e Tactical RMM para onboarding de monitoramento.
