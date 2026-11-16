# Radar Gear

Código-fonte exportável do Radar de Periféricos. O painel acompanha produtos por modelo, compara lojas e vendedores e registra disponibilidade, cupons e condições de compra. Também mostra gráficos e guarda as preferências e decisões de cada conta.

## Publicar o código no GitHub

Extraia o ZIP. No GitHub Desktop, adicione a pasta como repositório local, faça o primeiro commit e clique em **Publish repository** com a opção **Keep this code private** marcada. Se preferir o terminal, rode os comandos abaixo dentro da pasta extraída, com o GitHub CLI já autenticado.

```sh
git init -b main
git add .
git status --short
git commit -m "Exportação inicial do Radar Gear"
gh repo create radar-gear --private --source=. --push
```

Use o `git status --short` para conferir o que vai entrar antes do commit. A cópia começa com um histórico Git novo, e a configuração local, os segredos e os dados reais ficam fora do repositório. O GitHub guarda só o código. Para rodar o Worker e o banco de dados, siga a configuração de hospedagem abaixo.

[GitHub Desktop](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop) · [GitHub CLI e Git](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

## Compilar e configurar a hospedagem

Precisa do Node.js 22 ou mais recente. O código usa APIs nativas do Worker e do navegador, e os scripts de desenvolvimento e deploy chamam o Wrangler 4.

1. Rode `npm run check` para compilar o Worker em `dist/server/index.js`.
2. Para hospedar no Cloudflare Workers, copie `wrangler.example.toml` para `wrangler.toml`. Crie um D1 só para o projeto, coloque o ID dele no arquivo e mantenha o binding com o nome `DB`. O modelo publica no endereço `workers.dev` da sua conta, com os previews desativados.
3. O login é do próprio site, com e-mail e senha. As senhas ficam no D1 com hash PBKDF2 e salt, as sessões duram 30 dias em cookie `HttpOnly`, e cinco senhas erradas bloqueiam o e-mail por 15 minutos. Quem não entra usa o Radar como visitante, só para leitura. Não há envio de e-mail: se alguém esquecer a senha, um administrador gera uma senha temporária em **Contas**.
4. Configure `RADAR_OWNER_EMAIL` como segredo do Worker (um ou mais e-mails de administrador, separados por vírgula), e também `RADAR_JOB_TOKEN` se o serviço de pesquisa for externo. Dá para fazer pelo painel ou com `npx wrangler@4 secret put NOME_DA_VARIAVEL`. Gere um valor aleatório diferente para cada ambiente. Em desenvolvimento, use um `.dev.vars` com valores próprios (o Git ignora esse arquivo).
5. Aplique as migrações com `npx wrangler@4 d1 migrations apply radar-gear --remote`, trocando `radar-gear` pelo nome do banco que você configurou. Quando estiver pronto, publique com `npm run deploy`. Antes de ligar o domínio de produção, teste em homologação uma conta administradora, uma conta comum e requisições sem autenticação.

[Segredos do Worker](https://developers.cloudflare.com/workers/configuration/secrets/) · [Migrações D1](https://developers.cloudflare.com/d1/reference/migrations/)

## O que migra e o que precisa ser conectado

| Área | Situação na exportação |
| --- | --- |
| Interface, backend, painel privado e destaques | Vão inteiros no código. Alterações, perfis, decisões, busca de produto por link, gráficos, filtros e cupons continuam no código. |
| Banco de dados e histórico | O código traz as migrações de esquema e uma amostra de observações públicas. O banco hospedado, o histórico real, os cadastros e as preferências precisam ser migrados à parte. |
| Login e contas | Cadastro e login com e-mail e senha no próprio site, sem provedor externo. Os usuários recebem identificadores novos ao se cadastrar. |
| Lojas e importação de links | Tem um adaptador HTTP para os varejistas compatíveis. A leitura depende das páginas, dos metadados e das regras de acesso de cada loja. Para cobrir o mercado todo, é preciso o serviço de pesquisa. |
| Monitoramento, estoque e cupons | As APIs de leitura e gravação estão incluídas. A consulta ampla do Radar original roda numa automação fora do código, que precisa ser trocada por um job de pesquisa. |
| Alertas e agendamento | O aplicativo guarda o histórico das consultas e das mudanças de preço. Alertas de conversa, frequência da pesquisa e regras de notificação ficam no serviço agendado. Configure o canal e a frequência no ambiente externo. No Radar original, a pesquisa roda a cada duas horas. |

### Migrar dados, se necessário

O ZIP traz uma amostra pública para testar o comportamento do painel. O dump da produção fica fora do GitHub. Se você tem acesso de administrador ao D1 original, exporte os dados por um canal privado e importe primeiro num D1 de homologação. Se o banco é gerenciado pelo ChatGPT Sites e você só acessa pelo MCP, pergunte ao provedor se dá para exportar tudo. A leitura pelo MCP fica limitada à conta e não substitui um backup completo do D1.

Ao migrar ofertas, histórico e destaques, mantenha as chaves de produto. Troque `account_records.account` pelo identificador do mesmo titular no novo provedor, sem perder o marcador de proprietário usado nos dados. Para não duplicar nada, importe o estado das migrações ou as linhas de negócio, conforme o método de migração que você escolher. Antes de abrir a hospedagem externa aos usuários, confira as quantidades e uma amostra do histórico e das permissões. [Comandos de exportação e importação D1](https://developers.cloudflare.com/d1/wrangler/commands/d1/)

### Reconectar pesquisa e alertas

O job manda ao Worker `Authorization: Bearer <RADAR_JOB_TOKEN>` no caminho `/mcp`. Quando configurado, o token do job autentica só o protocolo MCP, e a leitura técnica do job não inclui o perfil nem as decisões do usuário. Guarde o token no ambiente do agendador.

O job precisa ler os SKUs ativos com `ler_radar` e gravar o resultado com `registrar_consulta`. No meio disso, ele pesquisa e valida as URLs diretas, o modelo, o estoque e os preços. Quando houver evidência suficiente, use `identificar_produto`. Observações antigas devem ser gravadas com a data original. Separe cupom geral de benefício que depende de cartão, assinatura ou conta. Registre as falhas de cobertura e só mande alertas nas condições que você configurar. O importador do cadastro consulta o link informado. Para buscar em várias lojas logo depois de cada cadastro, também é preciso integrar um serviço de pesquisa.