# Radar Gear

Código-fonte exportável do Radar de Periféricos. O painel acompanha produtos por modelo, compara lojas e vendedores, registra disponibilidade, cupons e condições, exibe gráficos e guarda preferências e decisões por conta.

## Publicar o código no GitHub

Extraia o ZIP. Com o GitHub Desktop, adicione a pasta como repositório local, faça o primeiro commit e selecione **Publish repository** com **Keep this code private** marcado. Alternativamente, execute os comandos dentro da pasta extraída com o GitHub CLI já autenticado.

```sh
git init -b main
git add .
git status --short
git commit -m "Exportação inicial do Radar Gear"
gh repo create radar-gear --private --source=. --push
```

Confira o estado antes do commit. A cópia começa com um histórico Git novo. A configuração local, os segredos e os dados reais ficam fora do repositório. O GitHub armazena o código. Para executar o Worker e o banco de dados, siga a configuração de hospedagem abaixo.

[GitHub Desktop](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop) · [GitHub CLI e Git](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

## Compilar e configurar a hospedagem

Requer Node.js 22 ou mais recente. O código do Radar usa APIs nativas do Worker e do navegador. Os scripts de desenvolvimento e deploy chamam Wrangler 4.

1. Execute `npm run check` para compilar o Worker em `dist/server/index.js`.
2. Para hospedar em Cloudflare Workers, copie `wrangler.example.toml` para `wrangler.toml`. Crie um D1 dedicado, informe seu ID e mantenha o binding com o nome `DB`. Aponte o Worker para um hostname configurado em sua conta e protegido pelo Cloudflare Access. O modelo mantém os endereços públicos de desenvolvimento e preview desativados.
3. Crie uma aplicação no Cloudflare Access e defina a política de acesso dos usuários. Preencha o domínio da equipe e o identificador de audiência em `wrangler.toml`. O backend verifica a assinatura e as informações do JWT antes de aceitar a identidade. Use o modo `cloudflare-access` fora do ChatGPT.
4. Configure `RADAR_OWNER_EMAIL` e, se o serviço de pesquisas for externo, `RADAR_JOB_TOKEN` como segredos do Worker pelo painel ou por `npx wrangler@4 secret put NOME_DA_VARIAVEL`. Gere um valor aleatório independente para cada ambiente. Para desenvolvimento, use `.dev.vars`, ignorado pelo Git, com valores próprios. O login requer uma credencial de teste válida ou uma implantação de homologação protegida.
5. Aplique as migrações com `npx wrangler@4 d1 migrations apply radar-gear --remote`, usando o nome do banco que configurou, e publique com `npm run deploy` quando estiver pronto. Antes de conectar o domínio de produção, teste uma conta administradora, uma conta comum e requisições sem autenticação em homologação.

[Cloudflare Access e validação do JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) · [Segredos do Worker](https://developers.cloudflare.com/workers/configuration/secrets/) · [Migrações D1](https://developers.cloudflare.com/d1/reference/migrations/)

## O que migra e o que precisa ser conectado

| Área | Situação na exportação |
| --- | --- |
| Interface, backend, painel privado e destaques | Código integral do aplicativo. Alterações, perfis, decisões, busca de produto por link, gráficos, filtros e cupons continuam no código. |
| Banco de dados e histórico | Migrações de esquema e amostra de observações públicas. O banco hospedado, o histórico real, os cadastros e as preferências precisam de migração separada. |
| Login e contas | Adaptador de Cloudflare Access fornecido. Configure o provedor e as políticas de acesso. Os usuários recebem novos identificadores no provedor externo. |
| Lojas e importação de links | Adaptador HTTP de varejistas compatíveis incluído. A leitura depende das páginas de cada loja, de seus metadados e das regras de acesso. Cobertura ampla de mercado depende do serviço de pesquisa. |
| Monitoramento, estoque e cupons | APIs de leitura e gravação incluídas. A consulta ampla do Site original roda em uma automação externa ao código, que precisa ser substituída por um job de pesquisa. |
| Alertas e agendamento | O aplicativo contém histórico das consultas e mudanças de preço. Alertas de conversa, frequência da pesquisa e regras de notificação pertencem ao serviço agendado. Configure o canal e a cadência, atualmente a cada duas horas no Radar original, no ambiente externo. |

### Migrar dados, se necessário

O ZIP contém uma amostra pública para validar o comportamento do painel. O dump da produção fica fora do GitHub. Se você tiver acesso administrativo ao D1 original, exporte os dados em um canal privado e importe em um D1 de homologação primeiro. Se o banco estiver gerenciado pelo ChatGPT Sites e você tiver acesso apenas pelo MCP, verifique com o provedor a possibilidade de uma exportação integral. A leitura pelo MCP é limitada à conta e não serve como backup completo do D1.

Preserve chaves de produto ao migrar ofertas, histórico e destaques. Remapeie `account_records.account` para o identificador do mesmo titular no novo provedor, preservando o marcador de proprietário usado nos dados. Importe o estado das migrações ou as linhas de negócio conforme o método de migração escolhido para evitar duplicação. Valide quantidades e uma amostra de histórico e permissões antes de abrir a hospedagem externa aos usuários. [Comandos de exportação e importação D1](https://developers.cloudflare.com/d1/wrangler/commands/d1/)

### Reconectar pesquisa e alertas

Mantenha `/mcp` protegido. Configure uma política de acesso de serviço própria para esse caminho e um token de serviço do Cloudflare Access. O job envia os cabeçalhos de serviço do Access e `Authorization: Bearer <RADAR_JOB_TOKEN>` ao Worker. O token do job, quando configurado, autentica apenas o protocolo MCP. A leitura técnica do job exclui o perfil e as decisões do usuário. Use o host HTTPS protegido e armazene as credenciais no ambiente do agendador.

O job precisa ler os SKUs ativos por `ler_radar`, pesquisar e validar URLs diretas, modelo, estoque e preços, e gravar com `registrar_consulta`. Use `identificar_produto` quando houver evidência suficiente. Grave observações anteriores com a data original. Diferencie cupom geral de benefício condicionado a cartão, assinatura ou conta. Registre falhas de cobertura e envie alertas apenas pelas condições que você configurar. O importador no cadastro consulta o link fornecido. Uma busca imediata em múltiplas lojas após cada cadastro também requer um serviço de pesquisa integrado.

O modo `chatgpt-sites` é reservado a um ambiente em que a infraestrutura do Sites autentica e controla os cabeçalhos de identidade. Em uma origem externa, use `cloudflare-access`.
