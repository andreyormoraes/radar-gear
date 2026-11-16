# Auditoria de segurança da exportação

## Escopo e método

Revisão da árvore de código e configurações acessíveis, varredura por padrões de segredos no estado atual e em 18 commits do histórico local, análise de 71 revisões únicas de arquivos, inventário dos nomes de variáveis de produção e amostra de 20 eventos de execução. As localizações abaixo referem-se à origem anterior à sanitização. Dados do banco hospedado, cofre do provedor e logs fora da amostra ficaram fora desta verificação. A auditoria não incluiu teste de intrusão ou validação em conta externa.

| Localização na origem | Tipo de risco | Tratamento |
| --- | --- | --- |
| `worker.mjs`, início | Identificador derivado do e-mail do proprietário. Pode permitir associação ao e-mail por tentativa de candidatos. | Removido. A identidade de administrador usa configuração de ambiente, após validação de login. |
| `worker.mjs`, início e retorno da consulta, `index.html`, cabeçalho e formulários, `ATUALIZACOES.md`, início | CEP pessoal codificado no projeto. | Removido do exemplo. O CEP passa a ser escolhido no painel. |
| `drizzle/0003_identify_pulsefire.sql`, trecho de atualização, e `seed.json`, registros finais | Referência interna a um cadastro real e seu histórico inicial. | Removidos da cópia. O restante do histórico de exemplo contém observações públicas. |
| `.openai/hosting.json`, início | Identificador da implantação e dependência da infraestrutura original. | Excluído do ZIP. A configuração externa tem apenas valores fictícios. |
| Eventos de execução do Worker, metadados HTTP | IP e cabeçalhos de identidade e sessão, com campos sensíveis redigidos no retorno amostrado. | Nenhum log exportado. |
| `.gitignore`, arquivo original | Cobertura limitada de arquivos locais. | Incluídos padrões para segredos, chaves, banco local, logs, artefatos e configurações de implantação reais. |
| `worker.mjs`, autenticação na origem | Confiança em cabeçalhos de identidade fornecidos pelo ChatGPT Sites. Uma origem externa configurada para aceitar esses cabeçalhos teria risco de falsificação. | A configuração externa usa JWT validado do Cloudflare Access. O modo reservado ao Sites é explícito. |
| `index.html` e `worker.mjs`, URLs e imagens de lojas | Anúncios ou fotos de origem externa podem mudar ou transmitir requisições a terceiros. | A importação limita origens e redirecionamentos a varejistas suportados. A comprovação da oferta depende da fonte e de sua data. |

## Credenciais e conclusão

Nas cópias verificadas, a varredura não encontrou chaves privadas, tokens conhecidos, credenciais fixas, arquivos de ambiente reais, dumps locais, certificados privados ou webhooks com segredos. O inventário de variáveis de produção retornou vazio. Isso não atesta o conteúdo de serviços ou áreas sem acesso.

O digest de identidade removido era um identificador derivado, sem função de senha ou token revogável. Nesta auditoria não surgiu uma credencial específica que exigisse revogação. Se algum token tiver sido publicado fora do escopo da auditoria, revogue-o e gere outro no serviço emissor.

A exportação contém uma árvore nova, sem `.git`, sem os dados de produção, sem logs, sem credenciais e sem os binários gerados. O projeto original e os serviços em operação não receberam alterações.
